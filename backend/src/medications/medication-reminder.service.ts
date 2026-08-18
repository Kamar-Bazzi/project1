import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  MedicationLogStatus,
  MedicationStatus,
  NotificationType,
} from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { MedicationsService } from './medications.service';

@Injectable()
export class MedicationReminderService {
  private readonly logger = new Logger(MedicationReminderService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly medications: MedicationsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'medication-reminders',
    waitForCompletion: true,
  })
  async scheduledRun(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const result = await this.processDueNotifications();

      if (result.remindersProcessed + result.overdueProcessed > 0) {
        this.logger.log(
          `Processed ${result.remindersProcessed} medication reminders and ${result.overdueProcessed} overdue notifications`,
        );
      }
    } catch (error) {
      const code =
        error instanceof Error ? error.constructor.name : 'UnknownError';
      this.logger.error(`Medication notification run failed (${code})`);
    } finally {
      this.running = false;
    }
  }

  async processDueNotifications(now = new Date()) {
    await this.medications.prepareReminderLogs(now);

    const leadMinutes = this.numberConfig(
      'MEDICATION_REMINDER_LEAD_MINUTES',
      15,
      0,
      240,
    );
    const overdueMinutes = this.numberConfig(
      'MEDICATION_OVERDUE_GRACE_MINUTES',
      30,
      1,
      1440,
    );
    const batchSize = this.numberConfig(
      'NOTIFICATION_DISPATCH_BATCH_SIZE',
      100,
      1,
      1000,
    );
    const reminderEnd = new Date(now.getTime() + leadMinutes * 60_000);
    const overdueCutoff = new Date(now.getTime() - overdueMinutes * 60_000);

    const [reminderLogs, overdueLogs] = await Promise.all([
      this.prisma.medicationLog.findMany({
        where: {
          status: MedicationLogStatus.PENDING,
          scheduledFor: { gt: overdueCutoff, lte: reminderEnd },
          medication: { status: MedicationStatus.ACTIVE },
        },
        select: { id: true },
        orderBy: { scheduledFor: 'asc' },
        take: batchSize,
      }),
      this.prisma.medicationLog.findMany({
        where: {
          status: MedicationLogStatus.PENDING,
          scheduledFor: { lte: overdueCutoff },
          medication: { status: MedicationStatus.ACTIVE },
        },
        select: {
          id: true,
          medication: { select: { patientId: true } },
        },
        orderBy: { scheduledFor: 'asc' },
        take: batchSize,
      }),
    ]);

    let remindersProcessed = 0;
    let overdueProcessed = 0;

    for (const log of reminderLogs) {
      await this.notifications.notifyMedicationDose(
        log.id,
        NotificationType.MEDICATION_REMINDER,
      );
      remindersProcessed += 1;
    }

    for (const log of overdueLogs) {
      await this.notifications.notifyMedicationDose(
        log.id,
        NotificationType.MEDICATION_OVERDUE,
      );
      const marked = await this.prisma.medicationLog.updateMany({
        where: { id: log.id, status: MedicationLogStatus.PENDING },
        data: { status: MedicationLogStatus.MISSED },
      });
      if (marked.count > 0) {
        overdueProcessed += 1;
        await this.prisma.auditLog.create({
          data: {
            action: 'MEDICATION_DOSE_MARKED_MISSED',
            entity: 'MedicationLog',
            entityId: log.id,
            metadata: {
              patientId: log.medication.patientId,
              status: MedicationLogStatus.MISSED,
              operation: 'AUTOMATED_OVERDUE_CHECK',
            },
          },
        });
      }
    }

    return { remindersProcessed, overdueProcessed };
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
