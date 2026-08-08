-- Existing patients learn their canonical IANA timezone from their next
-- authenticated browser request. New registrations persist it immediately.
ALTER TABLE "Patient" ADD COLUMN "timeZone" TEXT;

-- Birth dates are calendar dates, not timezone-dependent instants.
ALTER TABLE "Patient"
ALTER COLUMN "dateOfBirth" TYPE DATE
USING "dateOfBirth"::date;
