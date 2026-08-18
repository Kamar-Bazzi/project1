import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { AppointmentReminderService } from './appointment-reminder.service';
import { NotificationsService } from './notifications.service';

describe('AppointmentReminderService', () => {
  it('processes only the bounded batch returned by the scheduled query', async () => {
    interface AppointmentQuery {
      where: {
        status: string;
        appointmentDate: { gt: Date; lte: Date };
      };
      select: { id: boolean };
      orderBy: { appointmentDate: string };
      take: number;
    }
    const findMany = jest
      .fn<Promise<Array<{ id: string }>>, [AppointmentQuery]>()
      .mockResolvedValue([{ id: 'appointment-1' }, { id: 'appointment-2' }]);
    const notifyAppointmentReminder = jest.fn().mockResolvedValue({
      notificationsCreated: 2,
    });
    const service = new AppointmentReminderService(
      { appointment: { findMany } } as unknown as PrismaService,
      { notifyAppointmentReminder } as unknown as NotificationsService,
      { get: jest.fn() } as unknown as ConfigService,
    );
    const now = new Date('2026-08-14T08:00:00.000Z');

    await expect(service.processUpcomingAppointments(now)).resolves.toBe(2);
    const query = findMany.mock.calls[0][0];
    expect(query.where.appointmentDate).toEqual({
      gt: now,
      lte: new Date('2026-08-21T08:00:00.000Z'),
    });
    expect(query.take).toBe(100);
    expect(notifyAppointmentReminder).toHaveBeenNthCalledWith(
      1,
      'appointment-1',
      now,
    );
    expect(notifyAppointmentReminder).toHaveBeenNthCalledWith(
      2,
      'appointment-2',
      now,
    );
  });
});
