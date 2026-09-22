-- Scheduling, privacy, wearable reliability, alert review, and two-factor
-- authentication infrastructure. Existing assignments retain their current
-- access so this migration does not unexpectedly hide established care data.

ALTER TYPE "NotificationChannelType" ADD VALUE IF NOT EXISTS 'SMS';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WEARABLE_SYNC_STALE';

CREATE TYPE "TwoFactorMethod" AS ENUM ('EMAIL_OTP', 'AUTHENTICATOR');
CREATE TYPE "TwoFactorChallengePurpose" AS ENUM ('LOGIN', 'AUTHENTICATOR_SETUP');
CREATE TYPE "WearableSyncStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

ALTER TABLE "User"
ADD COLUMN "twoFactorMethod" "TwoFactorMethod",
ADD COLUMN "twoFactorSecretEncrypted" TEXT,
ADD COLUMN "twoFactorEnabledAt" TIMESTAMP(3);

ALTER TABLE "Doctor"
ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'UTC',
ADD COLUMN "slotDurationMinutes" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "DoctorPatientAccess"
ADD COLUMN "medicationsAllowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "measurementsAllowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "wearableDataAllowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "documentsAllowed" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "WearableDevice"
ADD COLUMN "syncWarningAfterHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN "staleNotificationSentAt" TIMESTAMP(3);

ALTER TABLE "AlertRule"
ADD COLUMN "warningReadingsRequired" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "urgentReadingsRequired" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN "evaluationWindowMinutes" INTEGER NOT NULL DEFAULT 60;

ALTER TABLE "HealthAlert"
ADD COLUMN "abnormalReadingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastEscalatedAt" TIMESTAMP(3);

ALTER TABLE "NotificationPreference"
ADD COLUMN "smsEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Appointment" ADD COLUMN "appointmentEnd" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "durationMinutes" INTEGER NOT NULL DEFAULT 30;
UPDATE "Appointment"
SET "appointmentEnd" = "appointmentDate" + INTERVAL '30 minutes'
WHERE "appointmentEnd" IS NULL;
ALTER TABLE "Appointment" ALTER COLUMN "appointmentEnd" SET NOT NULL;

DROP INDEX IF EXISTS "Appointment_scheduled_patient_time_key";
DROP INDEX IF EXISTS "Appointment_scheduled_doctor_time_key";
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Appointment"
ADD CONSTRAINT "Appointment_scheduled_patient_time_excl"
EXCLUDE USING gist (
  "patientId" WITH =,
  tsrange("appointmentDate", "appointmentEnd", '[)') WITH &&
) WHERE ("status" = 'SCHEDULED');
ALTER TABLE "Appointment"
ADD CONSTRAINT "Appointment_scheduled_doctor_time_excl"
EXCLUDE USING gist (
  "doctorId" WITH =,
  tsrange("appointmentDate", "appointmentEnd", '[)') WITH &&
) WHERE ("status" = 'SCHEDULED');

ALTER TABLE "Appointment"
ADD CONSTRAINT "Appointment_time_range_check"
CHECK (
  "durationMinutes" BETWEEN 5 AND 480
  AND "appointmentEnd" > "appointmentDate"
  AND "appointmentEnd" = "appointmentDate" + ("durationMinutes" * INTERVAL '1 minute')
);
ALTER TABLE "Doctor"
ADD CONSTRAINT "Doctor_slot_duration_check"
CHECK ("slotDurationMinutes" BETWEEN 5 AND 480);
ALTER TABLE "WearableDevice"
ADD CONSTRAINT "WearableDevice_sync_warning_check"
CHECK ("syncWarningAfterHours" BETWEEN 1 AND 2160);
ALTER TABLE "AlertRule"
ADD CONSTRAINT "AlertRule_escalation_check"
CHECK (
  "consecutiveReadingsRequired" >= 1
  AND "warningReadingsRequired" > "consecutiveReadingsRequired"
  AND "urgentReadingsRequired" > "warningReadingsRequired"
  AND "evaluationWindowMinutes" BETWEEN 1 AND 10080
);

CREATE TABLE "DoctorAvailability" (
  "id" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DoctorAvailability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DoctorAvailability_time_check" CHECK (
    "dayOfWeek" BETWEEN 0 AND 6
    AND "startMinute" BETWEEN 0 AND 1439
    AND "endMinute" BETWEEN 1 AND 1440
    AND "startMinute" < "endMinute"
  )
);

CREATE TABLE "WearableSyncRun" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "wearableDeviceId" TEXT NOT NULL,
  "provider" "WearableProvider" NOT NULL,
  "status" "WearableSyncStatus" NOT NULL DEFAULT 'SUCCESS',
  "receivedCount" INTEGER NOT NULL DEFAULT 0,
  "importedCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "errors" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "WearableSyncRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WearableSyncRun_counts_check" CHECK (
    "receivedCount" >= 0 AND "importedCount" >= 0
    AND "duplicateCount" >= 0 AND "rejectedCount" >= 0
    AND "errorCount" >= 0
  )
);

