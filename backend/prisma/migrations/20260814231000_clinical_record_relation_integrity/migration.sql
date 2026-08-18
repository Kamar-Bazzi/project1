-- Clinical notes and follow-ups may optionally reference an appointment. The
-- three independent foreign keys alone cannot guarantee that the referenced
-- appointment belongs to the same patient and doctor, so enforce that care
-- pair at the database boundary as well as in the service transaction.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "DoctorNote" AS "record"
    JOIN "Appointment" AS "appointment"
      ON "appointment"."id" = "record"."appointmentId"
    WHERE "record"."patientId" <> "appointment"."patientId"
       OR "record"."doctorId" <> "appointment"."doctorId"
  ) OR EXISTS (
    SELECT 1
    FROM "PatientFollowUp" AS "record"
    JOIN "Appointment" AS "appointment"
      ON "appointment"."id" = "record"."appointmentId"
    WHERE "record"."patientId" <> "appointment"."patientId"
       OR "record"."doctorId" <> "appointment"."doctorId"
  ) THEN
    RAISE EXCEPTION 'Clinical record appointment belongs to another care pair'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION "validateClinicalRecordAppointmentCarePair"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."appointmentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "Appointment" AS "appointment"
    WHERE "appointment"."id" = NEW."appointmentId"
      AND "appointment"."patientId" = NEW."patientId"
      AND "appointment"."doctorId" = NEW."doctorId"
  ) THEN
    RAISE EXCEPTION 'Clinical record appointment belongs to another care pair'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "DoctorNote_appointment_care_pair_check"
BEFORE INSERT OR UPDATE OF "patientId", "doctorId", "appointmentId"
ON "DoctorNote"
FOR EACH ROW
EXECUTE FUNCTION "validateClinicalRecordAppointmentCarePair"();

CREATE TRIGGER "PatientFollowUp_appointment_care_pair_check"
BEFORE INSERT OR UPDATE OF "patientId", "doctorId", "appointmentId"
ON "PatientFollowUp"
FOR EACH ROW
EXECUTE FUNCTION "validateClinicalRecordAppointmentCarePair"();

-- Ownership is identity, not editable data. Keeping it immutable prevents a
-- future internal integration from silently moving appointments or authored
-- clinical records between care pairs after authorization was checked.
CREATE FUNCTION "preventCarePairOwnerChange"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."patientId" <> OLD."patientId"
     OR NEW."doctorId" <> OLD."doctorId" THEN
    RAISE EXCEPTION 'Clinical care-pair ownership is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Appointment_immutable_care_pair"
BEFORE UPDATE OF "patientId", "doctorId"
ON "Appointment"
FOR EACH ROW
EXECUTE FUNCTION "preventCarePairOwnerChange"();

CREATE TRIGGER "DoctorNote_immutable_care_pair"
BEFORE UPDATE OF "patientId", "doctorId"
ON "DoctorNote"
FOR EACH ROW
EXECUTE FUNCTION "preventCarePairOwnerChange"();

CREATE TRIGGER "PatientFollowUp_immutable_care_pair"
BEFORE UPDATE OF "patientId", "doctorId"
ON "PatientFollowUp"
FOR EACH ROW
EXECUTE FUNCTION "preventCarePairOwnerChange"();
