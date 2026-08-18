CREATE TYPE "DoctorNoteCategory" AS ENUM ('GENERAL', 'CARE_PLAN', 'MEDICATION_REVIEW', 'FOLLOW_UP');
CREATE TYPE "HealthGoalMetric" AS ENUM ('WEIGHT', 'DAILY_STEPS', 'DAILY_ACTIVITY_MINUTES', 'HEART_RATE', 'BLOOD_PRESSURE', 'BLOOD_GLUCOSE', 'OXYGEN_SATURATION', 'SLEEP_DURATION', 'MEDICATION_ADHERENCE');
CREATE TYPE "HealthGoalDirection" AS ENUM ('AT_LEAST', 'AT_MOST', 'BETWEEN');
CREATE TYPE "HealthGoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'PAUSED', 'CANCELLED');
CREATE TYPE "HealthGoalProgressSource" AS ENUM ('MANUAL', 'AUTOMATIC');
CREATE TYPE "EmergencyEventStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'CANCELLED');

CREATE TABLE "DoctorNote" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "appointmentId" TEXT,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "category" "DoctorNoteCategory" NOT NULL DEFAULT 'GENERAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DoctorNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientFollowUp" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "appointmentId" TEXT,
  "summary" TEXT NOT NULL,
  "recommendations" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "followUpAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthGoal" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "metric" "HealthGoalMetric" NOT NULL,
  "direction" "HealthGoalDirection" NOT NULL,
  "targetValue" DOUBLE PRECISION NOT NULL,
  "targetSecondaryValue" DOUBLE PRECISION,
  "unit" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "targetDate" TIMESTAMP(3),
  "status" "HealthGoalStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthGoal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthGoalProgress" (
  "id" TEXT NOT NULL,
  "healthGoalId" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "secondaryValue" DOUBLE PRECISION,
  "source" "HealthGoalProgressSource" NOT NULL DEFAULT 'MANUAL',
  "note" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HealthGoalProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmergencyEvent" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "status" "EmergencyEventStatus" NOT NULL DEFAULT 'ACTIVE',
  "note" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmergencyEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DoctorNote_patientId_createdAt_idx" ON "DoctorNote"("patientId", "createdAt");
CREATE INDEX "DoctorNote_doctorId_patientId_createdAt_idx" ON "DoctorNote"("doctorId", "patientId", "createdAt");
CREATE INDEX "DoctorNote_appointmentId_idx" ON "DoctorNote"("appointmentId");
CREATE INDEX "PatientFollowUp_patientId_occurredAt_idx" ON "PatientFollowUp"("patientId", "occurredAt");
CREATE INDEX "PatientFollowUp_doctorId_patientId_occurredAt_idx" ON "PatientFollowUp"("doctorId", "patientId", "occurredAt");
CREATE INDEX "PatientFollowUp_appointmentId_idx" ON "PatientFollowUp"("appointmentId");
CREATE INDEX "HealthGoal_patientId_status_targetDate_idx" ON "HealthGoal"("patientId", "status", "targetDate");
CREATE INDEX "HealthGoal_patientId_metric_createdAt_idx" ON "HealthGoal"("patientId", "metric", "createdAt");
CREATE INDEX "HealthGoalProgress_healthGoalId_recordedAt_idx" ON "HealthGoalProgress"("healthGoalId", "recordedAt");
CREATE INDEX "EmergencyEvent_patientId_status_triggeredAt_idx" ON "EmergencyEvent"("patientId", "status", "triggeredAt");
CREATE UNIQUE INDEX "EmergencyEvent_one_active_per_patient_idx" ON "EmergencyEvent"("patientId") WHERE "status" = 'ACTIVE';

ALTER TABLE "DoctorNote" ADD CONSTRAINT "DoctorNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoctorNote" ADD CONSTRAINT "DoctorNote_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoctorNote" ADD CONSTRAINT "DoctorNote_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientFollowUp" ADD CONSTRAINT "PatientFollowUp_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientFollowUp" ADD CONSTRAINT "PatientFollowUp_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientFollowUp" ADD CONSTRAINT "PatientFollowUp_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthGoal" ADD CONSTRAINT "HealthGoal_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthGoalProgress" ADD CONSTRAINT "HealthGoalProgress_healthGoalId_fkey" FOREIGN KEY ("healthGoalId") REFERENCES "HealthGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyEvent" ADD CONSTRAINT "EmergencyEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
