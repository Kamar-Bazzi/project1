import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppointmentStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class AppointmentReminderService {
  private readonly logger = new Logger(AppointmentReminderService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, {
    name: 'appointment-reminders',
    waitForCompletion: true,
  })
  async scheduledRun(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const processed = await this.processUpcomingAppointments();
      if (processed > 0) {
        this.logger.log(`Processed ${processed} upcoming appointments`);
      }
    } catch (error) {
      const code =
        error instanceof Error ? error.constructor.name : 'UnknownError';
      this.logger.error(`Appointment reminder run failed (${code})`);
    } finally {
      this.running = false;
    }
  }

  async processUpcomingAppointments(now = new Date()): Promise<number> {
    const maximumLookaheadHours = this.numberConfig(
      'APPOINTMENT_REMINDER_MAX_LOOKAHEAD_HOURS',
      168,
      1,
      168,
    );
    const batchSize = this.numberConfig(
      'NOTIFICATION_DISPATCH_BATCH_SIZE',
      100,
      1,
      1000,
    );
    const appointments = await this.prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.SCHEDULED,
        appointmentDate: {
          gt: now,
          lte: new Date(now.getTime() + maximumLookaheadHours * 60 * 60 * 1000),
        },
      },
      select: { id: true },
      orderBy: { appointmentDate: 'asc' },
      take: batchSize,
    });

    for (const appointment of appointments) {
      await this.notifications.notifyAppointmentReminder(appointment.id, now);
    }

    return appointments.length;
  }

  private numberConfig(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const value = Number(this.config.get<string>(key) ?? fallback);
    return Number.isFinite(value)
      ? Math.min(maximum, Math.max(minimum, Math.floor(value)))
      : fallback;
  }
}
