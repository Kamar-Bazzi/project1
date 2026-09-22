import {
  AccountStatus,
  AlertRule,
  HealthAlert,
  HealthAlertSeverity,
  HealthAlertStatus,
  HealthMetricType,
  NotificationChannelType,
  NotificationDeliveryStatus,
  NotificationType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { InAppNotificationChannel } from './in-app-notification.channel';
import { NotificationsService } from './notifications.service';
import { SmsProvider, SmsProviderSendResult } from './providers/sms.provider';

type SmsSendMock = jest.MockedFunction<SmsProvider['send']>;

interface NotificationDeliveryRepositoryMock {
  upsert: jest.Mock<
    Promise<{ id: string; status: NotificationDeliveryStatus }>,
    [{ create: { channel: NotificationChannelType } }]
  >;
  updateMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
  update: jest.Mock<Promise<unknown>, [unknown]>;
}

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
      smsEnabled: false,
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
      smsEnabled: false,
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

  it('returns a deterministic filtered notification page with metadata', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'notification-1' }]);
    const count = jest.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(23);
    const pagedService = new NotificationsService(
      {
        notification: { findMany, count },
        $transaction: jest.fn((queries: Array<Promise<unknown>>) =>
          Promise.all(queries),
        ),
      } as unknown as PrismaService,
      channel,
    );

    await expect(
      pagedService.findForUser(
        'user-1',
        false,
        10,
        2,
        NotificationType.SECURITY_ALERT,
      ),
    ).resolves.toEqual({
      items: [{ id: 'notification-1' }],
      unreadCount: 4,
      pagination: { page: 2, pageSize: 10, total: 23, totalPages: 3 },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        type: NotificationType.SECURITY_ALERT,
        deliveries: {
          some: {
            channel: NotificationChannelType.IN_APP,
            status: NotificationDeliveryStatus.SENT,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 10,
    });
  });

  it('deduplicates low-refill notices by the patient local calendar date', async () => {
    const notificationUpsert = jest
      .fn()
      .mockResolvedValue({ id: 'notification-1' });
    const refillService = new NotificationsService(
      {
        medication: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'medication-1',
            name: 'Example medicine',
            remainingQuantity: 2,
            lowQuantityThreshold: 5,
            patient: {
              userId: 'patient-user',
              timeZone: 'Pacific/Honolulu',
              user: {
                accountStatus: AccountStatus.ACTIVE,
                email: 'patient@example.com',
              },
            },
          }),
        },
        notificationPreference: {
          findUnique: jest.fn().mockResolvedValue({
            inAppEnabled: true,
            emailEnabled: false,
            pushEnabled: false,
            medicationReminders: true,
            appointmentReminders: true,
            healthAlerts: true,
            emergencyContactAlerts: true,
            securityAlerts: true,
            appointmentReminderHours: 24,
          }),
        },
        notification: { upsert: notificationUpsert },
        notificationDelivery: {
          upsert: jest.fn().mockResolvedValue({}),
        },
      } as unknown as PrismaService,
      channel,
    );

    await refillService.notifyMedicationRefillLow(
      'medication-1',
      undefined,
      new Date('2026-08-22T05:00:00.000Z'),
    );

    expect(notificationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deduplicationKey: 'medication-refill-low:medication-1:2026-08-21',
        },
      }),
    );
  });

  it('persists a sent SMS delivery when SMS is enabled', async () => {
    const { provider: smsProvider, send } = smsProviderMock({
      outcome: 'DELIVERED',
      providerMessageId: 'sms-1',
    });
    const notificationDelivery = notificationDeliveryRepository();
    const serviceWithSms = new NotificationsService(
      medicationNotificationPrisma(notificationDelivery, {
        smsEnabled: true,
      }),
      channel,
      undefined,
      undefined,
      undefined,
      smsProvider,
    );

    await serviceWithSms.notifyMedicationDose('log-1', 'MEDICATION_REMINDER');

    expect(send).toHaveBeenCalledWith({
      recipients: ['+15551234567'],
      body: 'CareTrack: Example medicine is due soon. Sign in to record the dose.',
    });
    const smsUpdate = findDeliveryUpdate(notificationDelivery, 'sms-delivery');
    expect(smsUpdate.data.status).toBe(NotificationDeliveryStatus.SENT);
    expect(smsUpdate.data.providerMessageId).toBe('sms-1');
  });

  it('persists a failed SMS delivery for provider failures', async () => {
    const { provider: smsProvider } = smsProviderMock({
      outcome: 'FAILED',
      errorCode: 'SMS_PROVIDER_DOWN',
    });
    const notificationDelivery = notificationDeliveryRepository();
    const serviceWithSms = new NotificationsService(
      medicationNotificationPrisma(notificationDelivery, {
        smsEnabled: true,
      }),
      channel,
      undefined,
      undefined,
      undefined,
      smsProvider,
    );

    await serviceWithSms.notifyMedicationDose('log-1', 'MEDICATION_REMINDER');

    const smsUpdate = findDeliveryUpdate(notificationDelivery, 'sms-delivery');
    expect(smsUpdate.data.status).toBe(NotificationDeliveryStatus.FAILED);
    expect(smsUpdate.data.errorCode).toBe('SMS_PROVIDER_DOWN');
  });

  it('retries a previously failed SMS delivery while attempts remain', async () => {
    const { provider: smsProvider, send } = smsProviderMock({
      outcome: 'DELIVERED',
      providerMessageId: 'sms-retry',
    });
    const notificationDelivery = notificationDeliveryRepository({
      smsDeliveryStatus: NotificationDeliveryStatus.FAILED,
    });
    const serviceWithSms = new NotificationsService(
      medicationNotificationPrisma(notificationDelivery, {
        smsEnabled: true,
      }),
      channel,
      undefined,
      undefined,
      undefined,
      smsProvider,
    );

    await serviceWithSms.notifyMedicationDose('log-1', 'MEDICATION_REMINDER');

    const claim = findDeliveryClaim(notificationDelivery, 'sms-delivery');
    expect(claim.where.attempts).toEqual({ lt: 5 });
    expect(claim.data.status).toBe(NotificationDeliveryStatus.PROCESSING);
    expect(claim.data.attempts).toEqual({ increment: 1 });
    expect(send).toHaveBeenCalled();
    const smsUpdate = findDeliveryUpdate(notificationDelivery, 'sms-delivery');
    expect(smsUpdate.data.status).toBe(NotificationDeliveryStatus.SENT);
    expect(smsUpdate.data.providerMessageId).toBe('sms-retry');
  });

  it('skips SMS delivery when the user disabled SMS notifications', async () => {
    const { provider: smsProvider, send } = smsProviderMock();
    const notificationDelivery = notificationDeliveryRepository();
    const serviceWithSms = new NotificationsService(
      medicationNotificationPrisma(notificationDelivery, {
        smsEnabled: false,
      }),
      channel,
      undefined,
      undefined,
      undefined,
      smsProvider,
    );

    await serviceWithSms.notifyMedicationDose('log-1', 'MEDICATION_REMINDER');

    expect(send).not.toHaveBeenCalled();
    expect(notificationDelivery.upsert).toHaveBeenCalledWith({
      where: {
        notificationId_channel: {
          notificationId: 'notification-1',
          channel: NotificationChannelType.SMS,
        },
      },
      update: {},
      create: {
        notificationId: 'notification-1',
        channel: NotificationChannelType.SMS,
        status: NotificationDeliveryStatus.SKIPPED,
      },
    });
  });
});

