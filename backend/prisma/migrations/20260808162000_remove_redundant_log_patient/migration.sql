-- Medication already has the required patient owner. Keeping a second patient
-- foreign key on each log permits contradictory ownership, so derive it through
-- Medication instead.
ALTER TABLE "MedicationLog"
DROP CONSTRAINT "MedicationLog_patientId_fkey";

DROP INDEX "MedicationLog_patientId_idx";

ALTER TABLE "MedicationLog"
DROP COLUMN "patientId";
