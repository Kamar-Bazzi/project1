-- Account status is enforced independently from authorization role so that
-- administrators can suspend access without destroying clinical records.
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

ALTER TABLE "User"
ADD COLUMN "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX "User_role_accountStatus_idx"
ON "User"("role", "accountStatus");

CREATE INDEX "Appointment_patientId_status_appointmentDate_idx"
ON "Appointment"("patientId", "status", "appointmentDate");

CREATE INDEX "Appointment_doctorId_status_appointmentDate_idx"
ON "Appointment"("doctorId", "status", "appointmentDate");
