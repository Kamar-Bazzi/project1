import { HealthAlertSeverity, HealthMetricType } from '@prisma/client';

export type NotificationChannelName =
  'IN_APP' | 'EMAIL' | 'PUSH' | 'EMERGENCY_CONTACT';
export type NotificationOutcome =
  'DELIVERED' | 'NOT_REQUESTED' | 'NOT_CONFIGURED' | 'DEFERRED' | 'FAILED';

export interface HealthAlertNotification {
  alertId: string;
  patientId: string;
  metricType: HealthMetricType;
  severity: HealthAlertSeverity;
  message: string;
}

export interface NotificationDeliveryResult {
  channel: NotificationChannelName;
  outcome: NotificationOutcome;
  recipientCount: number;
}

export interface NotificationChannel {
  readonly name: NotificationChannelName;
  send(
    notification: HealthAlertNotification,
  ): Promise<NotificationDeliveryResult>;
}
