import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma, UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService } from './appointments.service';
import { DoctorAvailabilityService } from './doctor-availability.service';

const unusedAvailability = {} as DoctorAvailabilityService;

describe('AppointmentsService authorization', () => {
  it('scopes a doctor appointment read through an active explicit assignment', async () => {
    const findFirst = jest
      .fn<Promise<null>, [Prisma.AppointmentFindFirstArgs]>()
      .mockResolvedValue(null);
    const service = new AppointmentsService(
      {
        appointment: { findFirst },
      } as unknown as PrismaService,
      unusedAvailability,
    );

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
    const service = new AppointmentsService(prisma, unusedAvailability);

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
    const service = new AppointmentsService(
      {} as PrismaService,
      unusedAvailability,
    );

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
    const service = new AppointmentsService(prisma, unusedAvailability);

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
        'The patient or doctor already has an overlapping appointment',
      ),
    );
  });

  it('rejects half-open interval overlap even when start times differ', async () => {
    const appointmentStart = new Date('2099-01-01T10:15:00.000Z');
    const appointmentEnd = new Date('2099-01-01T10:45:00.000Z');
    const findFirst = jest.fn().mockResolvedValue({ id: 'collision-id' });
    const create = jest.fn();
    const transaction = {
      patient: {
        findUnique: jest.fn().mockResolvedValue({ id: 'patient-id' }),
      },
      doctor: { findFirst: jest.fn().mockResolvedValue({ id: 'doctor-id' }) },
      appointment: { findFirst, create },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    } as unknown as PrismaService;
    const availability = {
      assertBookable: jest.fn().mockResolvedValue({
        appointmentEnd,
        durationMinutes: 30,
      }),
    } as unknown as DoctorAvailabilityService;
    const service = new AppointmentsService(prisma, availability);

    await expect(
      service.create(
        { id: 'patient-user', role: UserRole.PATIENT },
        {
          doctorId: 'e64ef47f-fef5-4d03-83ef-56124ca13aa4',
          appointmentDate: appointmentStart.toISOString(),
        },
      ),
    ).rejects.toEqual(
      new ConflictException(
        'The patient or doctor already has an overlapping appointment',
      ),
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: undefined,
        status: AppointmentStatus.SCHEDULED,
        appointmentDate: { lt: appointmentEnd },
        appointmentEnd: { gt: appointmentStart },
        OR: [{ patientId: 'patient-id' }, { doctorId: 'doctor-id' }],
      },
      select: { id: true },
    });
    expect(create).not.toHaveBeenCalled();
  });
});