function medicationNotificationPrisma(
  notificationDelivery: NotificationDeliveryRepositoryMock,
  preferenceOverrides: Partial<{
    inAppEnabled: boolean;
    emailEnabled: boolean;
    pushEnabled: boolean;
    smsEnabled: boolean;
    medicationReminders: boolean;
    appointmentReminders: boolean;
    healthAlerts: boolean;
    emergencyContactAlerts: boolean;
    securityAlerts: boolean;
    appointmentReminderHours: number;
  }> = {},
): PrismaService {
  return {
    medicationLog: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'log-1',
        scheduledFor: new Date('2026-08-08T12:15:00.000Z'),
        medication: {
          id: 'medication-1',
          name: 'Example medicine',
          dosage: '10 mg',
          patient: {
            userId: 'patient-user',
            phoneNumber: '+15551234567',
            user: {
              accountStatus: AccountStatus.ACTIVE,
              email: 'patient@example.com',
            },
          },
        },
      }),
    },
    notificationPreference: {
      findUnique: jest.fn().mockResolvedValue({
        inAppEnabled: true,
        emailEnabled: false,
        pushEnabled: false,
        smsEnabled: false,
        medicationReminders: true,
        appointmentReminders: true,
        healthAlerts: true,
        emergencyContactAlerts: true,
        securityAlerts: true,
        appointmentReminderHours: 24,
        ...preferenceOverrides,
      }),
    },
    notification: {
      upsert: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    },
    notificationDelivery,
  } as unknown as PrismaService;
}

