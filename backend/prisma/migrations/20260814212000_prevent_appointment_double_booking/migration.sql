-- The service performs friendly collision checks, while these partial unique
-- indexes close the race between concurrent schedulers. Cancelled/completed
-- history remains unrestricted.
CREATE UNIQUE INDEX "Appointment_scheduled_patient_time_key"
ON "Appointment"("patientId", "appointmentDate")
WHERE "status" = 'SCHEDULED';

CREATE UNIQUE INDEX "Appointment_scheduled_doctor_time_key"
ON "Appointment"("doctorId", "appointmentDate")
WHERE "status" = 'SCHEDULED';
