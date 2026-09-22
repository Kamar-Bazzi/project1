import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { DoctorAvailabilityService } from './doctor-availability.service';

describe('DoctorAvailabilityService', () => {
  it('rejects overlapping weekly windows before replacing stored data', async () => {
    const executeTransaction = jest.fn();
    const prisma = {
      $transaction: executeTransaction,
    } as unknown as PrismaService;
    const service = new DoctorAvailabilityService(prisma);

    await expect(
      service.replaceMine('doctor-user', {
        timeZone: 'UTC',
        slotDurationMinutes: 30,
        windows: [
          { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
          { dayOfWeek: 1, startMinute: 660, endMinute: 780 },
        ],
      }),
    ).rejects.toEqual(
      new BadRequestException(
        'Availability windows cannot overlap on the same day',
      ),
    );
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('accepts only aligned half-open slots inside a configured window', async () => {
    const start = new Date('2099-01-05T09:30:00.000Z');
    const prisma = {
      doctor: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'doctor-id',
          timeZone: 'UTC',
          slotDurationMinutes: 30,
          availabilityWindows: [
            {
              id: 'window-id',
              dayOfWeek: start.getUTCDay(),
              startMinute: 9 * 60,
              endMinute: 11 * 60,
            },
          ],
        }),
      },
    } as unknown as PrismaService;
    const service = new DoctorAvailabilityService(prisma);

    await expect(
      service.assertBookable(prisma as never, 'doctor-id', start, 30),
    ).resolves.toEqual({
      appointmentEnd: new Date('2099-01-05T10:00:00.000Z'),
      durationMinutes: 30,
    });

    await expect(
      service.assertBookable(
        prisma as never,
        'doctor-id',
        new Date('2099-01-05T09:15:00.000Z'),
        30,
      ),
    ).rejects.toEqual(
      new ConflictException(
        "The requested time is outside the doctor's available slots",
      ),
    );
  });

  it('returns assigned-patient slots with doctor and patient conflicts removed', async () => {
    const day = new Date('2099-01-05T09:00:00.000Z');
    const doctorFindFirst = jest
      .fn<Promise<unknown>, [Prisma.DoctorFindFirstArgs]>()
      .mockResolvedValue({
        id: 'doctor-id',
        timeZone: 'UTC',
        slotDurationMinutes: 30,
        availabilityWindows: [
          {
            id: 'window-id',
            dayOfWeek: day.getUTCDay(),
            startMinute: 9 * 60,
            endMinute: 11 * 60,
          },
        ],
      });
    const appointmentFindMany = jest
      .fn<Promise<unknown[]>, [Prisma.AppointmentFindManyArgs]>()
      .mockResolvedValue([
        {
          appointmentDate: new Date('2099-01-05T09:30:00.000Z'),
          appointmentEnd: new Date('2099-01-05T10:00:00.000Z'),
        },
      ]);
    const prisma = {
      patient: {
        findUnique: jest.fn().mockResolvedValue({ id: 'patient-id' }),
      },
      doctor: { findFirst: doctorFindFirst },
      appointment: { findMany: appointmentFindMany },
    } as unknown as PrismaService;
    const service = new DoctorAvailabilityService(prisma);

    const result = await service.listAvailableSlots(
      { id: 'patient-user', role: UserRole.PATIENT },
      'doctor-id',
      {
        from: '2099-01-05T08:00:00.000Z',
        to: '2099-01-05T12:00:00.000Z',
      },
    );

    const doctorQuery = doctorFindFirst.mock.calls[0]?.[0];
    expect(doctorQuery?.where).toEqual(
      expect.objectContaining({
        id: 'doctor-id',
        patientAccessGrants: {
          some: { patientId: 'patient-id', active: true },
        },
      }),
    );
    const appointmentQuery = appointmentFindMany.mock.calls[0]?.[0];
    expect(appointmentQuery?.where).toEqual(
      expect.objectContaining({
        OR: [{ doctorId: 'doctor-id' }, { patientId: 'patient-id' }],
      }),
    );
    expect(result.slots.map((slot) => slot.start)).toEqual([
      '2099-01-05T09:00:00.000Z',
      '2099-01-05T10:00:00.000Z',
      '2099-01-05T10:30:00.000Z',
    ]);
  });
});
