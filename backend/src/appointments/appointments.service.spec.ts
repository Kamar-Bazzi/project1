import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma, UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService authorization', () => {
  it('scopes a doctor appointment read through an active explicit assignment', async () => {
    const findFirst = jest
      .fn<Promise<null>, [Prisma.AppointmentFindFirstArgs]>()
      .mockResolvedValue(null);
    const service = new AppointmentsService({
      appointment: { findFirst },
    } as unknown as PrismaService);

    await expect(
      service.findOne(
        { id: 'doctor-user', role: UserRole.DOCTOR },
        'appointment-id',
      ),
    ).rejects.toEqual(new NotFoundException('Appointment not found'));

    const arguments_ = findFirst.mock.calls[0]?.[0] as {
      where?: { id?: string; AND?: unknown[] };
    };
    expect(arguments_.where?.id).toBe('appointment-id');
    expect(arguments_.where?.AND).toEqual([
      {
        doctor: { userId: 'doctor-user' },
        patient: {
          doctorAccessGrants: {
            some: {
              active: true,
              doctor: { userId: 'doctor-user' },
            },
          },
        },
      },
    ]);
  });

  it('does not create a patient appointment for an unassigned doctor', async () => {
    const createAppointment = jest.fn();
    const transaction = {
      patient: {
        findUnique: jest.fn().mockResolvedValue({ id: 'patient-id' }),
      },
      doctor: { findFirst: jest.fn().mockResolvedValue(null) },
      appointment: {
        findFirst: jest.fn(),
        create: createAppointment,
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    } as unknown as PrismaService;
    const service = new AppointmentsService(prisma);

    await expect(
      service.create(
        { id: 'patient-user', role: UserRole.PATIENT },
        {
          doctorId: 'e64ef47f-fef5-4d03-83ef-56124ca13aa4',
          appointmentDate: '2099-01-01T10:00:00.000Z',
        },
      ),
    ).rejects.toEqual(new NotFoundException('Assigned doctor not found'));
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it('prevents patients from marking appointments completed', async () => {
    const service = new AppointmentsService({} as PrismaService);

    await expect(
      service.update(
        { id: 'patient-user', role: UserRole.PATIENT },
        'appointment-id',
        { status: AppointmentStatus.COMPLETED },
      ),
    ).rejects.toEqual(
      new BadRequestException('Patients may only cancel appointments'),
    );
  });

  it('maps a concurrent database scheduling collision to conflict', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      ),
    } as unknown as PrismaService;
    const service = new AppointmentsService(prisma);

    await expect(
      service.create(
        { id: 'patient-user', role: UserRole.PATIENT },
        {
          doctorId: 'e64ef47f-fef5-4d03-83ef-56124ca13aa4',
          appointmentDate: '2099-01-01T10:00:00.000Z',
        },
      ),
    ).rejects.toEqual(
      new ConflictException(
        'The patient or doctor already has an appointment at this time',
      ),
    );
  });
});
