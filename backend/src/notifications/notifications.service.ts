import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccountStatus,
  AlertRule,
  AppointmentStatus,
  HealthAlert,
  NotificationChannelType,
  NotificationDeliveryStatus,
  NotificationPreference,
  NotificationType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { InAppNotificationChannel } from './in-app-notification.channel';
import { NotificationDeliveryResult } from './notification-channel';
import { EmailNotificationProvider } from './providers/email-notification.provider';
import { PushNotificationProvider } from './providers/push-notification.provider';

type NotificationDatabaseClient = Prisma.TransactionClient | PrismaService;

type NotificationPreferenceSettings = Omit<
  NotificationPreference,
  'id' | 'userId' | 'createdAt' | 'updatedAt'
>;

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferenceSettings = {
  inAppEnabled: true,
  emailEnabled: true,
  pushEnabled: true,
  medicationReminders: true,
  appointmentReminders: true,
  healthAlerts: true,
  emergencyContactAlerts: true,
  securityAlerts: true,
  appointmentReminderHours: 24,
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inAppChannel: InAppNotificationChannel,
    @Optional()
    private readonly emailProvider?: EmailNotificationProvider,
    @Optional()
    private readonly pushProvider?: PushNotificationProvider,
    @Optional() private readonly config?: ConfigService,
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

    // Preserve a safe fallback for lightweight consumers and unit-test doubles.
    if (!this.emailProvider || !this.pushProvider) {
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

      const database = transaction ?? this.prisma;
      const configuredContactCount = await database.emergencyContact.count({
        where: { patientId: alert.patientId, active: true },
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

    const database = transaction ?? this.prisma;
    const patient = await database.patient.findUnique({
      where: { id: alert.patientId },
      include: { user: true },
    });

    if (!patient) {
      return [
        inAppResult,
        {
          channel: 'EMERGENCY_CONTACT',
          outcome: 'NOT_CONFIGURED',
          recipientCount: 0,
        },
      ];
    }

    if (patient.user.accountStatus !== AccountStatus.ACTIVE) {
      return [
        inAppResult,
        {
          channel: 'EMERGENCY_CONTACT',
          outcome: 'NOT_REQUESTED',
          recipientCount: 0,
        },
      ];
    }

    const preferences = await this.resolvePreferences(patient.userId, database);

    const notification = await database.notification.upsert({
      where: { deduplicationKey: `health-alert:${alert.id}` },
      update: {},
      create: {
        userId: patient.userId,
        type: NotificationType.HEALTH_ALERT,
        title: 'Health alert',
        message: alert.message,
        healthAlertId: alert.id,
        deduplicationKey: `health-alert:${alert.id}`,
      },
    });
    await this.recordInAppDelivery(
      database,
      notification.id,
      preferences.inAppEnabled && preferences.healthAlerts,
    );
    if (preferences.pushEnabled && preferences.healthAlerts) {
      await this.deliverPush(database, notification.id, patient.userId, {
        title: 'CareTrack health alert',
        body: 'A new health alert needs your attention.',
        data: { path: '/health', alertId: alert.id },
      });
    } else {
      await this.recordSkippedDelivery(
        database,
        notification.id,
        NotificationChannelType.PUSH,
      );
    }

    await this.notifyAssignedDoctorsForHealthAlert(
      database,
      alert,
      patient.user.name,
    );

    if (!rule.notifyEmergencyContacts || !preferences.emergencyContactAlerts) {
      return [
        inAppResult,
        {
          channel: 'EMERGENCY_CONTACT',
          outcome: 'NOT_REQUESTED',
          recipientCount: 0,
        },
      ];
    }

    const contacts = await database.emergencyContact.findMany({
      where: {
        patientId: alert.patientId,
        active: true,
        email: { not: null },
      },
      select: { email: true },
    });
    const recipients = contacts.flatMap(({ email }) => (email ? [email] : []));
    const emailResult = preferences.emailEnabled
      ? await this.deliverEmail(
          database,
          notification.id,
          recipients,
          'CareTrack emergency health alert',
          `${patient.user.name} has a health alert that may need attention. Open CareTrack or contact them directly. No measurement values are included in this message.`,
        )
      : 'NOT_REQUESTED';

    if (!preferences.emailEnabled) {
      await this.recordSkippedDelivery(
        database,
        notification.id,
        NotificationChannelType.EMAIL,
      );
    }

    return [
      inAppResult,
      {
        channel: 'EMERGENCY_CONTACT',
        outcome: emailResult,
        recipientCount: recipients.length,
      },
    ];
  }

  async notifyMedicationDose(
    medicationLogId: string,
    type: 'MEDICATION_REMINDER' | 'MEDICATION_OVERDUE',
  ) {
    const log = await this.prisma.medicationLog.findUnique({
      where: { id: medicationLogId },
      include: {
        medication: {
          include: { patient: { include: { user: true } } },
        },
      },
    });

    if (!log) {
      throw new NotFoundException('Medication log not found');
    }

    if (log.medication.patient.user.accountStatus !== AccountStatus.ACTIVE) {
      return null;
    }

    const preferences = await this.resolvePreferences(
      log.medication.patient.userId,
      this.prisma,
    );

    if (!preferences.medicationReminders) {
      return null;
    }

    const overdue = type === NotificationType.MEDICATION_OVERDUE;
    const title = overdue ? 'Medication dose missed' : 'Medication reminder';
    const message = overdue
      ? `${log.medication.name} (${log.medication.dosage}) was not recorded within the allowed time and is marked missed.`
      : `${log.medication.name} (${log.medication.dosage}) is due soon.`;
    const notification = await this.prisma.notification.upsert({
      where: {
        deduplicationKey: `medication:${log.id}:${type.toLowerCase()}`,
      },
      update: {},
      create: {
        userId: log.medication.patient.userId,
        type,
        title,
        message,
        medicationLogId: log.id,
        deduplicationKey: `medication:${log.id}:${type.toLowerCase()}`,
      },
    });

    await this.recordInAppDelivery(
      this.prisma,
      notification.id,
      preferences.inAppEnabled,
    );
    await Promise.all([
      preferences.emailEnabled
        ? this.deliverEmail(
            this.prisma,
            notification.id,
            [log.medication.patient.user.email],
            `CareTrack: ${title}`,
            `${message} Scheduled time: ${log.scheduledFor.toISOString()}. Sign in to CareTrack to record the dose.`,
          )
        : this.recordSkippedDelivery(
            this.prisma,
            notification.id,
            NotificationChannelType.EMAIL,
          ),
      preferences.pushEnabled
        ? this.deliverPush(
            this.prisma,
            notification.id,
            log.medication.patient.userId,
            {
              title,
              body: overdue
                ? 'A scheduled dose has not been recorded.'
                : 'A scheduled dose is due soon.',
              data: { path: '/medications', medicationLogId: log.id },
            },
          )
        : this.recordSkippedDelivery(
            this.prisma,
            notification.id,
            NotificationChannelType.PUSH,
          ),
    ]);

    return notification;
  }

  async notifyAppointmentReminder(
    appointmentId: string,
    now = new Date(),
  ): Promise<{ notificationsCreated: number }> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { include: { user: true } },
        doctor: { include: { user: true } },
      },
    });

    if (
      !appointment ||
      appointment.status !== AppointmentStatus.SCHEDULED ||
      appointment.appointmentDate.getTime() <= now.getTime() ||
      appointment.patient.user.accountStatus !== AccountStatus.ACTIVE ||
      appointment.doctor.user.accountStatus !== AccountStatus.ACTIVE
    ) {
      return { notificationsCreated: 0 };
    }

    const activeAssignment = await this.prisma.doctorPatientAccess.findFirst({
      where: {
        doctorId: appointment.doctorId,
        patientId: appointment.patientId,
        active: true,
      },
      select: { id: true },
    });

    const recipients = [
      {
        user: appointment.patient.user,
        counterpartName: appointment.doctor.user.name,
        counterpartLabel: 'doctor',
        path: '/appointments',
        requiresActiveAssignment: false,
      },
      {
        user: appointment.doctor.user,
        counterpartName: appointment.patient.user.name,
        counterpartLabel: 'patient',
        path: '/doctor',
        requiresActiveAssignment: true,
      },
    ] as const;
    let notificationsCreated = 0;

    for (const recipient of recipients) {
      if (
        recipient.user.accountStatus !== AccountStatus.ACTIVE ||
        (recipient.requiresActiveAssignment && !activeAssignment)
      ) {
        continue;
      }
      const preferences = await this.resolvePreferences(
        recipient.user.id,
        this.prisma,
      );
      const reminderStartsAt =
        appointment.appointmentDate.getTime() -
        preferences.appointmentReminderHours * 60 * 60 * 1000;

      if (
        !preferences.appointmentReminders ||
        now.getTime() < reminderStartsAt
      ) {
        continue;
      }

      const dateLabel = appointment.appointmentDate.toISOString();
      const title = 'Upcoming appointment';
      const message = `Your appointment with ${recipient.counterpartLabel} ${recipient.counterpartName} is scheduled for ${dateLabel}.`;
      const notification = await this.prisma.notification.upsert({
        where: {
          deduplicationKey: `appointment:${appointment.id}:${appointment.appointmentDate.getTime()}:${recipient.user.id}`,
        },
        update: {},
        create: {
          userId: recipient.user.id,
          type: NotificationType.APPOINTMENT_REMINDER,
          title,
          message,
          appointmentId: appointment.id,
          deduplicationKey: `appointment:${appointment.id}:${appointment.appointmentDate.getTime()}:${recipient.user.id}`,
        },
      });

      await this.recordInAppDelivery(
        this.prisma,
        notification.id,
        preferences.inAppEnabled,
      );
      await Promise.all([
        preferences.emailEnabled
          ? this.deliverEmail(
              this.prisma,
              notification.id,
              [recipient.user.email],
              `CareTrack: ${title}`,
              `${message} Sign in to CareTrack to review or update it.`,
            )
          : this.recordSkippedDelivery(
              this.prisma,
              notification.id,
              NotificationChannelType.EMAIL,
            ),
        preferences.pushEnabled
          ? this.deliverPush(this.prisma, notification.id, recipient.user.id, {
              title,
              body: `Appointment at ${dateLabel}`,
              data: {
                path: recipient.path,
                appointmentId: appointment.id,
              },
            })
          : this.recordSkippedDelivery(
              this.prisma,
              notification.id,
              NotificationChannelType.PUSH,
            ),
      ]);
      notificationsCreated += 1;
    }

    return { notificationsCreated };
  }

  async enqueueEmergencyMode(
    eventId: string,
    patientId: string,
  ): Promise<void> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId },
      include: {
        user: true,
        emergencyContacts: { where: { active: true } },
        doctorAccessGrants: {
          where: {
            active: true,
            doctor: { user: { accountStatus: AccountStatus.ACTIVE } },
          },
          include: { doctor: { include: { user: true } } },
        },
      },
    });

    if (!patient) return;

    const patientPreferences = await this.resolvePreferences(
      patient.userId,
      this.prisma,
    );
    const patientMessage =
      'Your urgent help request was sent to CareTrack. Review the readings shown in the app and contact local emergency services if you believe immediate help is needed. CareTrack does not provide a diagnosis.';
    const patientNotification = await this.prisma.notification.upsert({
      where: {
        deduplicationKey: `emergency-mode:${eventId}:${patient.userId}`,
      },
      update: {},
      create: {
        userId: patient.userId,
        type: NotificationType.EMERGENCY_ALERT,
        title: 'Urgent help request created',
        message: patientMessage,
        deduplicationKey: `emergency-mode:${eventId}:${patient.userId}`,
      },
    });
    await this.recordInAppDelivery(this.prisma, patientNotification.id, true);

    const contactEmails = patientPreferences.emergencyContactAlerts
      ? patient.emergencyContacts.flatMap((contact) =>
          contact.email ? [contact.email] : [],
        )
      : [];
    const patientEmailRecipients = [
      ...(patientPreferences.emailEnabled ? [patient.user.email] : []),
      ...contactEmails,
    ];
    await Promise.all([
      patientEmailRecipients.length > 0
        ? this.deliverEmail(
            this.prisma,
            patientNotification.id,
            patientEmailRecipients,
            'CareTrack urgent help request',
            `${patient.user.name} used CareTrack's “I feel unwell” feature and requested assistance. Contact them directly or local emergency services if you believe immediate help is needed. CareTrack does not provide a diagnosis.`,
          )
        : this.recordSkippedDelivery(
            this.prisma,
            patientNotification.id,
            NotificationChannelType.EMAIL,
          ),
      patientPreferences.pushEnabled
        ? this.deliverPush(
            this.prisma,
            patientNotification.id,
            patient.userId,
            {
              title: 'Urgent help request created',
              body: 'Your CareTrack help request was recorded.',
              data: { path: '/emergency', eventId },
            },
          )
        : this.recordSkippedDelivery(
            this.prisma,
            patientNotification.id,
            NotificationChannelType.PUSH,
          ),
    ]);

    for (const access of patient.doctorAccessGrants) {
      const doctorUser = access.doctor.user;
      const preferences = await this.resolvePreferences(
        doctorUser.id,
        this.prisma,
      );
      const message = `${patient.user.name} reported feeling unwell and requested attention. Review their recent CareTrack readings and contact them as appropriate. CareTrack does not provide a diagnosis.`;
      const notification = await this.prisma.notification.upsert({
        where: {
          deduplicationKey: `emergency-mode:${eventId}:${doctorUser.id}`,
        },
        update: {},
        create: {
          userId: doctorUser.id,
          type: NotificationType.EMERGENCY_ALERT,
          title: 'Assigned patient requested attention',
          message,
          deduplicationKey: `emergency-mode:${eventId}:${doctorUser.id}`,
        },
      });
      await this.recordInAppDelivery(this.prisma, notification.id, true);
      await Promise.all([
        preferences.emailEnabled && preferences.healthAlerts
          ? this.deliverEmail(
              this.prisma,
              notification.id,
              [doctorUser.email],
              'CareTrack assigned-patient help request',
              message,
            )
          : this.recordSkippedDelivery(
              this.prisma,
              notification.id,
              NotificationChannelType.EMAIL,
            ),
        preferences.pushEnabled && preferences.healthAlerts
          ? this.deliverPush(this.prisma, notification.id, doctorUser.id, {
              title: 'Assigned patient requested attention',
              body: 'Open CareTrack to review the urgent request.',
              data: { path: `/doctor/patients/${patient.id}`, eventId },
            })
          : this.recordSkippedDelivery(
              this.prisma,
              notification.id,
              NotificationChannelType.PUSH,
            ),
      ]);
    }
  }

  async findForUser(userId: string, unreadOnly: boolean, limit: number) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
      deliveries: {
        some: {
          channel: NotificationChannelType.IN_APP,
          status: NotificationDeliveryStatus.SENT,
        },
      },
    };
    const [items, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.notification.count({
        where: { ...where, readAt: null },
      }),
    ]);

    return { items, unreadCount };
  }

  async markRead(userId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updatedCount: result.count };
  }

  async markUnread(userId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: null },
    });

    if (result.count === 0) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
  }

  async getPreferences(userId: string) {
    const preference = await this.prisma.notificationPreference.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    return this.toPreferenceSettings(preference);
  }

  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException(
        'At least one notification preference is required',
      );
    }

    const preference = await this.prisma.notificationPreference.upsert({
      where: { userId },
      update: dto,
      create: { userId, ...dto },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'NOTIFICATION_PREFERENCES_UPDATED',
        entity: 'NotificationPreference',
        entityId: preference.id,
        metadata: { fields: Object.keys(dto).sort().join(',') },
      },
    });

    return this.toPreferenceSettings(preference);
  }

  async savePushSubscription(
    userId: string,
    input: {
      endpoint: string;
      p256dh: string;
      auth: string;
      expirationTime?: string | null;
    },
  ) {
    this.assertAllowedPushEndpoint(input.endpoint);

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const existing = await transaction.pushSubscription.findUnique({
            where: { endpoint: input.endpoint },
            select: { id: true, userId: true },
          });

          if (existing && existing.userId !== userId) {
            throw new ConflictException(
              'Push subscription is already registered',
            );
          }

          const data = {
            p256dh: input.p256dh,
            auth: input.auth,
            expirationTime: input.expirationTime
              ? new Date(input.expirationTime)
              : null,
            revokedAt: null,
          };
          const select = {
            id: true,
            endpoint: true,
            createdAt: true,
            updatedAt: true,
          } as const;

          return existing
            ? transaction.pushSubscription.update({
                where: { id: existing.id },
                data,
                select,
              })
            : transaction.pushSubscription.create({
                data: { ...data, userId, endpoint: input.endpoint },
                select,
              });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof ConflictException ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code))
      ) {
        throw new ConflictException('Push subscription is already registered');
      }

      throw error;
    }
  }

  async removePushSubscription(userId: string, subscriptionId: string) {
    const result = await this.prisma.pushSubscription.updateMany({
      where: { id: subscriptionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException('Push subscription not found');
    }
  }

  private assertAllowedPushEndpoint(endpoint: string): void {
    let url: URL;

    try {
      url = new URL(endpoint);
    } catch {
      throw new BadRequestException('Push subscription endpoint is invalid');
    }

    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
      throw new BadRequestException('Push subscription endpoint is invalid');
    }

    const configuredOrigins = (
      this.config?.get<string>('WEB_PUSH_ALLOWED_ORIGINS') ?? ''
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const originAllowed = configuredOrigins.some((origin) => {
      try {
        return new URL(origin).origin === url.origin;
      } catch {
        return false;
      }
    });
    const hostname = url.hostname.toLowerCase();
    const trustedProvider = [
      'fcm.googleapis.com',
      'android.googleapis.com',
      'updates.push.services.mozilla.com',
      'push.services.mozilla.com',
      'web.push.apple.com',
      'notify.windows.com',
    ].some(
      (trustedHostname) =>
        hostname === trustedHostname ||
        hostname.endsWith(`.${trustedHostname}`),
    );

    if (!originAllowed && !trustedProvider) {
      throw new BadRequestException(
        'Push subscription provider is not allowed',
      );
    }
  }

  private async notifyAssignedDoctorsForHealthAlert(
    database: NotificationDatabaseClient,
    alert: HealthAlert,
    patientName: string,
  ): Promise<void> {
    const assignments = await database.doctorPatientAccess.findMany({
      where: {
        patientId: alert.patientId,
        active: true,
        doctor: { user: { accountStatus: AccountStatus.ACTIVE } },
      },
      include: { doctor: { include: { user: true } } },
    });

    for (const assignment of assignments) {
      const user = assignment.doctor.user;
      const preferences = await this.resolvePreferences(user.id, database);
      if (!preferences.healthAlerts) continue;

      const deduplicationKey = `health-alert:${alert.id}:${user.id}`;
      const notification = await database.notification.upsert({
        where: { deduplicationKey },
        update: {},
        create: {
          userId: user.id,
          type: NotificationType.HEALTH_ALERT,
          title: 'Assigned patient health alert',
          message: `${patientName} has a CareTrack health alert that may need review. ${alert.message}`,
          healthAlertId: alert.id,
          deduplicationKey,
        },
      });
      await this.recordInAppDelivery(
        database,
        notification.id,
        preferences.inAppEnabled,
      );
      await Promise.all([
        preferences.emailEnabled
          ? this.deliverEmail(
              database,
              notification.id,
              [user.email],
              'CareTrack assigned-patient health alert',
              `${patientName} has a recorded health alert that may need review. Sign in to CareTrack to view the authorized record. No measurement values are included in this email.`,
            )
          : this.recordSkippedDelivery(
              database,
              notification.id,
              NotificationChannelType.EMAIL,
            ),
        preferences.pushEnabled
          ? this.deliverPush(database, notification.id, user.id, {
              title: 'Assigned patient health alert',
              body: 'Open CareTrack to review the authorized patient record.',
              data: {
                path: `/doctor/patients/${alert.patientId}`,
                alertId: alert.id,
              },
            })
          : this.recordSkippedDelivery(
              database,
              notification.id,
              NotificationChannelType.PUSH,
            ),
      ]);
    }
  }

  private async recordInAppDelivery(
    database: NotificationDatabaseClient,
    notificationId: string,
    enabled = true,
  ): Promise<void> {
    await database.notificationDelivery.upsert({
      where: {
        notificationId_channel: {
          notificationId,
          channel: NotificationChannelType.IN_APP,
        },
      },
      update: {},
      create: {
        notificationId,
        channel: NotificationChannelType.IN_APP,
        status: enabled
          ? NotificationDeliveryStatus.SENT
          : NotificationDeliveryStatus.SKIPPED,
        attempts: enabled ? 1 : 0,
        lastAttemptAt: new Date(),
        sentAt: enabled ? new Date() : null,
      },
    });
  }

  private async recordSkippedDelivery(
    database: NotificationDatabaseClient,
    notificationId: string,
    channel: NotificationChannelType,
  ): Promise<void> {
    await database.notificationDelivery.upsert({
      where: { notificationId_channel: { notificationId, channel } },
      update: {},
      create: {
        notificationId,
        channel,
        status: NotificationDeliveryStatus.SKIPPED,
      },
    });
  }

  private async resolvePreferences(
    userId: string,
    database: NotificationDatabaseClient,
  ): Promise<NotificationPreferenceSettings> {
    const repository = database.notificationPreference;

    if (!repository?.findUnique) {
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }

    const preference = await repository.findUnique({ where: { userId } });
    return preference
      ? this.toPreferenceSettings(preference)
      : DEFAULT_NOTIFICATION_PREFERENCES;
  }

  private toPreferenceSettings(
    preference: NotificationPreference,
  ): NotificationPreferenceSettings {
    return {
      inAppEnabled: preference.inAppEnabled,
      emailEnabled: preference.emailEnabled,
      pushEnabled: preference.pushEnabled,
      medicationReminders: preference.medicationReminders,
      appointmentReminders: preference.appointmentReminders,
      healthAlerts: preference.healthAlerts,
      emergencyContactAlerts: preference.emergencyContactAlerts,
      securityAlerts: preference.securityAlerts,
      appointmentReminderHours: preference.appointmentReminderHours,
    };
  }

  private async deliverEmail(
    database: NotificationDatabaseClient,
    notificationId: string,
    recipients: string[],
    subject: string,
    text: string,
  ): Promise<'DELIVERED' | 'NOT_CONFIGURED' | 'FAILED' | 'DEFERRED'> {
    const delivery = await database.notificationDelivery.upsert({
      where: {
        notificationId_channel: {
          notificationId,
          channel: NotificationChannelType.EMAIL,
        },
      },
      update: {},
      create: {
        notificationId,
        channel: NotificationChannelType.EMAIL,
        status: NotificationDeliveryStatus.PENDING,
      },
    });

    if (delivery.status === NotificationDeliveryStatus.SENT) {
      return 'DELIVERED';
    }

    if (delivery.status === NotificationDeliveryStatus.SKIPPED) {
      return 'NOT_CONFIGURED';
    }

    const claimed = await database.notificationDelivery.updateMany({
      where: {
        id: delivery.id,
        attempts: { lt: 5 },
        OR: [
          {
            status: {
              in: [
                NotificationDeliveryStatus.PENDING,
                NotificationDeliveryStatus.FAILED,
              ],
            },
          },
          {
            status: NotificationDeliveryStatus.PROCESSING,
            lastAttemptAt: { lt: new Date(Date.now() - 5 * 60_000) },
          },
        ],
      },
      data: {
        status: NotificationDeliveryStatus.PROCESSING,
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      return delivery.status === NotificationDeliveryStatus.FAILED
        ? 'FAILED'
        : 'DEFERRED';
    }

    const result = this.emailProvider
      ? await this.emailProvider.send({ recipients, subject, text })
      : { outcome: 'NOT_CONFIGURED' as const };
    const status =
      result.outcome === 'DELIVERED'
        ? NotificationDeliveryStatus.SENT
        : result.outcome === 'FAILED'
          ? NotificationDeliveryStatus.FAILED
          : NotificationDeliveryStatus.SKIPPED;

    await database.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status,
        sentAt: status === NotificationDeliveryStatus.SENT ? new Date() : null,
        providerMessageId: result.providerMessageId,
        errorCode: result.errorCode,
      },
    });

    return result.outcome;
  }

  private async deliverPush(
    database: NotificationDatabaseClient,
    notificationId: string,
    userId: string,
    message: {
      title: string;
      body: string;
      data?: Record<string, string>;
    },
  ): Promise<void> {
    const delivery = await database.notificationDelivery.upsert({
      where: {
        notificationId_channel: {
          notificationId,
          channel: NotificationChannelType.PUSH,
        },
      },
      update: {},
      create: {
        notificationId,
        channel: NotificationChannelType.PUSH,
        status: NotificationDeliveryStatus.PENDING,
      },
    });

    if (
      delivery.status === NotificationDeliveryStatus.SENT ||
      delivery.status === NotificationDeliveryStatus.SKIPPED
    ) {
      return;
    }

    const claimed = await database.notificationDelivery.updateMany({
      where: {
        id: delivery.id,
        attempts: { lt: 5 },
        OR: [
          {
            status: {
              in: [
                NotificationDeliveryStatus.PENDING,
                NotificationDeliveryStatus.FAILED,
              ],
            },
          },
          {
            status: NotificationDeliveryStatus.PROCESSING,
            lastAttemptAt: { lt: new Date(Date.now() - 5 * 60_000) },
          },
        ],
      },
      data: {
        status: NotificationDeliveryStatus.PROCESSING,
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      return;
    }

    const subscriptions = await database.pushSubscription.findMany({
      where: {
        userId,
        revokedAt: null,
        OR: [{ expirationTime: null }, { expirationTime: { gt: new Date() } }],
      },
    });
    let delivered = false;
    let errorCode: string | undefined;

    for (const subscription of subscriptions) {
      const result = this.pushProvider
        ? await this.pushProvider.send(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            message,
          )
        : { outcome: 'NOT_CONFIGURED' as const };

      delivered ||= result.outcome === 'DELIVERED';
      errorCode = result.errorCode ?? errorCode;

      if ('subscriptionExpired' in result && result.subscriptionExpired) {
        await database.pushSubscription.update({
          where: { id: subscription.id },
          data: { revokedAt: new Date() },
        });
      }
    }

    const status = delivered
      ? NotificationDeliveryStatus.SENT
      : subscriptions.length === 0 || !this.pushProvider?.configured
        ? NotificationDeliveryStatus.SKIPPED
        : NotificationDeliveryStatus.FAILED;

    await database.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status,
        sentAt: delivered ? new Date() : null,
        errorCode,
      },
    });
  }
}
