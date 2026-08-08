-- Retain legacy history but detach any inconsistent schedule link before
-- enforcing that a new log's schedule belongs to the same medication.
UPDATE "MedicationLog" AS "log"
SET "scheduleId" = NULL
WHERE "log"."scheduleId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "MedicationSchedule" AS "schedule"
    WHERE "schedule"."id" = "log"."scheduleId"
      AND "schedule"."medicationId" = "log"."medicationId"
  );

CREATE FUNCTION "validateMedicationLogScheduleOwner"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."scheduleId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "MedicationSchedule" AS "schedule"
    WHERE "schedule"."id" = NEW."scheduleId"
      AND "schedule"."medicationId" = NEW."medicationId"
  ) THEN
    RAISE EXCEPTION 'MedicationLog schedule must belong to its medication'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "MedicationLog_schedule_owner_check"
BEFORE INSERT OR UPDATE OF "scheduleId", "medicationId"
ON "MedicationLog"
FOR EACH ROW
EXECUTE FUNCTION "validateMedicationLogScheduleOwner"();
