import {
  AlertRule,
  HealthAlert,
  HealthAlertSeverity,
  HealthAlertStatus,
  HealthMetricType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { InAppNotificationChannel } from './in-app-notification.channel';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const contactCount = jest.fn();
  const prisma = { emergencyContact: { count: contactCount } };
  const channel = new InAppNotificationChannel();
  const service = new NotificationsService(
    prisma as unknown as PrismaService,
    channel,
  );
  const now = new Date('2026-08-08T12:00:00.000Z');
  const alert: HealthAlert = {
    id: 'alert-1',
    patientId: 'patient-1',
    metricType: HealthMetricType.HEART_RATE,
    severity: HealthAlertSeverity.WARNING,
    message: 'Safe message',
    metricId: 'metric-1',
    alertRuleId: 'rule-1',
    status: HealthAlertStatus.ACTIVE,
    detectedAt: now,
    acknowledgedAt: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const rule: AlertRule = {
    id: 'rule-1',
    patientId: 'patient-1',
    metricType: HealthMetricType.HEART_RATE,
    enabled: true,
    minimumValue: 50,
    maximumValue: 120,
    consecutiveReadingsRequired: 3,
    severity: HealthAlertSeverity.WARNING,
    notifyEmergencyContacts: false,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('always exposes the persisted alert in-app without contacting anyone', async () => {
    await expect(service.notifyHealthAlert(alert, rule)).resolves.toEqual([
      { channel: 'IN_APP', outcome: 'DELIVERED', recipientCount: 1 },
      {
        channel: 'EMERGENCY_CONTACT',
        outcome: 'NOT_REQUESTED',
        recipientCount: 0,
      },
    ]);
    expect(contactCount).not.toHaveBeenCalled();
  });

  it('defers opted-in contact delivery when no outbound provider exists', async () => {
    contactCount.mockResolvedValue(2);

    await expect(
      service.notifyHealthAlert(alert, {
        ...rule,
        notifyEmergencyContacts: true,
      }),
    ).resolves.toContainEqual({
      channel: 'EMERGENCY_CONTACT',
      outcome: 'DEFERRED',
      recipientCount: 2,
    });
    expect(contactCount).toHaveBeenCalledWith({
      where: { patientId: 'patient-1', active: true },
    });
  });

  it('rejects untrusted push endpoints before they can be used for SSRF', async () => {
    await expect(
      service.savePushSubscription('user-1', {
        endpoint: 'https://127.0.0.1/internal-callback',
        p256dh: 'public-key-material',
        auth: 'auth-material',
      }),
    ).rejects.toThrow('Push subscription provider is not allowed');
  });

  it('creates a complete default notification preference record', async () => {
    const preference = {
      id: 'preference-1',
      userId: 'user-1',
      inAppEnabled: true,
      emailEnabled: true,
      pushEnabled: true,
      medicationReminders: true,
      appointmentReminders: true,
      healthAlerts: true,
      emergencyContactAlerts: true,
      securityAlerts: true,
      appointmentReminderHours: 24,
      createdAt: now,
      updatedAt: now,
    };
    const upsert = jest.fn().mockResolvedValue(preference);
    const preferenceService = new NotificationsService(
      {
        notificationPreference: { upsert },
      } as unknown as PrismaService,
      channel,
    );

    await expect(preferenceService.getPreferences('user-1')).resolves.toEqual({
      inAppEnabled: true,
      emailEnabled: true,
      pushEnabled: true,
      medicationReminders: true,
      appointmentReminders: true,
      healthAlerts: true,
      emergencyContactAlerts: true,
      securityAlerts: true,
      appointmentReminderHours: 24,
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      update: {},
      create: { userId: 'user-1' },
    });
  });

  it('rejects an empty notification preference update', async () => {
    const preferenceService = new NotificationsService(
      {} as PrismaService,
      channel,
    );

    await expect(
      preferenceService.updatePreferences('user-1', {}),
    ).rejects.toThrow('At least one notification preference is required');
  });
});
