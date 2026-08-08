import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from './patients.service';

describe('PatientsService', () => {
  interface PatientUpdateArguments {
    where: { id: string };
    data: {
      dateOfBirth?: Date | null;
      phoneNumber?: string | null;
      emergencyContact?: string | null;
      timeZone?: string;
      updatedAt?: Date;
    };
  }

  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const updatedAt = new Date('2026-01-02T00:00:00.000Z');
  const profileRecord = {
    id: 'patient-1',
    userId: 'user-1',
    dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    phoneNumber: '+961 1 234567',
    emergencyContact: 'Family +961 3 123456',
    timeZone: 'Asia/Beirut',
    createdAt,
    updatedAt,
    user: {
      name: 'Test Patient',
      email: 'patient@example.com',
    },
  };

  const patientFindUnique = jest.fn();
  const transactionPatientFindUnique = jest.fn();
  let patientUpdateArguments: PatientUpdateArguments | undefined;
  let patientUpdateResult: unknown;
  const transactionPatientUpdate = jest.fn(
    (arguments_: PatientUpdateArguments): Promise<unknown> => {
      patientUpdateArguments = arguments_;
      return Promise.resolve(patientUpdateResult);
    },
  );
  const transactionUserUpdate = jest.fn();
  const transactionMedicationLogDeleteMany = jest.fn();
  const transaction = {
    patient: {
      findUnique: transactionPatientFindUnique,
      update: transactionPatientUpdate,
    },
    user: {
      update: transactionUserUpdate,
    },
    medicationLog: {
      deleteMany: transactionMedicationLogDeleteMany,
    },
  };
  const runTransaction = jest.fn(
    (callback: (client: typeof transaction) => unknown) =>
      Promise.resolve(callback(transaction)),
  );
  const prisma = {
    patient: {
      findUnique: patientFindUnique,
    },
    $transaction: runTransaction,
  };
  const service = new PatientsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    patientUpdateArguments = undefined;
    patientUpdateResult = undefined;
  });

  it('returns a flattened profile joined with the user', async () => {
    patientFindUnique.mockResolvedValue(profileRecord);

    await expect(service.getMyProfile('user-1')).resolves.toEqual({
      id: 'patient-1',
      userId: 'user-1',
      name: 'Test Patient',
      email: 'patient@example.com',
      dateOfBirth: '1990-01-01',
      phoneNumber: '+961 1 234567',
      emergencyContact: 'Family +961 3 123456',
      timeZone: 'Asia/Beirut',
      createdAt,
      updatedAt,
    });
    expect(patientFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('returns 404 when the authenticated user has no patient profile', async () => {
    patientFindUnique.mockResolvedValue(null);

    await expect(service.getMyProfile('user-1')).rejects.toEqual(
      new NotFoundException('Patient profile not found'),
    );
  });

  it('updates user and patient data in one transaction', async () => {
    transactionPatientFindUnique.mockResolvedValue({ id: 'patient-1' });
    patientUpdateResult = {
      ...profileRecord,
      phoneNumber: null,
      user: { ...profileRecord.user, name: 'Updated Patient' },
    };

    const result = await service.updateMyProfile('user-1', {
      name: 'Updated Patient',
      phoneNumber: null,
      dateOfBirth: '1991-02-03',
    });

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(transactionUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Updated Patient' },
    });
    expect(transactionPatientUpdate).toHaveBeenCalledTimes(1);
    expect(patientUpdateArguments?.where).toEqual({ id: 'patient-1' });
    expect(patientUpdateArguments?.data).toEqual(
      expect.objectContaining({
        dateOfBirth: new Date('1991-02-03'),
        phoneNumber: null,
      }),
    );
    expect(result.name).toBe('Updated Patient');
    expect(result.phoneNumber).toBeNull();
  });

  it('touches the flattened profile timestamp for a name-only update', async () => {
    transactionPatientFindUnique.mockResolvedValue({
      id: 'patient-1',
      timeZone: profileRecord.timeZone,
    });
    patientUpdateResult = {
      ...profileRecord,
      user: { ...profileRecord.user, name: 'Updated Patient' },
    };

    await service.updateMyProfile('user-1', { name: 'Updated Patient' });

    expect(patientUpdateArguments?.data.updatedAt).toBeInstanceOf(Date);
  });

  it('reconciles only pending derived logs when the timezone changes', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
    transactionPatientFindUnique.mockResolvedValue({
      id: 'patient-1',
      timeZone: 'UTC',
    });
    patientUpdateResult = {
      ...profileRecord,
      timeZone: 'Asia/Beirut',
    };

    try {
      await service.updateMyProfile('user-1', { timeZone: 'Asia/Beirut' });

      expect(transactionMedicationLogDeleteMany).toHaveBeenCalledWith({
        where: {
          status: 'PENDING',
          medication: { patientId: 'patient-1' },
          scheduledFor: {
            gte: new Date('2026-08-07T00:00:00.000Z'),
            lt: new Date('2026-08-10T00:00:00.000Z'),
          },
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('accepts a birth date that is today in the patient timezone', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-08T22:00:00.000Z'));
    transactionPatientFindUnique.mockResolvedValue({
      id: 'patient-1',
      timeZone: 'Asia/Beirut',
    });
    patientUpdateResult = {
      ...profileRecord,
      dateOfBirth: new Date('2026-08-09T00:00:00.000Z'),
    };

    try {
      await expect(
        service.updateMyProfile('user-1', { dateOfBirth: '2026-08-09' }),
      ).resolves.toEqual(
        expect.objectContaining({ dateOfBirth: '2026-08-09' }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects a birth date after today in the patient timezone', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-09T01:00:00.000Z'));
    transactionPatientFindUnique.mockResolvedValue({
      id: 'patient-1',
      timeZone: 'America/New_York',
    });

    try {
      await expect(
        service.updateMyProfile('user-1', { dateOfBirth: '2026-08-09' }),
      ).rejects.toEqual(
        new BadRequestException(
          "dateOfBirth cannot be in the future in the patient's timezone",
        ),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('retries a serializable profile conflict against fresh state', async () => {
    runTransaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Write conflict', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );
    transactionPatientFindUnique.mockResolvedValue({
      id: 'patient-1',
      timeZone: profileRecord.timeZone,
    });
    patientUpdateResult = profileRecord;

    const result = await service.updateMyProfile('user-1', {
      phoneNumber: '+961 1 999999',
    });

    expect(result.id).toBe(profileRecord.id);
    expect(runTransaction).toHaveBeenCalledTimes(2);
  });
});