function notificationDeliveryRepository(
  options: {
    smsDeliveryStatus?: NotificationDeliveryStatus;
    claimCount?: number;
  } = {},
): NotificationDeliveryRepositoryMock {
  const updateMany: NotificationDeliveryRepositoryMock['updateMany'] = jest.fn(
    () => Promise.resolve({ count: options.claimCount ?? 1 }),
  );
  const update: NotificationDeliveryRepositoryMock['update'] = jest.fn(() =>
    Promise.resolve({}),
  );

  return {
    upsert: jest.fn((input: { create: { channel: NotificationChannelType } }) =>
      Promise.resolve({
        id:
          input.create.channel === NotificationChannelType.SMS
            ? 'sms-delivery'
            : 'delivery-1',
        status:
          input.create.channel === NotificationChannelType.SMS
            ? (options.smsDeliveryStatus ?? NotificationDeliveryStatus.PENDING)
            : NotificationDeliveryStatus.PENDING,
      }),
    ),
    updateMany,
    update,
  };
}

function smsProviderMock(result?: SmsProviderSendResult): {
  provider: SmsProvider;
  send: SmsSendMock;
} {
  const send: SmsSendMock = jest.fn();
  if (result) {
    send.mockResolvedValue(result);
  }
  return { provider: { configured: true, send }, send };
}

function findDeliveryUpdate(
  notificationDelivery: NotificationDeliveryRepositoryMock,
  deliveryId: string,
): {
  where: { id: string };
  data: {
    status?: NotificationDeliveryStatus;
    providerMessageId?: string | null;
    errorCode?: string | null;
  };
} {
  const call = notificationDelivery.update.mock.calls
    .map(([input]) => input)
    .find(
      (input): input is ReturnType<typeof findDeliveryUpdate> =>
        isRecord(input) &&
        isRecord(input.where) &&
        input.where.id === deliveryId &&
        isRecord(input.data),
    );

  if (!call) {
    throw new Error(`Delivery update for ${deliveryId} was not recorded`);
  }

  return call;
}

function findDeliveryClaim(
  notificationDelivery: NotificationDeliveryRepositoryMock,
  deliveryId: string,
): {
  where: {
    id: string;
    attempts?: { lt: number };
  };
  data: {
    status?: NotificationDeliveryStatus;
    attempts?: { increment: number };
  };
} {
  const call = notificationDelivery.updateMany.mock.calls
    .map(([input]) => input)
    .find(
      (input): input is ReturnType<typeof findDeliveryClaim> =>
        isRecord(input) &&
        isRecord(input.where) &&
        input.where.id === deliveryId &&
        isRecord(input.data),
    );

  if (!call) {
    throw new Error(`Delivery claim for ${deliveryId} was not recorded`);
  }

  return call;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
