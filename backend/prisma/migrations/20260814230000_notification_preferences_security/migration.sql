ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APPOINTMENT_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EMERGENCY_ALERT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SECURITY_ALERT';

ALTER TABLE "Notification" ADD COLUMN "appointmentId" TEXT;

CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
  "medicationReminders" BOOLEAN NOT NULL DEFAULT true,
  "appointmentReminders" BOOLEAN NOT NULL DEFAULT true,
  "healthAlerts" BOOLEAN NOT NULL DEFAULT true,
  "emergencyContactAlerts" BOOLEAN NOT NULL DEFAULT true,
  "securityAlerts" BOOLEAN NOT NULL DEFAULT true,
  "appointmentReminderHours" INTEGER NOT NULL DEFAULT 24,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationPreference_appointmentReminderHours_check"
    CHECK ("appointmentReminderHours" BETWEEN 1 AND 168)
);

CREATE UNIQUE INDEX "NotificationPreference_userId_key"
  ON "NotificationPreference"("userId");
CREATE INDEX "Notification_appointmentId_idx"
  ON "Notification"("appointmentId");
CREATE INDEX "AuditLog_action_createdAt_idx"
  ON "AuditLog"("action", "createdAt");
CREATE INDEX "AuditLog_ipAddress_createdAt_idx"
  ON "AuditLog"("ipAddress", "createdAt");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationPreference"
  ADD CONSTRAINT "NotificationPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
