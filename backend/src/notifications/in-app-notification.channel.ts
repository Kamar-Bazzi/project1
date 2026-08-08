import { Injectable } from '@nestjs/common';

import {
  HealthAlertNotification,
  NotificationChannel,
  NotificationDeliveryResult,
} from './notification-channel';

/**
 * HealthAlert is itself the durable in-app notification. No duplicate record
 * or external side effect is needed for this channel.
 */
@Injectable()
export class InAppNotificationChannel implements NotificationChannel {
  readonly name = 'IN_APP' as const;

  send(
    notification: HealthAlertNotification,
  ): Promise<NotificationDeliveryResult> {
    void notification;

    return Promise.resolve({
      channel: this.name,
      outcome: 'DELIVERED',
      recipientCount: 1,
    });
  }
}
