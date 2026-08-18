import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'CareTrack-Demo-2026!';

function daysFromNow(days, hour = 9, minute = 0) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  value.setUTCHours(hour, minute, 0, 0);
  return value;
}

function databaseName() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}

async function createNotification(userId, data) {
  return prisma.notification.create({
    data: {
      userId,
      ...data,
      deliveries: {
        create: {
          channel: 'IN_APP',
          status: 'SENT',
          attempts: 1,
          lastAttemptAt: data.createdAt,
          sentAt: data.createdAt,
        },
      },
    },
  });
}

async function main() {
  const target = databaseName();
  if (!target.includes('caretrack_screenshots')) {
    throw new Error(
      `Refusing to seed database "${target}". The database name must contain caretrack_screenshots.`,
    );
  }

  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const verifiedAt = daysFromNow(-120);

  const patientUser = await prisma.user.create({
    data: {
      name: 'Maya Example',
      email: 'maya.patient@example.test',
      passwordHash,
      role: 'PATIENT',
      accountStatus: 'ACTIVE',
      emailVerifiedAt: verifiedAt,
      patient: {
        create: {
          dateOfBirth: new Date('1992-04-18T00:00:00.000Z'),
          phoneNumber: '+961 70 000 101',
          emergencyContact: 'Sam Example · +961 70 000 202',
          timeZone: 'Asia/Beirut',
        },
      },
      notificationPreference: {
        create: {
          inAppEnabled: true,
          emailEnabled: true,
          pushEnabled: false,
          medicationReminders: true,
          appointmentReminders: true,
          healthAlerts: true,
          emergencyContactAlerts: true,
          securityAlerts: true,
          appointmentReminderHours: 24,
        },
      },
    },
    include: { patient: true },
  });

  const secondPatientUser = await prisma.user.create({
    data: {
      name: 'Jordan Sample',
      email: 'jordan.patient@example.test',
      passwordHash,
      role: 'PATIENT',
      accountStatus: 'ACTIVE',
      emailVerifiedAt: verifiedAt,
      patient: {
        create: {
          dateOfBirth: new Date('1987-11-02T00:00:00.000Z'),
          phoneNumber: '+961 70 000 303',
          timeZone: 'Asia/Beirut',
        },
      },
    },
    include: { patient: true },
  });

  const doctorUser = await prisma.user.create({
    data: {
      name: 'Rowan Example',
      email: 'rowan.doctor@example.test',
      passwordHash,
      role: 'DOCTOR',
      accountStatus: 'ACTIVE',
      emailVerifiedAt: verifiedAt,
      doctor: {
        create: {
          specialization: 'Family Medicine',
          licenseNumber: 'DEMO-LIC-1001',
        },
      },
      notificationPreference: { create: { pushEnabled: false } },
    },
    include: { doctor: true },
  });

  const secondDoctorUser = await prisma.user.create({
    data: {
      name: 'Casey Sample',
      email: 'casey.doctor@example.test',
      passwordHash,
      role: 'DOCTOR',
      accountStatus: 'ACTIVE',
      emailVerifiedAt: verifiedAt,
      doctor: {
        create: {
          specialization: 'Cardiology',
          licenseNumber: 'DEMO-LIC-1002',
        },
      },
    },
    include: { doctor: true },
  });

  const adminUser = await prisma.user.create({
    data: {
      name: 'Avery Admin',
      email: 'avery.admin@example.test',
      passwordHash,
      role: 'ADMIN',
      accountStatus: 'ACTIVE',
      emailVerifiedAt: verifiedAt,
      notificationPreference: { create: { pushEnabled: false } },
    },
  });

  await prisma.user.create({
    data: {
      name: 'Taylor Training',
      email: 'taylor.suspended@example.test',
      passwordHash,
      role: 'PATIENT',
      accountStatus: 'SUSPENDED',
      patient: { create: { timeZone: 'Asia/Beirut' } },
    },
  });

  const patient = patientUser.patient;
  const secondPatient = secondPatientUser.patient;
  const doctor = doctorUser.doctor;
  const secondDoctor = secondDoctorUser.doctor;
  if (!patient || !secondPatient || !doctor || !secondDoctor) {
    throw new Error('Synthetic profile creation failed.');
  }

  const assignment = await prisma.doctorPatientAccess.create({
    data: {
      doctorId: doctor.id,
      patientId: patient.id,
      active: true,
      grantedAt: daysFromNow(-90),
    },
  });
  await prisma.doctorPatientAccess.create({
    data: {
      doctorId: secondDoctor.id,
      patientId: secondPatient.id,
      active: true,
      grantedAt: daysFromNow(-25),
    },
  });

  const upcomingAppointment = await prisma.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentDate: daysFromNow(2, 11, 30),
      status: 'SCHEDULED',
      notes: 'Routine follow-up and medication review',
    },
  });
  const completedAppointment = await prisma.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentDate: daysFromNow(-8, 10, 0),
      status: 'COMPLETED',
      notes: 'Reviewed home readings and daily activity',
    },
  });
  await prisma.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentDate: daysFromNow(-22, 15, 0),
      status: 'CANCELLED',
      notes: 'Rescheduled by patient',
    },
  });
  await prisma.appointment.create({
    data: {
      patientId: secondPatient.id,
      doctorId: secondDoctor.id,
      appointmentDate: daysFromNow(4, 14, 0),
      status: 'SCHEDULED',
      notes: 'Synthetic cardiology review',
    },
  });

  const medication = await prisma.medication.create({
    data: {
      patientId: patient.id,
      name: 'Metformin',
      dosage: '500 mg',
      instructions: 'Take with breakfast and evening meal',
      startDate: daysFromNow(-75, 0),
      status: 'ACTIVE',
      schedules: {
        create: [
          { scheduledTime: '08:00', frequency: 'DAILY' },
          { scheduledTime: '20:00', frequency: 'DAILY' },
        ],
      },
    },
    include: { schedules: true },
  });
  const secondMedication = await prisma.medication.create({
    data: {
      patientId: patient.id,
      name: 'Vitamin D',
      dosage: '1000 IU',
      instructions: 'Take once each morning',
      startDate: daysFromNow(-40, 0),
      status: 'ACTIVE',
      schedules: {
        create: { scheduledTime: '09:00', frequency: 'DAILY' },
      },
    },
    include: { schedules: true },
  });

  const medicationLogs = [];
  for (let offset = -29; offset <= 0; offset += 1) {
    for (const schedule of medication.schedules) {
      const [hour] = schedule.scheduledTime.split(':').map(Number);
      const scheduledFor = daysFromNow(offset, hour);
      const missed =
        (offset === -1 && hour === 20) || (offset === -6 && hour === 8);
      const pending = offset === 0 && hour === 20;
      const status = pending ? 'PENDING' : missed ? 'MISSED' : 'TAKEN';
      medicationLogs.push(
        await prisma.medicationLog.create({
          data: {
            medicationId: medication.id,
            scheduleId: schedule.id,
            scheduleDate: daysFromNow(offset, 0),
            scheduledFor,
            takenAt:
              status === 'TAKEN'
                ? new Date(scheduledFor.getTime() + 12 * 60_000)
                : null,
            status,
          },
        }),
      );
    }
  }
  const vitaminSchedule = secondMedication.schedules[0];
  for (let offset = -14; offset <= 0; offset += 1) {
    const scheduledFor = daysFromNow(offset, 9);
    await prisma.medicationLog.create({
      data: {
        medicationId: secondMedication.id,
        scheduleId: vitaminSchedule.id,
        scheduleDate: daysFromNow(offset, 0),
        scheduledFor,
        takenAt: new Date(scheduledFor.getTime() + 5 * 60_000),
        status: 'TAKEN',
      },
    });
  }

  const measurements = [];
  for (const offset of [
    -55, -48, -40, -34, -28, -24, -20, -16, -12, -8, -4, -1,
  ]) {
    const recent = offset >= -28;
    measurements.push(
      await prisma.measurement.create({
        data: {
          patientId: patient.id,
          type: 'BLOOD_PRESSURE',
          value: recent ? 122 + Math.round(offset / -8) : 116,
          secondaryValue: recent ? 79 + Math.round(offset / -12) : 76,
          unit: 'mmHg',
          measuredAt: daysFromNow(offset, 7, 30),
        },
      }),
    );
    await prisma.measurement.create({
      data: {
        patientId: patient.id,
        type: 'WEIGHT',
        value: recent ? 72.4 + offset / 100 : 74.1,
        unit: 'kg',
        measuredAt: daysFromNow(offset, 7, 35),
      },
    });
  }
  const latestHeartRate = await prisma.measurement.create({
    data: {
      patientId: patient.id,
      type: 'HEART_RATE',
      value: 78,
      unit: 'bpm',
      measuredAt: daysFromNow(0, 8, 10),
    },
  });
  await prisma.measurement.create({
    data: {
      patientId: patient.id,
      type: 'OXYGEN_SATURATION',
      value: 96,
      unit: '%',
      measuredAt: daysFromNow(0, 8, 12),
    },
  });

  const device = await prisma.wearableDevice.create({
    data: {
      patientId: patient.id,
      provider: 'MOCK',
      deviceName: 'CareTrack Demo Watch',
      externalDeviceId: 'demo-watch-maya',
      connectedAt: daysFromNow(-80),
      lastSyncAt: daysFromNow(0, 8, 30),
      active: true,
    },
  });
  let lowOxygenMetric;
  for (const offset of [
    -55, -48, -40, -34, -28, -24, -20, -16, -12, -8, -4, -1, 0,
  ]) {
    const values = [
      ['STEPS', offset >= -28 ? 6800 + (28 + offset) * 95 : 5200, 'steps'],
      [
        'SLEEP_DURATION',
        offset >= -28 ? 7.1 + ((offset + 28) % 3) * 0.15 : 6.6,
        'hours',
      ],
      ['BLOOD_OXYGEN', offset === 0 ? 92 : 96 + ((offset + 55) % 2), '%'],
      ['HEART_RATE', offset === 0 ? 88 : 72 + ((offset + 55) % 8), 'bpm'],
    ];
    for (const [metricType, value, unit] of values) {
      const metric = await prisma.healthMetric.create({
        data: {
          patientId: patient.id,
          wearableDeviceId: device.id,
          metricType,
          value,
          unit,
          measuredAt: daysFromNow(
            offset,
            metricType === 'SLEEP_DURATION' ? 6 : 8,
            20,
          ),
          source: 'MOCK',
          externalRecordId: `demo-${metricType.toLowerCase()}-${offset}`,
          deduplicationKey: `screenshots:university-demo:${metricType}:${String(offset).padStart(3, '0')}`,
          metadata: { synthetic: true, source: 'university-demo' },
        },
      });
      if (offset === 0 && metricType === 'BLOOD_OXYGEN')
        lowOxygenMetric = metric;
    }
  }

  const oxygenRule = await prisma.alertRule.create({
    data: {
      patientId: patient.id,
      metricType: 'BLOOD_OXYGEN',
      enabled: true,
      minimumValue: 94,
      consecutiveReadingsRequired: 2,
      severity: 'WARNING',
      notifyEmergencyContacts: false,
    },
  });
  const activeAlert = await prisma.healthAlert.create({
    data: {
      patientId: patient.id,
      metricType: 'BLOOD_OXYGEN',
      severity: 'WARNING',
      message:
        'A wearable oxygen reading was below the configured personal threshold.',
      metricId: lowOxygenMetric?.id,
      alertRuleId: oxygenRule.id,
      status: 'ACTIVE',
      detectedAt: daysFromNow(0, 8, 25),
    },
  });
  await prisma.healthAlert.create({
    data: {
      patientId: patient.id,
      metricType: 'HEART_RATE',
      severity: 'INFO',
      message: 'A brief heart-rate change was recorded and later resolved.',
      status: 'RESOLVED',
      detectedAt: daysFromNow(-5, 16),
      acknowledgedAt: daysFromNow(-5, 16, 15),
      resolvedAt: daysFromNow(-5, 17),
    },
  });

  await prisma.emergencyContact.create({
    data: {
      patientId: patient.id,
      name: 'Sam Example',
      relationship: 'Family member',
      phone: '+961 70 000 202',
      email: 'sam.contact@example.test',
      active: true,
    },
  });
  await prisma.emergencyContact.create({
    data: {
      patientId: patient.id,
      name: 'Alex Sample',
      relationship: 'Trusted friend',
      phone: '+961 70 000 404',
      active: true,
    },
  });

  const activeEmergency = await prisma.emergencyEvent.create({
    data: {
      patientId: patient.id,
      status: 'ACTIVE',
      note: 'Synthetic demonstration alert: feeling unwell after a walk.',
      triggeredAt: daysFromNow(0, 8, 35),
    },
  });
  await prisma.emergencyEvent.create({
    data: {
      patientId: patient.id,
      status: 'RESOLVED',
      note: 'Synthetic demonstration event resolved after contacting a family member.',
      triggeredAt: daysFromNow(-45, 18),
      resolvedAt: daysFromNow(-45, 18, 20),
    },
  });

  await prisma.doctorNote.create({
    data: {
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentId: completedAppointment.id,
      title: 'Home-reading review',
      content:
        'Reviewed synthetic home measurements. Continue recording at consistent times and discuss changes at follow-up.',
      category: 'CARE_PLAN',
      createdAt: daysFromNow(-8, 10, 30),
    },
  });
  await prisma.patientFollowUp.create({
    data: {
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentId: completedAppointment.id,
      summary:
        'Follow-up completed with review of medication routine and wearable trends.',
      recommendations:
        'Keep the existing tracking routine and bring the exported report to the next visit.',
      occurredAt: daysFromNow(-8, 10, 45),
      followUpAt: upcomingAppointment.appointmentDate,
      createdAt: daysFromNow(-8, 10, 50),
    },
  });

  const stepsGoal = await prisma.healthGoal.create({
    data: {
      patientId: patient.id,
      title: 'Daily walking target',
      metric: 'DAILY_STEPS',
      direction: 'AT_LEAST',
      targetValue: 8000,
      unit: 'steps',
      startDate: daysFromNow(-30, 0),
      targetDate: daysFromNow(60, 0),
      status: 'ACTIVE',
    },
  });
  const sleepGoal = await prisma.healthGoal.create({
    data: {
      patientId: patient.id,
      title: 'Restful sleep routine',
      metric: 'SLEEP_DURATION',
      direction: 'AT_LEAST',
      targetValue: 7.5,
      unit: 'hours',
      startDate: daysFromNow(-20, 0),
      targetDate: daysFromNow(45, 0),
      status: 'ACTIVE',
    },
  });
  const adherenceGoal = await prisma.healthGoal.create({
    data: {
      patientId: patient.id,
      title: 'Medication consistency',
      metric: 'MEDICATION_ADHERENCE',
      direction: 'AT_LEAST',
      targetValue: 95,
      unit: '%',
      startDate: daysFromNow(-30, 0),
      targetDate: daysFromNow(60, 0),
      status: 'ACTIVE',
    },
  });
  await prisma.healthGoalProgress.createMany({
    data: [
      {
        healthGoalId: stepsGoal.id,
        value: 6900,
        source: 'MANUAL',
        note: 'Week one average',
        recordedAt: daysFromNow(-14, 20),
      },
      {
        healthGoalId: stepsGoal.id,
        value: 7840,
        source: 'MANUAL',
        note: 'Recent daily result',
        recordedAt: daysFromNow(-1, 20),
      },
      {
        healthGoalId: sleepGoal.id,
        value: 7.2,
        source: 'MANUAL',
        note: 'Recent nightly average',
        recordedAt: daysFromNow(-1, 7),
      },
      {
        healthGoalId: adherenceGoal.id,
        value: 96.7,
        source: 'MANUAL',
        note: 'Thirty-day adherence',
        recordedAt: daysFromNow(-1, 21),
      },
    ],
  });

  const latestMissedLog = medicationLogs.find(
    (log) => log.status === 'MISSED' && log.scheduledFor > daysFromNow(-2, 0),
  );
  await createNotification(patientUser.id, {
    type: 'EMERGENCY_ALERT',
    title: 'Urgent alert sent',
    message:
      'Your in-app urgent alert was created. Contact local emergency services if you may be in immediate danger.',
    deduplicationKey: `screenshots:emergency:${activeEmergency.id}`,
    createdAt: daysFromNow(0, 8, 36),
  });
  await createNotification(patientUser.id, {
    type: 'HEALTH_ALERT',
    title: 'Health reading needs attention',
    message:
      'A wearable reading crossed your personal alert threshold. Review the reading and contact a qualified professional if concerned.',
    deduplicationKey: `screenshots:alert:${activeAlert.id}`,
    healthAlertId: activeAlert.id,
    createdAt: daysFromNow(0, 8, 26),
  });
  if (latestMissedLog) {
    await createNotification(patientUser.id, {
      type: 'MEDICATION_OVERDUE',
      title: 'Medication dose missed',
      message:
        'The scheduled evening Metformin dose is overdue. Record the dose status when you can.',
      deduplicationKey: `screenshots:missed:${latestMissedLog.id}`,
      medicationLogId: latestMissedLog.id,
      createdAt: daysFromNow(-1, 21),
    });
  }
  await createNotification(patientUser.id, {
    type: 'APPOINTMENT_REMINDER',
    title: 'Upcoming appointment',
    message:
      'Your appointment with Dr. Rowan Example is coming up in two days.',
    deduplicationKey: `screenshots:appointment:${upcomingAppointment.id}`,
    appointmentId: upcomingAppointment.id,
    readAt: daysFromNow(-1, 12),
    createdAt: daysFromNow(-1, 9),
  });
  await createNotification(doctorUser.id, {
    type: 'HEALTH_ALERT',
    title: 'Assigned patient alert',
    message:
      'An assigned patient has an active wearable alert requiring review.',
    deduplicationKey: `screenshots:doctor-alert:${activeAlert.id}`,
    healthAlertId: activeAlert.id,
    createdAt: daysFromNow(0, 8, 28),
  });

  await prisma.authSession.createMany({
    data: [
      {
        userId: patientUser.id,
        tokenHash: 'a'.repeat(64),
        expiresAt: daysFromNow(20),
        lastUsedAt: daysFromNow(0, 8, 40),
        createdByIp: '127.0.0.1',
        userAgent: 'CareTrack synthetic desktop session',
      },
      {
        userId: patientUser.id,
        tokenHash: 'b'.repeat(64),
        expiresAt: daysFromNow(12),
        lastUsedAt: daysFromNow(-1, 18),
        createdByIp: '127.0.0.1',
        userAgent: 'CareTrack synthetic mobile session',
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      {
        userId: adminUser.id,
        action: 'DOCTOR_PATIENT_ASSIGNED',
        entity: 'DoctorPatientAccess',
        entityId: assignment.id,
        ipAddress: '127.0.0.1',
        metadata: {
          doctor: 'Rowan Example',
          patient: 'Maya Example',
          synthetic: true,
        },
        createdAt: daysFromNow(0, 7, 55),
      },
      {
        userId: doctorUser.id,
        action: 'MEDICAL_RECORD_ACCESSED',
        entity: 'Patient',
        entityId: patient.id,
        ipAddress: '127.0.0.1',
        metadata: { scope: 'ASSIGNED_PATIENT', synthetic: true },
        createdAt: daysFromNow(0, 8, 5),
      },
      {
        userId: patientUser.id,
        action: 'LOGIN_SUCCESS',
        entity: 'AuthSession',
        ipAddress: '127.0.0.1',
        metadata: { synthetic: true },
        createdAt: daysFromNow(0, 8, 0),
      },
      {
        userId: patientUser.id,
        action: 'LOGIN_FAILED',
        entity: 'User',
        ipAddress: '127.0.0.1',
        metadata: { reason: 'INVALID_CREDENTIALS', synthetic: true },
        createdAt: daysFromNow(-1, 19),
      },
      {
        userId: adminUser.id,
        action: 'ACCOUNT_STATUS_CHANGED',
        entity: 'User',
        entityId: patientUser.id,
        ipAddress: '127.0.0.1',
        metadata: { from: 'SUSPENDED', to: 'ACTIVE', synthetic: true },
        createdAt: daysFromNow(-2, 12),
      },
      {
        userId: doctorUser.id,
        action: 'DOCTOR_NOTE_CREATED',
        entity: 'DoctorNote',
        ipAddress: '127.0.0.1',
        metadata: { patientScope: 'ASSIGNED', synthetic: true },
        createdAt: daysFromNow(-8, 10, 30),
      },
      {
        userId: patientUser.id,
        action: 'EMERGENCY_EVENT_CREATED',
        entity: 'EmergencyEvent',
        entityId: activeEmergency.id,
        ipAddress: '127.0.0.1',
        metadata: { notificationQueued: true, synthetic: true },
        createdAt: daysFromNow(0, 8, 35),
      },
      {
        userId: patientUser.id,
        action: 'MEASUREMENT_CREATED',
        entity: 'Measurement',
        entityId: latestHeartRate.id,
        ipAddress: '127.0.0.1',
        metadata: { type: 'HEART_RATE', synthetic: true },
        createdAt: daysFromNow(0, 8, 10),
      },
    ],
  });

  console.log(
    JSON.stringify({
      database: target,
      synthetic: true,
      users: {
        patient: patientUser.email,
        doctor: doctorUser.email,
        admin: adminUser.email,
      },
      seededAt: new Date().toISOString(),
    }),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