CREATE TABLE "HealthAlertTransition" (
  "id" TEXT NOT NULL,
  "healthAlertId" TEXT NOT NULL,
  "fromSeverity" "HealthAlertSeverity",
  "toSeverity" "HealthAlertSeverity" NOT NULL,
  "abnormalReadingCount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HealthAlertTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthAlertReview" (
  "id" TEXT NOT NULL,
  "healthAlertId" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HealthAlertReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmergencyContactNotification" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "emergencyContactId" TEXT,
  "healthAlertId" TEXT,
  "emergencyEventId" TEXT,
  "reason" TEXT NOT NULL,
  "recipientName" TEXT NOT NULL,
  "recipientAddress" TEXT NOT NULL,
  "channel" "NotificationChannelType" NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "providerMessageId" TEXT,
  "errorCode" TEXT,
  "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmergencyContactNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TwoFactorChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "purpose" "TwoFactorChallengePurpose" NOT NULL,
  "method" "TwoFactorMethod" NOT NULL,
  "codeHash" TEXT,
  "pendingSecretEncrypted" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TwoFactorChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TwoFactorChallenge_attempts_check" CHECK (
    "attempts" >= 0 AND "maxAttempts" BETWEEN 1 AND 10
  )
);

CREATE TABLE "NotificationRoutePreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "channel" "NotificationChannelType" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationRoutePreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DoctorAvailability_doctorId_dayOfWeek_startMinute_endMinute_key"
ON "DoctorAvailability"("doctorId", "dayOfWeek", "startMinute", "endMinute");
CREATE INDEX "DoctorAvailability_doctorId_dayOfWeek_idx"
ON "DoctorAvailability"("doctorId", "dayOfWeek");
CREATE INDEX "WearableSyncRun_patientId_startedAt_idx"
ON "WearableSyncRun"("patientId", "startedAt");
CREATE INDEX "WearableSyncRun_wearableDeviceId_startedAt_idx"
ON "WearableSyncRun"("wearableDeviceId", "startedAt");
CREATE INDEX "HealthAlertTransition_healthAlertId_occurredAt_idx"
ON "HealthAlertTransition"("healthAlertId", "occurredAt");
CREATE UNIQUE INDEX "HealthAlertReview_healthAlertId_doctorId_key"
ON "HealthAlertReview"("healthAlertId", "doctorId");
CREATE INDEX "HealthAlertReview_doctorId_reviewedAt_idx"
ON "HealthAlertReview"("doctorId", "reviewedAt");
CREATE INDEX "EmergencyContactNotification_patientId_notifiedAt_idx"
ON "EmergencyContactNotification"("patientId", "notifiedAt");
CREATE INDEX "EmergencyContactNotification_healthAlertId_idx"
ON "EmergencyContactNotification"("healthAlertId");
CREATE INDEX "EmergencyContactNotification_emergencyEventId_idx"
ON "EmergencyContactNotification"("emergencyEventId");
CREATE INDEX "TwoFactorChallenge_userId_purpose_consumedAt_idx"
ON "TwoFactorChallenge"("userId", "purpose", "consumedAt");
CREATE INDEX "TwoFactorChallenge_expiresAt_idx"
ON "TwoFactorChallenge"("expiresAt");
CREATE UNIQUE INDEX "NotificationRoutePreference_userId_type_channel_key"
ON "NotificationRoutePreference"("userId", "type", "channel");
CREATE INDEX "NotificationRoutePreference_userId_type_idx"
ON "NotificationRoutePreference"("userId", "type");

ALTER TABLE "DoctorAvailability"
ADD CONSTRAINT "DoctorAvailability_doctorId_fkey"
FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WearableSyncRun"
ADD CONSTRAINT "WearableSyncRun_patientId_fkey"
FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WearableSyncRun"
ADD CONSTRAINT "WearableSyncRun_wearableDeviceId_fkey"
FOREIGN KEY ("wearableDeviceId") REFERENCES "WearableDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthAlertTransition"
ADD CONSTRAINT "HealthAlertTransition_healthAlertId_fkey"
FOREIGN KEY ("healthAlertId") REFERENCES "HealthAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthAlertReview"
ADD CONSTRAINT "HealthAlertReview_healthAlertId_fkey"
FOREIGN KEY ("healthAlertId") REFERENCES "HealthAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthAlertReview"
ADD CONSTRAINT "HealthAlertReview_doctorId_fkey"
FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyContactNotification"
ADD CONSTRAINT "EmergencyContactNotification_patientId_fkey"
FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyContactNotification"
ADD CONSTRAINT "EmergencyContactNotification_emergencyContactId_fkey"
FOREIGN KEY ("emergencyContactId") REFERENCES "EmergencyContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyContactNotification"
ADD CONSTRAINT "EmergencyContactNotification_healthAlertId_fkey"
FOREIGN KEY ("healthAlertId") REFERENCES "HealthAlert"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyContactNotification"
ADD CONSTRAINT "EmergencyContactNotification_emergencyEventId_fkey"
FOREIGN KEY ("emergencyEventId") REFERENCES "EmergencyEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TwoFactorChallenge"
ADD CONSTRAINT "TwoFactorChallenge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationRoutePreference"
ADD CONSTRAINT "NotificationRoutePreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
