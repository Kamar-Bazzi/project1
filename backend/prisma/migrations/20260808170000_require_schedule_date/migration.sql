-- A schedule-linked log must participate in the schedule/date uniqueness
-- identity. Legacy logs and logs whose schedule was deleted may keep a null
-- scheduleId.
ALTER TABLE "MedicationLog"
ADD CONSTRAINT "MedicationLog_schedule_identity_check"
CHECK ("scheduleId" IS NULL OR "scheduleDate" IS NOT NULL);
