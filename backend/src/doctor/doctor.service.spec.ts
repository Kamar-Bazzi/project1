import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { DoctorService } from './doctor.service';

describe('DoctorService assignment authorization', () => {
  it('requires an active assignment when reading a patient record', async () => {
    const requireAssignedPatient = jest
      .fn()
      .mockRejectedValue(new NotFoundException('Assigned patient not found'));
    const prisma = {
      doctor: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'doctor-id',
          userId: 'doctor-user',
          specialization: null,
          licenseNumber: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          user: {
            id: 'doctor-user',
            name: 'Doctor',
            email: 'doctor@example.com',
          },
        }),
      },
    } as unknown as PrismaService;
    const service = new DoctorService(prisma, {
      requireAssignedPatient,
    } as unknown as ClinicalAccessService);

    await expect(
      service.findPatient('doctor-user', 'patient-id'),
    ).rejects.toEqual(new NotFoundException('Assigned patient not found'));
    expect(requireAssignedPatient).toHaveBeenCalledWith(
      'doctor-user',
      'patient-id',
    );
  });

  it('also scopes alert listing through the active assignment relation', async () => {
    const alertFindMany = jest
      .fn<Promise<unknown[]>, [Prisma.HealthAlertFindManyArgs]>()
      .mockResolvedValue([]);
    const alertCount = jest.fn().mockResolvedValue(0);
    const prisma = {
      doctor: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'doctor-id',
          userId: 'doctor-user',
          user: {
            id: 'doctor-user',
            name: 'Doctor',
            email: 'doctor@example.com',
          },
        }),
      },
      healthAlert: { findMany: alertFindMany, count: alertCount },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    } as unknown as PrismaService;
    const service = new DoctorService(prisma, {} as ClinicalAccessService);

    await service.findAlerts('doctor-user', { page: 1, pageSize: 20 });

    const arguments_ = alertFindMany.mock.calls[0]?.[0] as {
      where?: { patient?: unknown };
    };
    expect(arguments_.where?.patient).toEqual({
      doctorAccessGrants: {
        some: {
          doctorId: 'doctor-id',
          active: true,
          wearableDataAllowed: true,
        },
      },
    });
  });

  it('combines patient search with the current doctor active assignment', async () => {
    const patientFindMany = jest.fn().mockResolvedValue([]);
    const patientCount = jest.fn().mockResolvedValue(0);
    const prisma = {
      doctor: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'doctor-id',
          userId: 'doctor-user',
          user: {
            id: 'doctor-user',
            name: 'Doctor',
            email: 'doctor@example.com',
          },
        }),
      },
      patient: { findMany: patientFindMany, count: patientCount },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    } as unknown as PrismaService;
    const service = new DoctorService(prisma, {} as ClinicalAccessService);

    await service.findPatients('doctor-user', {
      page: 1,
      pageSize: 20,
      search: 'alex',
    });

    expect(patientFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          doctorAccessGrants: {
            some: { doctorId: 'doctor-id', active: true },
          },
          user: {
            OR: [
              { name: { contains: 'alex', mode: 'insensitive' } },
              { email: { contains: 'alex', mode: 'insensitive' } },
            ],
          },
        },
      }),
    );
  });
});
