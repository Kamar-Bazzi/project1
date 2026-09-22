ALTER TYPE "NotificationType" ADD VALUE 'MEDICATION_REFILL_LOW';

CREATE TYPE "CheckInMedicationAdherence" AS ENUM ('ALL_TAKEN', 'SOME_MISSED', 'NONE_TAKEN', 'NOT_APPLICABLE');
CREATE TYPE "FollowUpPlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "FollowUpTaskStatus" AS ENUM ('TODO', 'DONE', 'CANCELLED');
CREATE TYPE "HealthDocumentCategory" AS ENUM ('PRESCRIPTION', 'LABORATORY_REPORT', 'MEDICAL_REPORT', 'OTHER');

ALTER TABLE "Medication"
  ADD COLUMN "remainingQuantity" DOUBLE PRECISION,
  ADD COLUMN "quantityUnit" TEXT,
  ADD COLUMN "lowQuantityThreshold" DOUBLE PRECISION,
  ADD COLUMN "nextRefillDate" DATE,
  ADD COLUMN "pharmacyName" TEXT;

ALTER TABLE "Medication"
  ADD CONSTRAINT "Medication_remainingQuantity_check"
    CHECK ("remainingQuantity" IS NULL OR "remainingQuantity" >= 0),
  ADD CONSTRAINT "Medication_lowQuantityThreshold_check"
    CHECK ("lowQuantityThreshold" IS NULL OR "lowQuantityThreshold" >= 0);

ALTER TABLE "Notification" ADD COLUMN "medicationId" TEXT;

CREATE TABLE "FollowUpPlan" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "nextReviewAt" TIMESTAMP(3),
  "status" "FollowUpPlanStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FollowUpPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FollowUpTask" (
  "id" TEXT NOT NULL,
  "followUpPlanId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "dueAt" TIMESTAMP(3),
  "status" "FollowUpTaskStatus" NOT NULL DEFAULT 'TODO',
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FollowUpTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FollowUpTask_completion_check" CHECK (
    ("status" = 'DONE' AND "completedAt" IS NOT NULL)
    OR ("status" <> 'DONE' AND "completedAt" IS NULL)
  )
);

CREATE TABLE "SymptomEntry" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "severity" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SymptomEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SymptomEntry_severity_check" CHECK ("severity" BETWEEN 1 AND 10)
);

CREATE TABLE "SymptomMedication" (
  "symptomId" TEXT NOT NULL,
  "medicationId" TEXT NOT NULL,
  CONSTRAINT "SymptomMedication_pkey" PRIMARY KEY ("symptomId", "medicationId")
);

CREATE TABLE "SymptomMeasurement" (
  "symptomId" TEXT NOT NULL,
  "measurementId" TEXT NOT NULL,
  CONSTRAINT "SymptomMeasurement_pkey" PRIMARY KEY ("symptomId", "measurementId")
);

CREATE TABLE "DailyCheckIn" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "localDate" DATE NOT NULL,
  "timeZone" TEXT NOT NULL,
  "mood" INTEGER NOT NULL,
  "painLevel" INTEGER NOT NULL,
  "sleepQuality" INTEGER NOT NULL,
  "symptoms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "activityMinutes" INTEGER NOT NULL,
  "medicationAdherence" "CheckInMedicationAdherence" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyCheckIn_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DailyCheckIn_mood_check" CHECK ("mood" BETWEEN 1 AND 5),
  CONSTRAINT "DailyCheckIn_painLevel_check" CHECK ("painLevel" BETWEEN 0 AND 10),
  CONSTRAINT "DailyCheckIn_sleepQuality_check" CHECK ("sleepQuality" BETWEEN 1 AND 5),
  CONSTRAINT "DailyCheckIn_activityMinutes_check" CHECK ("activityMinutes" BETWEEN 0 AND 1440)
);

CREATE TABLE "HealthDocument" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "uploadedByUserId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" "HealthDocumentCategory" NOT NULL,
  "description" TEXT,
  "documentDate" DATE,
  "originalFileName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "deletionPendingAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HealthDocument_sizeBytes_check" CHECK ("sizeBytes" > 0)
);

CREATE INDEX "FollowUpPlan_patientId_status_nextReviewAt_idx" ON "FollowUpPlan"("patientId", "status", "nextReviewAt");
CREATE INDEX "FollowUpPlan_doctorId_patientId_status_idx" ON "FollowUpPlan"("doctorId", "patientId", "status");
CREATE INDEX "FollowUpTask_followUpPlanId_status_dueAt_idx" ON "FollowUpTask"("followUpPlanId", "status", "dueAt");
CREATE INDEX "SymptomEntry_patientId_occurredAt_idx" ON "SymptomEntry"("patientId", "occurredAt");
CREATE INDEX "SymptomEntry_patientId_severity_idx" ON "SymptomEntry"("patientId", "severity");
CREATE INDEX "SymptomMedication_medicationId_idx" ON "SymptomMedication"("medicationId");
CREATE INDEX "SymptomMeasurement_measurementId_idx" ON "SymptomMeasurement"("measurementId");
CREATE UNIQUE INDEX "DailyCheckIn_patientId_localDate_key" ON "DailyCheckIn"("patientId", "localDate");
CREATE INDEX "DailyCheckIn_patientId_localDate_idx" ON "DailyCheckIn"("patientId", "localDate");
CREATE UNIQUE INDEX "HealthDocument_storageKey_key" ON "HealthDocument"("storageKey");
CREATE INDEX "HealthDocument_patientId_createdAt_idx" ON "HealthDocument"("patientId", "createdAt");
CREATE INDEX "HealthDocument_uploadedByUserId_idx" ON "HealthDocument"("uploadedByUserId");
CREATE INDEX "HealthDocument_patientId_category_idx" ON "HealthDocument"("patientId", "category");
CREATE INDEX "HealthDocument_deletionPendingAt_idx" ON "HealthDocument"("deletionPendingAt");
CREATE INDEX "Notification_medicationId_idx" ON "Notification"("medicationId");

ALTER TABLE "FollowUpPlan" ADD CONSTRAINT "FollowUpPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpPlan" ADD CONSTRAINT "FollowUpPlan_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_followUpPlanId_fkey" FOREIGN KEY ("followUpPlanId") REFERENCES "FollowUpPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SymptomEntry" ADD CONSTRAINT "SymptomEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SymptomMedication" ADD CONSTRAINT "SymptomMedication_symptomId_fkey" FOREIGN KEY ("symptomId") REFERENCES "SymptomEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SymptomMedication" ADD CONSTRAINT "SymptomMedication_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SymptomMeasurement" ADD CONSTRAINT "SymptomMeasurement_symptomId_fkey" FOREIGN KEY ("symptomId") REFERENCES "SymptomEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SymptomMeasurement" ADD CONSTRAINT "SymptomMeasurement_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "Measurement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyCheckIn" ADD CONSTRAINT "DailyCheckIn_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthDocument" ADD CONSTRAINT "HealthDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthDocument" ADD CONSTRAINT "HealthDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
