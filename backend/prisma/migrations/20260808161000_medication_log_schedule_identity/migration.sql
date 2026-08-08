-- A dose belongs to a schedule on a patient-local calendar date. Two distinct
-- schedule times can resolve to the same instant during a daylight-saving gap,
-- so scheduledFor alone is not a safe identity.
DROP INDEX IF EXISTS "MedicationLog_medicationId_scheduledFor_key";

ALTER TABLE "MedicationLog"
ADD COLUMN "scheduleId" TEXT,
ADD COLUMN "scheduleDate" DATE;

CREATE UNIQUE INDEX "MedicationLog_scheduleId_scheduleDate_key"
ON "MedicationLog"("scheduleId", "scheduleDate");

CREATE INDEX "MedicationLog_scheduleId_idx"
ON "MedicationLog"("scheduleId");

ALTER TABLE "MedicationLog"
ADD CONSTRAINT "MedicationLog_scheduleId_fkey"
FOREIGN KEY ("scheduleId") REFERENCES "MedicationSchedule"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
