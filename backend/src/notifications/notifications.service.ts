import { Injectable } from '@nestjs/common';
import { AlertRule, HealthAlert, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { InAppNotificationChannel } from './in-app-notification.channel';
import { NotificationDeliveryResult } from './notification-channel';

type NotificationDatabaseClient = Pick<
  Prisma.TransactionClient,
  'emergencyContact'
>;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inAppChannel: InAppNotificationChannel,
  ) {}

  async notifyHealthAlert(
    alert: HealthAlert,
    rule: AlertRule,
    transaction?: Prisma.TransactionClient,
  ): Promise<NotificationDeliveryResult[]> {
    const inAppResult = await this.inAppChannel.send({
      alertId: alert.id,
      patientId: alert.patientId,
      metricType: alert.metricType,
      severity: alert.severity,
      message: alert.message,
    });

    if (!rule.notifyEmergencyContacts) {
      return [
        inAppResult,
        {
          channel: 'EMERGENCY_CONTACT',
          outcome: 'NOT_REQUESTED',
          recipientCount: 0,
        },
      ];
    }

    const database: NotificationDatabaseClient = transaction ?? this.prisma;
    const configuredContactCount = await database.emergencyContact.count({
      where: {
        patientId: alert.patientId,
        active: true,
      },
    });

    return [
      inAppResult,
      {
        channel: 'EMERGENCY_CONTACT',
        outcome: configuredContactCount > 0 ? 'DEFERRED' : 'NOT_CONFIGURED',
        recipientCount: configuredContactCount,
      },
    ];
  }
}
