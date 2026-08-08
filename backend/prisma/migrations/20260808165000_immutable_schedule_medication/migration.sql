-- A schedule's medication owner is immutable. Moving it would invalidate the
-- medication/schedule consistency guaranteed for existing dose logs.
CREATE FUNCTION "preventMedicationScheduleOwnerChange"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."medicationId" <> OLD."medicationId" THEN
    RAISE EXCEPTION 'MedicationSchedule cannot move to another medication'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "MedicationSchedule_immutable_medication"
BEFORE UPDATE OF "medicationId"
ON "MedicationSchedule"
FOR EACH ROW
EXECUTE FUNCTION "preventMedicationScheduleOwnerChange"();
