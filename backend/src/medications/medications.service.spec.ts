import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MedicationLogStatus, MedicationStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { MedicationsService } from './medications.service';

describe('MedicationsService', () => {
  const patientFindUnique = jest.fn();
  const patientUpdateMany = jest.fn();
  const medicationFindMany = jest.fn();
  const medicationFindFirst = jest.fn();
  const medicationCreate = jest.fn();
  const medicationUpdate = jest.fn();
  const medicationDeleteMany = jest.fn();
  const scheduleDeleteMany = jest.fn();
  const scheduleUpsert = jest.fn();
  const logFindFirst = jest.fn();
  const logFindMany = jest.fn();
  const logUpdate = jest.fn();
  const logUpdateMany = jest.fn();
  const logDeleteMany = jest.fn();
  const logCreateMany = jest.fn();

  const transaction = {
    patient: {
      findUnique: patientFindUnique,
      updateMany: patientUpdateMany,
    },
    medication: {
      findMany: medicationFindMany,
      findFirst: medicationFindFirst,
      create: medicationCreate,
      update: medicationUpdate,
      deleteMany: medicationDeleteMany,
    },
    medicationSchedule: {
      deleteMany: scheduleDeleteMany,
      upsert: scheduleUpsert,
    },
    medicationLog: {
      findFirst: logFindFirst,
      findMany: logFindMany,
      update: logUpdate,
      updateMany: logUpdateMany,
      deleteMany: logDeleteMany,
      createMany: logCreateMany,
    },
  };

  const executeTransaction = (
    callback: (client: typeof transaction) => unknown,
  ) => Promise.resolve(callback(transaction));

  const prisma = {
    $transaction: jest.fn(executeTransaction),
  };

  let service: MedicationsService;

  const createDto: CreateMedicationDto = {
    name: 'Metformin',
    dosage: '500 mg',
    instructions: 'With food',
    startDate: '2026-08-01',
    endDate: null,
    schedules: [
      { scheduledTime: '08:00', frequency: 'DAILY' },
      { scheduledTime: '20:00', frequency: 'DAILY' },
    ],
  };

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(executeTransaction);
    jest.setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
    patientFindUnique.mockResolvedValue({
      id: 'patient-1',
      timeZone: 'UTC',
    });
    patientUpdateMany.mockResolvedValue({ count: 1 });
    logFindMany.mockResolvedValue([]);
    logCreateMany.mockResolvedValue({ count: 0 });
    logUpdateMany.mockResolvedValue({ count: 0 });
    medicationUpdate.mockResolvedValue({});
    scheduleDeleteMany.mockResolvedValue({ count: 1 });
    scheduleUpsert.mockResolvedValue({});
    logDeleteMany.mockResolvedValue({ count: 1 });

    service = new MedicationsService(prisma as unknown as PrismaService);
  });

  it('batch creates one idempotent pending log for each DAILY schedule', async () => {
    const createdMedication = {
      id: 'medication-1',
      status: MedicationStatus.ACTIVE,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: null,
      schedules: [
        {
          id: 'schedule-1',
          scheduledTime: '08:00',
          createdAt: new Date('2026-08-08T00:00:00.000Z'),
        },
        {
          id: 'schedule-2',
          scheduledTime: '20:00',
          createdAt: new Date('2026-08-08T00:00:00.000Z'),
        },
      ],
    };
    const response = { ...createdMedication, logs: [] };
    medicationCreate.mockResolvedValue(createdMedication);
    medicationFindFirst.mockResolvedValue(response);

    await expect(service.create('user-1', createDto)).resolves.toEqual({
      ...response,
      timeZone: 'UTC',
    });

    expect(patientFindUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: {
        id: true,
        timeZone: true,
      },
    });
    expect(medicationCreate).toHaveBeenCalledWith({
      data: {
        patientId: 'patient-1',
        name: 'Metformin',
        dosage: '500 mg',
        instructions: 'With food',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: null,
        schedules: {
          create: createDto.schedules,
        },
      },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        schedules: {
          select: {
            id: true,
            scheduledTime: true,
            createdAt: true,
          },
        },
      },
    });
    expect(logCreateMany).toHaveBeenCalledTimes(1);
    expect(logCreateMany).toHaveBeenCalledWith({
      data: [
        {
          medicationId: 'medication-1',
          scheduleId: 'schedule-1',
          scheduleDate: new Date('2026-08-08T00:00:00.000Z'),
          scheduledFor: new Date('2026-08-08T08:00:00.000Z'),
          status: MedicationLogStatus.PENDING,
        },
        {
          medicationId: 'medication-1',
          scheduleId: 'schedule-2',
          scheduleDate: new Date('2026-08-08T00:00:00.000Z'),
          scheduledFor: new Date('2026-08-08T20:00:00.000Z'),
          status: MedicationLogStatus.PENDING,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('generates logs only for active medications inside their date range', async () => {
    medicationFindMany
      .mockResolvedValueOnce([
        {
          id: 'active',
          status: MedicationStatus.ACTIVE,
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2026-08-08T00:00:00.000Z'),
          schedules: [
            {
              id: 'schedule-active',
              scheduledTime: '09:00',
              createdAt: new Date('2026-08-08T00:00:00.000Z'),
            },
          ],
        },
        {
          id: 'completed',
          status: MedicationStatus.COMPLETED,
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: null,
          schedules: [{ id: 'schedule-completed', scheduledTime: '10:00' }],
        },
        {
          id: 'future',
          status: MedicationStatus.ACTIVE,
          startDate: new Date('2026-08-09T00:00:00.000Z'),
          endDate: null,
          schedules: [
            {
              id: 'schedule-future',
              scheduledTime: '11:00',
              createdAt: new Date('2026-08-08T00:00:00.000Z'),
            },
          ],
        },
      ])
      .mockResolvedValueOnce([{ id: 'active' }]);

    await expect(service.findAll('user-1')).resolves.toEqual([
      { id: 'active', timeZone: 'UTC' },
    ]);

    expect(logCreateMany).toHaveBeenCalledTimes(1);
    expect(medicationFindMany).toHaveBeenLastCalledWith({
      where: { patientId: 'patient-1' },
      include: {
        schedules: { orderBy: { scheduledTime: 'asc' } },
        logs: {
          where: {
            medication: { patientId: 'patient-1' },
          },
          orderBy: { scheduledFor: 'desc' },
          take: 30,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('backfills missed DAILY doses only from the schedule creation date', async () => {
    medicationFindMany
      .mockResolvedValueOnce([
        {
          id: 'medication-1',
          status: MedicationStatus.ACTIVE,
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: null,
          schedules: [
            {
              id: 'schedule-1',
              scheduledTime: '08:00',
              createdAt: new Date('2026-08-05T12:00:00.000Z'),
            },
          ],
        },
      ])
      .mockResolvedValueOnce([]);
    await service.findAll('user-1');

    expect(logCreateMany).toHaveBeenCalledWith({
      data: [
        {
          medicationId: 'medication-1',
          scheduleId: 'schedule-1',
          scheduleDate: new Date('2026-08-05T00:00:00.000Z'),
          scheduledFor: new Date('2026-08-05T08:00:00.000Z'),
          status: MedicationLogStatus.MISSED,
        },
        {
          medicationId: 'medication-1',
          scheduleId: 'schedule-1',
          scheduleDate: new Date('2026-08-06T00:00:00.000Z'),
          scheduledFor: new Date('2026-08-06T08:00:00.000Z'),
          status: MedicationLogStatus.MISSED,
        },
        {
          medicationId: 'medication-1',
          scheduleId: 'schedule-1',
          scheduleDate: new Date('2026-08-07T00:00:00.000Z'),
          scheduledFor: new Date('2026-08-07T08:00:00.000Z'),
          status: MedicationLogStatus.MISSED,
        },
        {
          medicationId: 'medication-1',
          scheduleId: 'schedule-1',
          scheduleDate: new Date('2026-08-08T00:00:00.000Z'),
          scheduledFor: new Date('2026-08-08T08:00:00.000Z'),
          status: MedicationLogStatus.PENDING,
        },
      ],
      skipDuplicates: true,
    });
    expect(logUpdateMany).toHaveBeenCalledWith({
      where: {
        medicationId: { in: ['medication-1'] },
        medication: { patientId: 'patient-1' },
        status: MedicationLogStatus.PENDING,
        scheduledFor: {
          lt: new Date('2026-08-08T00:00:00.000Z'),
        },
      },
      data: {
        status: MedicationLogStatus.MISSED,
        takenAt: null,
      },
    });
  });

  it('relinks an unambiguous legacy outcome before creating derived identities', async () => {
    medicationFindMany
      .mockResolvedValueOnce([
        {
          id: 'medication-1',
          status: MedicationStatus.ACTIVE,
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: null,
          schedules: [
            {
              id: 'schedule-1',
              scheduledTime: '08:00',
              createdAt: new Date('2026-08-08T00:00:00.000Z'),
            },
          ],
        },
      ])
      .mockResolvedValueOnce([]);
    logFindMany.mockResolvedValue([
      {
        id: 'legacy-taken-log',
        medicationId: 'medication-1',
        scheduleId: null,
        scheduleDate: null,
        scheduledFor: new Date('2026-08-08T08:00:00.000Z'),
      },
    ]);
    logUpdate.mockResolvedValue({
      id: 'legacy-taken-log',
      status: MedicationLogStatus.TAKEN,
    });

    await service.findAll('user-1');

    expect(logUpdate).toHaveBeenCalledWith({
      where: {
        id: 'legacy-taken-log',
        medicationId: 'medication-1',
        medication: { patientId: 'patient-1' },
      },
      data: {
        scheduleId: 'schedule-1',
        scheduleDate: new Date('2026-08-08T00:00:00.000Z'),
      },
    });
    expect(logCreateMany).toHaveBeenCalledWith({
      data: [
        {
          medicationId: 'medication-1',
          scheduleId: 'schedule-1',
          scheduleDate: new Date('2026-08-08T00:00:00.000Z'),
          scheduledFor: new Date('2026-08-08T08:00:00.000Z'),
          status: MedicationLogStatus.PENDING,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('pre-detects an occupied derived identity instead of triggering P2002 while relinking', async () => {
    medicationFindMany
      .mockResolvedValueOnce([
        {
          id: 'medication-1',
          status: MedicationStatus.ACTIVE,
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: null,
          schedules: [
            {
              id: 'schedule-1',
              scheduledTime: '08:00',
              createdAt: new Date('2026-08-08T00:00:00.000Z'),
            },
          ],
        },
      ])
      .mockResolvedValueOnce([]);
    logFindMany.mockResolvedValue([
      {
        id: 'legacy-log',
        medicationId: 'medication-1',
        scheduleId: null,
        scheduleDate: null,
        scheduledFor: new Date('2026-08-08T08:00:00.000Z'),
      },
      {
        id: 'derived-log',
        medicationId: 'medication-1',
        scheduleId: 'schedule-1',
        scheduleDate: new Date('2026-08-08T00:00:00.000Z'),
        scheduledFor: new Date('2026-08-08T08:00:00.000Z'),
      },
    ]);

    await service.findAll('user-1');

    expect(logUpdate).not.toHaveBeenCalled();
    expect(logCreateMany).toHaveBeenCalledWith({
      data: [
        {
          medicationId: 'medication-1',
          scheduleId: 'schedule-1',
          scheduleDate: new Date('2026-08-08T00:00:00.000Z'),
          scheduledFor: new Date('2026-08-08T08:00:00.000Z'),
          status: MedicationLogStatus.PENDING,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('does not reveal a medication owned by another patient', async () => {
    medicationFindFirst.mockResolvedValue(null);

    await expect(service.findOne('user-1', 'other-medication')).rejects.toEqual(
      new NotFoundException('Medication not found'),
    );
    expect(medicationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'other-medication',
          patientId: 'patient-1',
        },
      }),
    );
    expect(logCreateMany).not.toHaveBeenCalled();
  });

  it('transactionally replaces schedules and only rebuilds pending logs', async () => {
    patientFindUnique.mockResolvedValue({
      id: 'patient-1',
      timeZone: 'Asia/Beirut',
    });
    medicationFindFirst
      .mockResolvedValueOnce({
        id: 'medication-1',
        status: MedicationStatus.ACTIVE,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: null,
        schedules: [
          {
            id: 'removed-schedule',
            scheduledTime: '06:00',
            frequency: 'DAILY',
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 'medication-1',
        status: MedicationStatus.ACTIVE,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: null,
        schedules: [
          {
            id: 'new-schedule',
            scheduledTime: '07:30',
            createdAt: new Date('2026-08-08T00:00:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({ id: 'medication-1', schedules: [], logs: [] });

    await service.update('user-1', 'medication-1', {
      schedules: [{ scheduledTime: '07:30', frequency: 'DAILY' }],
    });

    expect(scheduleDeleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['removed-schedule'] },
        medicationId: 'medication-1',
        medication: { patientId: 'patient-1' },
      },
    });
    expect(scheduleUpsert).toHaveBeenCalledWith({
      where: {
        medicationId_scheduledTime: {
          medicationId: 'medication-1',
          scheduledTime: '07:30',
        },
      },
      update: { frequency: 'DAILY' },
      create: {
        medicationId: 'medication-1',
        scheduledTime: '07:30',
        frequency: 'DAILY',
      },
    });
    expect(logDeleteMany).toHaveBeenCalledWith({
      where: {
        scheduleId: { in: ['removed-schedule'] },
        scheduleDate: new Date('2026-08-08T00:00:00.000Z'),
        medication: { patientId: 'patient-1' },
        status: MedicationLogStatus.PENDING,
      },
    });
    expect(logCreateMany).toHaveBeenCalledTimes(1);
  });

  it('preserves an unchanged schedule identity so an existing TAKEN dose is not duplicated', async () => {
    const unchangedSchedule = {
      id: 'existing-schedule',
      scheduledTime: '08:00',
      frequency: 'DAILY',
      createdAt: new Date('2026-08-08T00:00:00.000Z'),
    };
    const medication = {
      id: 'medication-1',
      status: MedicationStatus.ACTIVE,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: null,
      schedules: [unchangedSchedule],
    };
    const takenLog = {
      id: 'taken-log',
      scheduleId: 'existing-schedule',
      scheduleDate: new Date('2026-08-08T00:00:00.000Z'),
      status: MedicationLogStatus.TAKEN,
    };
    medicationFindFirst
      .mockResolvedValueOnce(medication)
      .mockResolvedValueOnce(medication)
      .mockResolvedValueOnce({ ...medication, logs: [takenLog] });

    const response = await service.update('user-1', 'medication-1', {
      name: 'Updated name',
      schedules: [{ scheduledTime: '08:00', frequency: 'DAILY' }],
    });

    expect(scheduleUpsert).toHaveBeenCalledWith({
      where: {
        medicationId_scheduledTime: {
          medicationId: 'medication-1',
          scheduledTime: '08:00',
        },
      },
      update: { frequency: 'DAILY' },
      create: {
        medicationId: 'medication-1',
        scheduledTime: '08:00',
        frequency: 'DAILY',
      },
    });
    expect(scheduleDeleteMany).not.toHaveBeenCalled();
    expect(logDeleteMany).not.toHaveBeenCalled();
    expect(logCreateMany).toHaveBeenCalledWith({
      data: [
        {
          medicationId: 'medication-1',
          scheduleId: 'existing-schedule',
          scheduleDate: new Date('2026-08-08T00:00:00.000Z'),
          scheduledFor: new Date('2026-08-08T08:00:00.000Z'),
          status: MedicationLogStatus.PENDING,
        },
      ],
      skipDuplicates: true,
    });
    expect(response.logs).toEqual([takenLog]);
    expect(response.timeZone).toBe('UTC');
  });

  it('uses the canonical zone boundaries when clearing today pending logs', async () => {
    patientFindUnique.mockResolvedValue({
      id: 'patient-1',
      timeZone: 'Asia/Beirut',
    });
    medicationFindFirst
      .mockResolvedValueOnce({
        id: 'medication-1',
        status: MedicationStatus.ACTIVE,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: null,
        schedules: [
          {
            id: 'schedule-1',
            scheduledTime: '08:00',
            frequency: 'DAILY',
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 'medication-1',
        status: MedicationStatus.CANCELLED,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: null,
        schedules: [
          {
            id: 'schedule-1',
            scheduledTime: '08:00',
            createdAt: new Date('2026-08-08T00:00:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({ id: 'medication-1', schedules: [], logs: [] });

    await service.update('user-1', 'medication-1', {
      status: MedicationStatus.CANCELLED,
    });

    expect(logDeleteMany).toHaveBeenCalledWith({
      where: {
        medicationId: 'medication-1',
        medication: { patientId: 'patient-1' },
        status: MedicationLogStatus.PENDING,
        scheduledFor: {
          gte: new Date('2026-08-07T21:00:00.000Z'),
          lt: new Date('2026-08-08T21:00:00.000Z'),
        },
      },
    });
    expect(logCreateMany).not.toHaveBeenCalled();
  });

  it('rejects an update whose resulting date range is invalid', async () => {
    medicationFindFirst.mockResolvedValueOnce({
      id: 'medication-1',
      status: MedicationStatus.ACTIVE,
      startDate: new Date('2026-08-10T00:00:00.000Z'),
      endDate: null,
    });

    await expect(
      service.update('user-1', 'medication-1', {
        endDate: '2026-08-09',
      }),
    ).rejects.toEqual(
      new BadRequestException('endDate must be on or after startDate'),
    );
    expect(medicationUpdate).not.toHaveBeenCalled();
  });

  it.each([MedicationStatus.COMPLETED, MedicationStatus.CANCELLED])(
    'does not reactivate terminal medication status %s and invent inactive history',
    async (status) => {
      medicationFindFirst.mockResolvedValueOnce({
        id: 'medication-1',
        status,
        startDate: new Date('2026-07-01T00:00:00.000Z'),
        endDate: null,
        schedules: [],
      });

      await expect(
        service.update('user-1', 'medication-1', {
          status: MedicationStatus.ACTIVE,
        }),
      ).rejects.toEqual(
        new BadRequestException(
          'Completed or cancelled medications cannot be reactivated',
        ),
      );
      expect(medicationUpdate).not.toHaveBeenCalled();
      expect(logCreateMany).not.toHaveBeenCalled();
    },
  );

  it('scopes a dose status update and sets takenAt only for TAKEN', async () => {
    logFindFirst.mockResolvedValue({
      id: 'log-1',
      medicationId: 'medication-1',
      takenAt: null,
    });
    logUpdate.mockResolvedValue({
      id: 'log-1',
      status: MedicationLogStatus.TAKEN,
    });

    await service.updateLogStatus('user-1', 'medication-1', 'log-1', {
      status: MedicationLogStatus.TAKEN,
    });

    expect(logFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'log-1',
        medicationId: 'medication-1',
        medication: { patientId: 'patient-1' },
      },
    });
    expect(logUpdate).toHaveBeenCalledWith({
      where: {
        id: 'log-1',
        medicationId: 'medication-1',
        medication: { patientId: 'patient-1' },
      },
      data: {
        status: MedicationLogStatus.TAKEN,
        takenAt: new Date('2026-08-08T12:00:00.000Z'),
      },
    });
  });

  it.each([
    MedicationLogStatus.PENDING,
    MedicationLogStatus.MISSED,
    MedicationLogStatus.SKIPPED,
  ])('clears takenAt when a dose is reset to %s', async (status) => {
    logFindFirst.mockResolvedValue({
      id: 'log-1',
      medicationId: 'medication-1',
      takenAt: new Date(2026, 7, 8, 10, 0, 0),
    });
    logUpdate.mockResolvedValue({});

    await service.updateLogStatus('user-1', 'medication-1', 'log-1', {
      status,
    });

    expect(logUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status,
          takenAt: null,
        },
      }),
    );
  });

  it('returns 404 when a scoped delete does not affect a row', async () => {
    medicationDeleteMany.mockResolvedValue({ count: 0 });

    await expect(service.remove('user-1', 'missing')).rejects.toEqual(
      new NotFoundException('Medication not found'),
    );
    expect(medicationDeleteMany).toHaveBeenCalledWith({
      where: {
        id: 'missing',
        patientId: 'patient-1',
      },
    });
    expect(patientUpdateMany).not.toHaveBeenCalled();
  });

  it('uses fallback UTC without persisting it when the header is omitted', async () => {
    patientFindUnique.mockResolvedValue({
      id: 'patient-1',
      timeZone: null,
    });
    medicationFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(service.findAll('user-1')).resolves.toEqual([]);

    expect(patientUpdateMany).not.toHaveBeenCalled();
    expect(logDeleteMany).toHaveBeenCalledWith({
      where: {
        status: MedicationLogStatus.PENDING,
        scheduleDate: null,
        medication: { patientId: 'patient-1' },
      },
    });
  });

  it('defers missed backfill under provisional UTC and rebuilds after zone initialization', async () => {
    const medication = {
      id: 'medication-1',
      status: MedicationStatus.ACTIVE,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: null,
      schedules: [
        {
          id: 'schedule-1',
          scheduledTime: '08:00',
          createdAt: new Date('2026-08-05T12:00:00.000Z'),
        },
      ],
    };
    patientFindUnique.mockResolvedValue({
      id: 'patient-1',
      timeZone: null,
    });
    medicationFindMany
      .mockResolvedValueOnce([medication])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([medication])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([medication])
      .mockResolvedValueOnce([]);

    jest.setSystemTime(new Date('2026-08-06T12:00:00.000Z'));
    await service.findAll('user-1');

    expect(patientUpdateMany).not.toHaveBeenCalled();
    expect(logUpdateMany).not.toHaveBeenCalled();
    expect(logCreateMany).toHaveBeenNthCalledWith(1, {
      data: [
        {
          medicationId: 'medication-1',
          scheduleId: 'schedule-1',
          scheduleDate: new Date('2026-08-06T00:00:00.000Z'),
          scheduledFor: new Date('2026-08-06T08:00:00.000Z'),
          status: MedicationLogStatus.PENDING,
        },
      ],
      skipDuplicates: true,
    });

    jest.setSystemTime(new Date('2026-08-07T12:00:00.000Z'));
    await service.findAll('user-1');

    expect(patientUpdateMany).not.toHaveBeenCalled();
    expect(logUpdateMany).not.toHaveBeenCalled();
    expect(logCreateMany).toHaveBeenNthCalledWith(2, {
      data: [
        {
          medicationId: 'medication-1',
          scheduleId: 'schedule-1',
          scheduleDate: new Date('2026-08-07T00:00:00.000Z'),
          scheduledFor: new Date('2026-08-07T08:00:00.000Z'),
          status: MedicationLogStatus.PENDING,
        },
      ],
      skipDuplicates: true,
    });

    jest.setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
    await service.findAll('user-1', 'Asia/Beirut');

    expect(patientUpdateMany).toHaveBeenCalledTimes(1);
    expect(logDeleteMany).toHaveBeenCalledWith({
      where: {
        status: MedicationLogStatus.PENDING,
        medication: { patientId: 'patient-1' },
      },
    });
    expect(logCreateMany).toHaveBeenNthCalledWith(3, {
      data: [
        {
          medicationId: 'medication-1',
          scheduleId: 'schedule-1',
          scheduleDate: new Date('2026-08-05T00:00:00.000Z'),
          scheduledFor: new Date('2026-08-05T05:00:00.000Z'),
          status: MedicationLogStatus.MISSED,
        },
        {
          medicationId: 'medication-1',
          scheduleId: 'schedule-1',
          scheduleDate: new Date('2026-08-06T00:00:00.000Z'),
          scheduledFor: new Date('2026-08-06T05:00:00.000Z'),
          status: MedicationLogStatus.MISSED,
        },
        {
          medicationId: 'medication-1',
          scheduleId: 'schedule-1',
          scheduleDate: new Date('2026-08-07T00:00:00.000Z'),
          scheduledFor: new Date('2026-08-07T05:00:00.000Z'),
          status: MedicationLogStatus.MISSED,
        },
        {
          medicationId: 'medication-1',
          scheduleId: 'schedule-1',
          scheduleDate: new Date('2026-08-08T00:00:00.000Z'),
          scheduledFor: new Date('2026-08-08T05:00:00.000Z'),
          status: MedicationLogStatus.PENDING,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('initializes a missing canonical zone from a valid header and reconciles pending logs', async () => {
    patientFindUnique.mockResolvedValue({
      id: 'patient-1',
      timeZone: null,
    });
    medicationFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(service.findAll('user-1', 'Asia/Beirut')).resolves.toEqual([]);

    expect(patientUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'patient-1',
        userId: 'user-1',
        timeZone: null,
      },
      data: { timeZone: 'Asia/Beirut' },
    });
    expect(logDeleteMany).toHaveBeenCalledWith({
      where: {
        status: MedicationLogStatus.PENDING,
        medication: { patientId: 'patient-1' },
      },
    });
  });

  it.each([
    {
      season: 'summer',
      now: '2026-08-08T12:00:00.000Z',
      startDate: '2026-08-01T00:00:00.000Z',
      expectedScheduledFor: '2026-08-08T05:00:00.000Z',
    },
    {
      season: 'winter',
      now: '2026-01-08T12:00:00.000Z',
      startDate: '2026-01-01T00:00:00.000Z',
      expectedScheduledFor: '2026-01-08T06:00:00.000Z',
    },
  ])(
    'uses persisted Asia/Beirut DST offset in $season and ignores a later UTC header',
    async ({ now, startDate, expectedScheduledFor }) => {
      jest.setSystemTime(new Date(now));
      patientFindUnique.mockResolvedValue({
        id: 'patient-1',
        timeZone: 'Asia/Beirut',
      });
      medicationFindMany
        .mockResolvedValueOnce([
          {
            id: 'medication-1',
            status: MedicationStatus.ACTIVE,
            startDate: new Date(startDate),
            endDate: null,
            schedules: [
              {
                id: 'schedule-1',
                scheduledTime: '08:00',
                createdAt: new Date(now),
              },
            ],
          },
        ])
        .mockResolvedValueOnce([]);

      await service.findAll('user-1', 'UTC');

      expect(logCreateMany).toHaveBeenCalledWith({
        data: [
          {
            medicationId: 'medication-1',
            scheduleId: 'schedule-1',
            scheduleDate: new Date(startDate.slice(0, 8) + '08T00:00:00.000Z'),
            scheduledFor: new Date(expectedScheduledFor),
            status: MedicationLogStatus.PENDING,
          },
        ],
        skipDuplicates: true,
      });
    },
  );

  it('keeps distinct schedule identities when a DST gap maps times to one instant', async () => {
    jest.setSystemTime(new Date('2026-03-08T12:00:00.000Z'));
    patientFindUnique.mockResolvedValue({
      id: 'patient-1',
      timeZone: 'America/New_York',
    });
    medicationFindMany
      .mockResolvedValueOnce([
        {
          id: 'medication-1',
          status: MedicationStatus.ACTIVE,
          startDate: new Date('2026-03-01T00:00:00.000Z'),
          endDate: null,
          schedules: [
            {
              id: 'gap-schedule',
              scheduledTime: '02:30',
              createdAt: new Date('2026-03-08T12:00:00.000Z'),
            },
            {
              id: 'regular-schedule',
              scheduledTime: '03:30',
              createdAt: new Date('2026-03-08T12:00:00.000Z'),
            },
          ],
        },
      ])
      .mockResolvedValueOnce([]);
    logFindMany.mockResolvedValue([
      {
        id: 'ambiguous-legacy-log',
        medicationId: 'medication-1',
        scheduleId: null,
        scheduleDate: null,
        scheduledFor: new Date('2026-03-08T07:30:00.000Z'),
      },
    ]);

    await service.findAll('user-1');

    expect(logUpdate).not.toHaveBeenCalled();
    expect(logCreateMany).toHaveBeenCalledWith({
      data: [
        {
          medicationId: 'medication-1',
          scheduleId: 'gap-schedule',
          scheduleDate: new Date('2026-03-08T00:00:00.000Z'),
          scheduledFor: new Date('2026-03-08T07:30:00.000Z'),
          status: MedicationLogStatus.PENDING,
        },
        {
          medicationId: 'medication-1',
          scheduleId: 'regular-schedule',
          scheduleDate: new Date('2026-03-08T00:00:00.000Z'),
          scheduledFor: new Date('2026-03-08T07:30:00.000Z'),
          status: MedicationLogStatus.PENDING,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('rejects an invalid X-Time-Zone before opening a transaction', async () => {
    await expect(
      service.findAll('user-1', 'Mars/Olympus_Mons'),
    ).rejects.toEqual(
      new BadRequestException('X-Time-Zone must be a valid IANA time zone'),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('defensively rejects an invalid date range when called without DTO validation', async () => {
    await expect(
      service.create('user-1', {
        ...createDto,
        startDate: '2026-08-10',
        endDate: '2026-08-09',
      }),
    ).rejects.toEqual(
      new BadRequestException('endDate must be on or after startDate'),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 404 when the authenticated user has no patient profile', async () => {
    patientFindUnique.mockResolvedValue(null);

    await expect(service.findAll('user-without-patient')).rejects.toEqual(
      new NotFoundException('Patient profile not found'),
    );
  });

  it('retries the complete medication update transaction after P2034', async () => {
    const serializationError = new Prisma.PrismaClientKnownRequestError(
      'Transaction write conflict',
      {
        code: 'P2034',
        clientVersion: 'test',
      },
    );
    const existingMedication = {
      id: 'medication-1',
      status: MedicationStatus.ACTIVE,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: null,
      schedules: [],
    };
    const updatedMedication = {
      ...existingMedication,
      name: 'Updated name',
    };
    let transactionAttempt = 0;
    let medicationRead = 0;

    medicationFindFirst.mockImplementation(() => {
      const result = [
        existingMedication,
        updatedMedication,
        { ...updatedMedication, logs: [] },
      ][medicationRead % 3];
      medicationRead += 1;
      return Promise.resolve(result);
    });
    prisma.$transaction.mockImplementation(async (callback) => {
      transactionAttempt += 1;
      const result = await callback(transaction);

      if (transactionAttempt < 3) {
        throw serializationError;
      }

      return result;
    });

    await service.update('user-1', 'medication-1', {
      name: 'Updated name',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(patientFindUnique).toHaveBeenCalledTimes(3);
    expect(medicationFindFirst).toHaveBeenCalledTimes(9);
    expect(medicationUpdate).toHaveBeenCalledTimes(3);
    expect(prisma.$transaction).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  });
});
