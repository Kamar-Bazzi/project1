-- CreateEnum
CREATE TYPE "WearableProvider" AS ENUM ('MOCK', 'HEALTH_CONNECT', 'HEALTHKIT', 'FITBIT', 'GARMIN', 'SAMSUNG', 'OTHER');

-- CreateEnum
CREATE TYPE "HealthMetricType" AS ENUM ('HEART_RATE', 'RESTING_HEART_RATE', 'STEPS', 'DISTANCE', 'CALORIES', 'SLEEP_DURATION', 'BLOOD_OXYGEN', 'RESPIRATORY_RATE', 'BODY_TEMPERATURE', 'WEIGHT');

-- CreateEnum
CREATE TYPE "HealthMetricSource" AS ENUM ('MOCK', 'HEALTH_CONNECT', 'HEALTHKIT', 'FITBIT', 'GARMIN', 'SAMSUNG', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "HealthAlertSeverity" AS ENUM ('INFO', 'WARNING', 'URGENT');

-- CreateEnum
CREATE TYPE "HealthAlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "WearableDevice" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "provider" "WearableProvider" NOT NULL,
    "deviceName" TEXT NOT NULL,
    "externalDeviceId" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WearableDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthMetric" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "wearableDeviceId" TEXT,
    "metricType" "HealthMetricType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "secondaryValue" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "source" "HealthMetricSource" NOT NULL,
    "externalRecordId" TEXT,
    "deduplicationKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "metricType" "HealthMetricType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minimumValue" DOUBLE PRECISION,
    "maximumValue" DOUBLE PRECISION,
    "consecutiveReadingsRequired" INTEGER NOT NULL DEFAULT 3,
    "severity" "HealthAlertSeverity" NOT NULL DEFAULT 'WARNING',
    "notifyEmergencyContacts" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthAlert" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "metricType" "HealthMetricType" NOT NULL,
    "severity" "HealthAlertSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "metricId" TEXT,
    "alertRuleId" TEXT,
    "status" "HealthAlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorPatientAccess" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorPatientAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WearableDevice_patientId_idx" ON "WearableDevice"("patientId");

-- CreateIndex
CREATE INDEX "WearableDevice_provider_idx" ON "WearableDevice"("provider");

-- CreateIndex
CREATE INDEX "WearableDevice_patientId_active_idx" ON "WearableDevice"("patientId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "WearableDevice_patientId_provider_externalDeviceId_key" ON "WearableDevice"("patientId", "provider", "externalDeviceId");

-- CreateIndex
CREATE INDEX "HealthMetric_patientId_idx" ON "HealthMetric"("patientId");

-- CreateIndex
CREATE INDEX "HealthMetric_metricType_idx" ON "HealthMetric"("metricType");

-- CreateIndex
CREATE INDEX "HealthMetric_measuredAt_idx" ON "HealthMetric"("measuredAt");

-- CreateIndex
CREATE INDEX "HealthMetric_wearableDeviceId_idx" ON "HealthMetric"("wearableDeviceId");

-- CreateIndex
CREATE INDEX "HealthMetric_patientId_metricType_measuredAt_idx" ON "HealthMetric"("patientId", "metricType", "measuredAt");

-- CreateIndex
CREATE UNIQUE INDEX "HealthMetric_patientId_deduplicationKey_key" ON "HealthMetric"("patientId", "deduplicationKey");

-- CreateIndex
CREATE INDEX "EmergencyContact_patientId_idx" ON "EmergencyContact"("patientId");

-- CreateIndex
CREATE INDEX "EmergencyContact_patientId_active_idx" ON "EmergencyContact"("patientId", "active");

-- CreateIndex
CREATE INDEX "AlertRule_patientId_idx" ON "AlertRule"("patientId");

-- CreateIndex
CREATE INDEX "AlertRule_patientId_enabled_idx" ON "AlertRule"("patientId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AlertRule_patientId_metricType_key" ON "AlertRule"("patientId", "metricType");

-- CreateIndex
CREATE INDEX "HealthAlert_patientId_idx" ON "HealthAlert"("patientId");

-- CreateIndex
CREATE INDEX "HealthAlert_metricType_idx" ON "HealthAlert"("metricType");

-- CreateIndex
CREATE INDEX "HealthAlert_metricId_idx" ON "HealthAlert"("metricId");

-- CreateIndex
CREATE INDEX "HealthAlert_alertRuleId_idx" ON "HealthAlert"("alertRuleId");

-- CreateIndex
CREATE INDEX "HealthAlert_patientId_status_detectedAt_idx" ON "HealthAlert"("patientId", "status", "detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HealthAlert_alertRuleId_metricId_key" ON "HealthAlert"("alertRuleId", "metricId");

-- CreateIndex
CREATE INDEX "DoctorPatientAccess_doctorId_active_idx" ON "DoctorPatientAccess"("doctorId", "active");

-- CreateIndex
CREATE INDEX "DoctorPatientAccess_patientId_active_idx" ON "DoctorPatientAccess"("patientId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorPatientAccess_doctorId_patientId_key" ON "DoctorPatientAccess"("doctorId", "patientId");

-- AddForeignKey
ALTER TABLE "WearableDevice" ADD CONSTRAINT "WearableDevice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthMetric" ADD CONSTRAINT "HealthMetric_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthMetric" ADD CONSTRAINT "HealthMetric_wearableDeviceId_fkey" FOREIGN KEY ("wearableDeviceId") REFERENCES "WearableDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthAlert" ADD CONSTRAINT "HealthAlert_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthAlert" ADD CONSTRAINT "HealthAlert_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "HealthMetric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthAlert" ADD CONSTRAINT "HealthAlert_alertRuleId_fkey" FOREIGN KEY ("alertRuleId") REFERENCES "AlertRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorPatientAccess" ADD CONSTRAINT "DoctorPatientAccess_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorPatientAccess" ADD CONSTRAINT "DoctorPatientAccess_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Wearable health records are sensitive and append-only at the API layer. These
-- checks keep malformed values and contradictory relationships out of the
-- database even if a future integration bypasses the HTTP DTOs.
ALTER TABLE "WearableDevice"
ADD CONSTRAINT "WearableDevice_device_name_check"
CHECK (char_length(btrim("deviceName")) BETWEEN 1 AND 120),
ADD CONSTRAINT "WearableDevice_external_id_check"
CHECK ("externalDeviceId" IS NULL OR char_length("externalDeviceId") BETWEEN 1 AND 255);

ALTER TABLE "HealthMetric"
ADD CONSTRAINT "HealthMetric_value_finite_check"
CHECK (
  "value" > '-Infinity'::double precision
  AND "value" < 'Infinity'::double precision
),
ADD CONSTRAINT "HealthMetric_secondary_value_finite_check"
CHECK (
  "secondaryValue" IS NULL
  OR (
    "secondaryValue" > '-Infinity'::double precision
    AND "secondaryValue" < 'Infinity'::double precision
  )
),
ADD CONSTRAINT "HealthMetric_unit_check"
CHECK (char_length(btrim("unit")) BETWEEN 1 AND 32),
ADD CONSTRAINT "HealthMetric_deduplication_key_check"
CHECK (char_length("deduplicationKey") BETWEEN 32 AND 128),
ADD CONSTRAINT "HealthMetric_metadata_object_check"
CHECK ("metadata" IS NULL OR jsonb_typeof("metadata") = 'object');

ALTER TABLE "EmergencyContact"
ADD CONSTRAINT "EmergencyContact_name_check"
CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
ADD CONSTRAINT "EmergencyContact_relationship_check"
CHECK (char_length(btrim("relationship")) BETWEEN 1 AND 80),
ADD CONSTRAINT "EmergencyContact_phone_check"
CHECK (char_length(btrim("phone")) BETWEEN 3 AND 30),
ADD CONSTRAINT "EmergencyContact_email_check"
CHECK ("email" IS NULL OR char_length("email") BETWEEN 3 AND 254);

ALTER TABLE "AlertRule"
ADD CONSTRAINT "AlertRule_threshold_required_check"
CHECK ("minimumValue" IS NOT NULL OR "maximumValue" IS NOT NULL),
ADD CONSTRAINT "AlertRule_threshold_order_check"
CHECK (
  "minimumValue" IS NULL
  OR "maximumValue" IS NULL
  OR "minimumValue" < "maximumValue"
),
ADD CONSTRAINT "AlertRule_minimum_finite_check"
CHECK (
  "minimumValue" IS NULL
  OR (
    "minimumValue" > '-Infinity'::double precision
    AND "minimumValue" < 'Infinity'::double precision
  )
),
ADD CONSTRAINT "AlertRule_maximum_finite_check"
CHECK (
  "maximumValue" IS NULL
  OR (
    "maximumValue" > '-Infinity'::double precision
    AND "maximumValue" < 'Infinity'::double precision
  )
),
ADD CONSTRAINT "AlertRule_consecutive_readings_check"
CHECK ("consecutiveReadingsRequired" BETWEEN 2 AND 100);

ALTER TABLE "HealthAlert"
ADD CONSTRAINT "HealthAlert_message_check"
CHECK (char_length(btrim("message")) BETWEEN 1 AND 500),
ADD CONSTRAINT "HealthAlert_status_timestamps_check"
CHECK (
  ("status" = 'ACTIVE' AND "acknowledgedAt" IS NULL AND "resolvedAt" IS NULL)
  OR ("status" = 'ACKNOWLEDGED' AND "acknowledgedAt" IS NOT NULL AND "resolvedAt" IS NULL)
  OR ("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL)
);

ALTER TABLE "DoctorPatientAccess"
ADD CONSTRAINT "DoctorPatientAccess_state_check"
CHECK (
  ("active" = true AND "revokedAt" IS NULL)
  OR ("active" = false AND "revokedAt" IS NOT NULL)
);

CREATE FUNCTION "validateHealthMetricDeviceOwner"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."wearableDeviceId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "WearableDevice" AS "device"
    WHERE "device"."id" = NEW."wearableDeviceId"
      AND "device"."patientId" = NEW."patientId"
  ) THEN
    RAISE EXCEPTION 'HealthMetric wearable device must belong to its patient'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "HealthMetric_device_owner_check"
BEFORE INSERT OR UPDATE OF "patientId", "wearableDeviceId"
ON "HealthMetric"
FOR EACH ROW
EXECUTE FUNCTION "validateHealthMetricDeviceOwner"();

CREATE FUNCTION "preventWearableDeviceOwnerChange"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."patientId" <> OLD."patientId" THEN
    RAISE EXCEPTION 'WearableDevice cannot move to another patient'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "WearableDevice_immutable_patient"
BEFORE UPDATE OF "patientId"
ON "WearableDevice"
FOR EACH ROW
EXECUTE FUNCTION "preventWearableDeviceOwnerChange"();

CREATE FUNCTION "validateHealthAlertReferences"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."metricId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "HealthMetric" AS "metric"
    WHERE "metric"."id" = NEW."metricId"
      AND "metric"."patientId" = NEW."patientId"
      AND "metric"."metricType" = NEW."metricType"
  ) THEN
    RAISE EXCEPTION 'HealthAlert metric must belong to its patient and metric type'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."alertRuleId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "AlertRule" AS "rule"
    WHERE "rule"."id" = NEW."alertRuleId"
      AND "rule"."patientId" = NEW."patientId"
      AND "rule"."metricType" = NEW."metricType"
  ) THEN
    RAISE EXCEPTION 'HealthAlert rule must belong to its patient and metric type'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "HealthAlert_reference_owner_check"
BEFORE INSERT OR UPDATE OF "patientId", "metricType", "metricId", "alertRuleId"
ON "HealthAlert"
FOR EACH ROW
EXECUTE FUNCTION "validateHealthAlertReferences"();

CREATE FUNCTION "preventHealthIdentityChange"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'HealthMetric' AND (
    NEW."patientId" <> OLD."patientId"
    OR NEW."metricType" <> OLD."metricType"
  ) THEN
    RAISE EXCEPTION 'HealthMetric patient and metric type are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'AlertRule' AND (
    NEW."patientId" <> OLD."patientId"
    OR NEW."metricType" <> OLD."metricType"
  ) THEN
    RAISE EXCEPTION 'AlertRule patient and metric type are immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "HealthMetric_immutable_identity"
BEFORE UPDATE OF "patientId", "metricType"
ON "HealthMetric"
FOR EACH ROW
EXECUTE FUNCTION "preventHealthIdentityChange"();

CREATE TRIGGER "AlertRule_immutable_identity"
BEFORE UPDATE OF "patientId", "metricType"
ON "AlertRule"
FOR EACH ROW
EXECUTE FUNCTION "preventHealthIdentityChange"();
