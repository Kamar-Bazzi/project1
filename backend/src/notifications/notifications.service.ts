import {
  BadRequestException,
  ConflictException,
  Inject,
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

import { getLocalDayUtcRange } from '../common/time-zone/local-day';
import { paginationMetadata } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { InAppNotificationChannel } from './in-app-notification.channel';
import { NotificationDeliveryResult } from './notification-channel';
import { EmailNotificationProvider } from './providers/email-notification.provider';
import { PushNotificationProvider } from './providers/push-notification.provider';
import { SMS_PROVIDER } from './providers/sms.provider';
import type { SmsProvider } from './providers/sms.provider';

type NotificationDatabaseClient = Prisma.TransactionClient | PrismaService;

type NotificationPreferenceSettings = Omit<
  NotificationPreference,
  'id' | 'userId' | 'createdAt' | 'updatedAt'
>;

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferenceSettings = {
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
    @Optional()
    @Inject(SMS_PROVIDER)
    private readonly smsProvider?: SmsProvider,
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
      where: {
        deduplicationKey: `health-alert:${alert.id}:${alert.severity.toLowerCase()}`,
      },
      update: {},
      create: {
        userId: patient.userId,
        type: NotificationType.HEALTH_ALERT,
        title: 'Health alert',
        message: alert.message,
        healthAlertId: alert.id,
        deduplicationKey: `health-alert:${alert.id}:${alert.severity.toLowerCase()}`,
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
    if (preferences.smsEnabled && preferences.healthAlerts) {
      await this.deliverSms(database, notification.id, [patient.phoneNumber], {
        body: 'CareTrack health alert: sign in to review a new alert. No measurement values are included in this SMS.',
      });
    } else {
      await this.recordSkippedDelivery(
        database,
        notification.id,
        NotificationChannelType.SMS,
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
      select: { id: true, name: true, email: true },
    });
    const emailResult = await this.deliverEmergencyContactEmails(database, {
      patientId: alert.patientId,
      contacts,
      healthAlertId: alert.id,
      reason: `Health alert escalated to ${alert.severity}`,
      enabled: preferences.emailEnabled,
      subject: 'CareTrack emergency health alert',
      text: `${patient.user.name} has a health alert that may need attention. Open CareTrack or contact them directly. No measurement values are included in this message.`,
    });

    return [
      inAppResult,
      {
        channel: 'EMERGENCY_CONTACT',
        outcome: emailResult,
        recipientCount: contacts.length,
      },
    ];
  }

  async notifyWearableSyncStale(input: {
    userId: string;
    deviceId: string;
    deviceName: string;
    provider: string;
    referenceTime: Date;
    staleAt: Date;
  }) {
    const user = await this.prisma.user.findFirst({
      where: { id: input.userId, accountStatus: AccountStatus.ACTIVE },
      select: {
        id: true,
        email: true,
        patient: { select: { phoneNumber: true } },
      },
    });
    if (!user) return null;

    const preferences = await this.resolvePreferences(user.id, this.prisma);
    const title = 'Wearable synchronization overdue';
    const message = `${input.deviceName} has not synchronized within your configured time limit. Open the wearable page to check the connection.`;
    const deduplicationKey = `wearable-sync-stale:${input.deviceId}:${input.referenceTime.getTime()}`;
    const notification = await this.prisma.notification.upsert({
      where: { deduplicationKey },
      update: {},
      create: {
        userId: user.id,
        type: NotificationType.WEARABLE_SYNC_STALE,
        title,
        message,
        deduplicationKey,
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
            [user.email],
            `CareTrack: ${title}`,
            `${message} Last connection activity: ${input.referenceTime.toISOString()}.`,
          )
        : this.recordSkippedDelivery(
            this.prisma,
            notification.id,
            NotificationChannelType.EMAIL,
          ),
      preferences.pushEnabled
        ? this.deliverPush(this.prisma, notification.id, user.id, {
            title,
            body: `${input.deviceName} needs attention.`,
            data: { path: '/wearables', deviceId: input.deviceId },
          })
        : this.recordSkippedDelivery(
            this.prisma,
            notification.id,
            NotificationChannelType.PUSH,
          ),
      preferences.smsEnabled
        ? this.deliverSms(
            this.prisma,
            notification.id,
            [user.patient?.phoneNumber],
            {
              body: `CareTrack: ${input.deviceName} has not synchronized. Sign in to review wearable settings.`,
            },
          )
        : this.recordSkippedDelivery(
            this.prisma,
            notification.id,
            NotificationChannelType.SMS,
          ),
    ]);

    return notification;
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
      preferences.smsEnabled
        ? this.deliverSms(
            this.prisma,
            notification.id,
            [log.medication.patient.phoneNumber],
            {
              body: overdue
                ? `CareTrack: ${log.medication.name} was not recorded on time. Sign in to review your medications.`
                : `CareTrack: ${log.medication.name} is due soon. Sign in to record the dose.`,
            },
          )
        : this.recordSkippedDelivery(
            this.prisma,
            notification.id,
            NotificationChannelType.SMS,
          ),
    ]);

    return notification;
  }

  async notifyMedicationRefillLow(
    medicationId: string,
    requestedTimeZone?: string,
    now = new Date(),
  ) {
    const medication = await this.prisma.medication.findUnique({
      where: { id: medicationId },
      include: { patient: { include: { user: true } } },
    });
    if (
      !medication ||
      medication.patient.user.accountStatus !== AccountStatus.ACTIVE ||
      medication.remainingQuantity === null ||
      medication.lowQuantityThreshold === null ||
      medication.remainingQuantity > medication.lowQuantityThreshold
    ) {
      return null;
    }

    const preferences = await this.resolvePreferences(
      medication.patient.userId,
      this.prisma,
    );
    if (!preferences.medicationReminders) return null;

    const title = 'Medication supply running low';
    const message = `${medication.name} is at or below your saved low-supply threshold. Review the refill details with your pharmacy or care team.`;
    const dateKey = getLocalDayUtcRange(
      now,
      medication.patient.timeZone ?? requestedTimeZone,
    ).dateKey;
    const notification = await this.prisma.notification.upsert({
      where: {
        deduplicationKey: `medication-refill-low:${medication.id}:${dateKey}`,
      },
      update: {},
      create: {
        userId: medication.patient.userId,
        type: NotificationType.MEDICATION_REFILL_LOW,
        title,
        message,
        medicationId: medication.id,
        deduplicationKey: `medication-refill-low:${medication.id}:${dateKey}`,
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
            [medication.patient.user.email],
            `CareTrack: ${title}`,
            `${message} Sign in to CareTrack to review the stored quantity and refill date.`,
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
            medication.patient.userId,
            {
              title,
              body: 'A saved medication quantity is running low.',
              data: { path: '/medications', medicationId: medication.id },
            },
          )
        : this.recordSkippedDelivery(
            this.prisma,
            notification.id,
            NotificationChannelType.PUSH,
          ),
      preferences.smsEnabled
        ? this.deliverSms(
            this.prisma,
            notification.id,
            [medication.patient.phoneNumber],
            {
              body: `CareTrack: ${medication.name} supply is running low. Sign in to review refill details.`,
            },
          )
        : this.recordSkippedDelivery(
            this.prisma,
            notification.id,
            NotificationChannelType.SMS,
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
        smsRecipients: [appointment.patient.phoneNumber],
      },
      {
        user: appointment.doctor.user,
        counterpartName: appointment.patient.user.name,
        counterpartLabel: 'patient',
        path: '/doctor',
        requiresActiveAssignment: true,
        smsRecipients: [],
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
        preferences.smsEnabled
          ? this.deliverSms(
              this.prisma,
              notification.id,
              [...recipient.smsRecipients],
              {
                body: `CareTrack appointment reminder: scheduled for ${dateLabel}. Sign in to review details.`,
              },
            )
          : this.recordSkippedDelivery(
              this.prisma,
              notification.id,
              NotificationChannelType.SMS,
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

    const patientEmailRecipients = patientPreferences.emailEnabled
      ? [patient.user.email]
      : [];
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
      patientPreferences.emergencyContactAlerts
        ? this.deliverEmergencyContactEmails(this.prisma, {
            patientId: patient.id,
            contacts: patient.emergencyContacts,
            emergencyEventId: eventId,
            reason: 'Patient activated an urgent help request',
            enabled: patientPreferences.emailEnabled,
            subject: 'CareTrack urgent help request',
            text: `${patient.user.name} used CareTrack's “I feel unwell” feature and requested assistance. Contact them directly or local emergency services if you believe immediate help is needed. CareTrack does not provide a diagnosis.`,
          })
        : Promise.resolve('NOT_REQUESTED' as const),
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
      patientPreferences.smsEnabled
        ? this.deliverSms(
            this.prisma,
            patientNotification.id,
            [patient.phoneNumber],
            {
              body: 'CareTrack urgent help request recorded. Contact local emergency services if immediate help is needed.',
            },
          )
        : this.recordSkippedDelivery(
            this.prisma,
            patientNotification.id,
            NotificationChannelType.SMS,
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
              data: { path: `/doctor?patientId=${patient.id}`, eventId },
            })
          : this.recordSkippedDelivery(
              this.prisma,
              notification.id,
              NotificationChannelType.PUSH,
            ),
        this.recordSkippedDelivery(
          this.prisma,
          notification.id,
          NotificationChannelType.SMS,
        ),
      ]);
    }
  }

  async findForUser(
    userId: string,
    unreadOnly: boolean,
    limit: number,
    page = 1,
    type?: NotificationType,
  ) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
      ...(type ? { type } : {}),
      deliveries: {
        some: {
          channel: NotificationChannelType.IN_APP,
          status: NotificationDeliveryStatus.SENT,
        },
      },
    };
    const [items, unreadCount, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({
        where: { ...where, readAt: null },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      items,
      unreadCount,
      pagination: paginationMetadata(page, limit, total),
    };
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

      const deduplicationKey = `health-alert:${alert.id}:${alert.severity.toLowerCase()}:${user.id}`;
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
                path: `/doctor?patientId=${alert.patientId}`,
                alertId: alert.id,
              },
            })
          : this.recordSkippedDelivery(
              database,
              notification.id,
              NotificationChannelType.PUSH,
            ),
        this.recordSkippedDelivery(
          database,
          notification.id,
          NotificationChannelType.SMS,
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
      smsEnabled: preference.smsEnabled,
      medicationReminders: preference.medicationReminders,
      appointmentReminders: preference.appointmentReminders,
      healthAlerts: preference.healthAlerts,
      emergencyContactAlerts: preference.emergencyContactAlerts,
      securityAlerts: preference.securityAlerts,
      appointmentReminderHours: preference.appointmentReminderHours,
    };
  }

  private async deliverEmergencyContactEmails(
    database: NotificationDatabaseClient,
    input: {
      patientId: string;
      contacts: Array<{
        id: string;
        name: string;
        email: string | null;
      }>;
      healthAlertId?: string;
      emergencyEventId?: string;
      reason: string;
      enabled: boolean;
      subject: string;
      text: string;
    },
  ): Promise<'DELIVERED' | 'NOT_REQUESTED' | 'NOT_CONFIGURED' | 'FAILED'> {
    const contacts = input.contacts.filter(
      (contact): contact is typeof contact & { email: string } =>
        typeof contact.email === 'string' && contact.email.length > 0,
    );
    if (contacts.length === 0) return 'NOT_CONFIGURED';

    const outcomes: Array<
      'DELIVERED' | 'NOT_REQUESTED' | 'NOT_CONFIGURED' | 'FAILED'
    > = [];

    for (const contact of contacts) {
      const where = {
        patientId: input.patientId,
        emergencyContactId: contact.id,
        healthAlertId: input.healthAlertId ?? null,
        emergencyEventId: input.emergencyEventId ?? null,
        channel: NotificationChannelType.EMAIL,
      };
      const existing = await database.emergencyContactNotification.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
      });
      const history =
        existing ??
        (await database.emergencyContactNotification.create({
          data: {
            ...where,
            reason: input.reason.slice(0, 500),
            recipientName: contact.name,
            recipientAddress: contact.email,
            status: input.enabled
              ? NotificationDeliveryStatus.PENDING
              : NotificationDeliveryStatus.SKIPPED,
            errorCode: input.enabled ? null : 'CHANNEL_DISABLED',
          },
        }));

      if (history.status === NotificationDeliveryStatus.SENT) {
        outcomes.push('DELIVERED');
        continue;
      }
      if (!input.enabled) {
        outcomes.push('NOT_REQUESTED');
        continue;
      }

      const result = this.emailProvider
        ? await this.emailProvider.send({
            recipients: [contact.email],
            subject: input.subject,
            text: input.text,
          })
        : { outcome: 'NOT_CONFIGURED' as const };
      const status =
        result.outcome === 'DELIVERED'
          ? NotificationDeliveryStatus.SENT
          : result.outcome === 'FAILED'
            ? NotificationDeliveryStatus.FAILED
            : NotificationDeliveryStatus.SKIPPED;

      await database.emergencyContactNotification.update({
        where: { id: history.id },
        data: {
          status,
          providerMessageId: result.providerMessageId ?? null,
          errorCode:
            result.errorCode ??
            (result.outcome === 'NOT_CONFIGURED'
              ? 'EMAIL_NOT_CONFIGURED'
              : null),
          notifiedAt: new Date(),
        },
      });
      outcomes.push(result.outcome);
    }

    if (outcomes.includes('FAILED')) return 'FAILED';
    if (outcomes.every((outcome) => outcome === 'DELIVERED')) {
      return 'DELIVERED';
    }
    if (outcomes.every((outcome) => outcome === 'NOT_REQUESTED')) {
      return 'NOT_REQUESTED';
    }
    return 'NOT_CONFIGURED';
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

  private async deliverSms(
    database: NotificationDatabaseClient,
    notificationId: string,
    recipients: Array<string | null | undefined>,
    message: { body: string },
  ): Promise<'DELIVERED' | 'NOT_CONFIGURED' | 'FAILED' | 'DEFERRED'> {
    const delivery = await database.notificationDelivery.upsert({
      where: {
        notificationId_channel: {
          notificationId,
          channel: NotificationChannelType.SMS,
        },
      },
      update: {},
      create: {
        notificationId,
        channel: NotificationChannelType.SMS,
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

    const smsRecipients = [
      ...new Set(
        recipients
          .filter(
            (recipient): recipient is string => typeof recipient === 'string',
          )
          .map((recipient) => recipient.trim())
          .filter(Boolean),
      ),
    ];
    const result = this.smsProvider
      ? await this.smsProvider.send({
          recipients: smsRecipients,
          body: message.body,
        })
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
        errorCode:
          result.errorCode ??
          (result.outcome === 'NOT_CONFIGURED' ? 'SMS_NOT_CONFIGURED' : null),
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
