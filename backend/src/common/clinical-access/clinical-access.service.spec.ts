import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { ClinicalAccessService } from './clinical-access.service';

describe('ClinicalAccessService', () => {
  it('requires an active explicit assignment for doctor patient access', async () => {
    const patientFindFirst = jest
      .fn<Promise<null>, [Prisma.PatientFindFirstArgs]>()
      .mockResolvedValue(null);
    const service = new ClinicalAccessService({
      doctor: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'doctor-id',
          userId: 'doctor-user',
          user: { id: 'doctor-user', name: 'Doctor', email: 'd@example.com' },
        }),
      },
      patient: { findFirst: patientFindFirst },
    } as unknown as PrismaService);

    await expect(
      service.requireAssignedPatient('doctor-user', 'patient-id'),
    ).rejects.toEqual(new NotFoundException('Assigned patient not found'));
    const arguments_ = patientFindFirst.mock.calls[0]?.[0] as {
      where: { doctorAccessGrants: unknown };
    };
    expect(arguments_.where.doctorAccessGrants).toEqual({
      some: { doctorId: 'doctor-id', active: true },
    });
  });

  it('rejects a patient-supplied patientId before reading storage', async () => {
    const patientFindUnique = jest.fn();
    const service = new ClinicalAccessService({
      patient: { findUnique: patientFindUnique },
    } as unknown as PrismaService);

    await expect(
      service.resolvePatientForActor(
        { id: 'patient-user', role: UserRole.PATIENT },
        'other-patient-id',
      ),
    ).rejects.toEqual(
      new BadRequestException('Patients cannot request another patient record'),
    );
    expect(patientFindUnique).not.toHaveBeenCalled();
  });
});
