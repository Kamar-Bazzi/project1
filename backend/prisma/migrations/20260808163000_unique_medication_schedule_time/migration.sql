-- Preserve existing log history while deterministically collapsing any legacy
-- duplicate schedule definitions before enforcing one row per local dose time.
WITH "rankedSchedules" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "medicationId", "scheduledTime"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" ASC
    ) AS "duplicateRank"
  FROM "MedicationSchedule"
),
"duplicateSchedules" AS (
  SELECT "id"
  FROM "rankedSchedules"
  WHERE "duplicateRank" > 1
)
UPDATE "MedicationLog" AS "log"
SET "scheduleId" = NULL
FROM "duplicateSchedules" AS "duplicate"
WHERE "log"."scheduleId" = "duplicate"."id";

WITH "rankedSchedules" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "medicationId", "scheduledTime"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" ASC
    ) AS "duplicateRank"
  FROM "MedicationSchedule"
)
DELETE FROM "MedicationSchedule" AS "duplicate"
USING "rankedSchedules" AS "ranked"
WHERE "duplicate"."id" = "ranked"."id"
  AND "ranked"."duplicateRank" > 1;

CREATE UNIQUE INDEX "MedicationSchedule_medicationId_scheduledTime_key"
ON "MedicationSchedule"("medicationId", "scheduledTime");
