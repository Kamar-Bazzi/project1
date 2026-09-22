CREATE TYPE "AccountDeletionStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'CANCELLED',
  'COMPLETED'
);

CREATE TYPE "PatientDataExportFormat" AS ENUM ('CSV', 'JSON', 'PDF');

CREATE TYPE "PatientDataExportDataset" AS ENUM (
  'ALL',
  'MEDICATIONS',
  'MEASUREMENTS',
  'APPOINTMENTS',
  'WEARABLE_DATA',
  'ALERTS'
);

CREATE TYPE "PatientDataExportRequestStatus" AS ENUM (
  'READY',
  'REVOKED',
  'EXPIRED'
);

CREATE TABLE "AccountDeletionRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "status" "AccountDeletionStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "processingStartedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountDeletionRequest_attempts_check" CHECK ("attempts" >= 0)
);

CREATE TABLE "PatientDataExportRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "format" "PatientDataExportFormat" NOT NULL,
  "dataset" "PatientDataExportDataset" NOT NULL,
  "status" "PatientDataExportRequestStatus" NOT NULL DEFAULT 'READY',
  "from" TIMESTAMP(3),
  "to" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "downloadedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatientDataExportRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PatientDataExportRequest_range_check" CHECK (
    "from" IS NULL OR "to" IS NULL OR "from" <= "to"
  )
);

CREATE UNIQUE INDEX "AccountDeletionRequest_userId_key"
ON "AccountDeletionRequest"("userId");
CREATE INDEX "AccountDeletionRequest_status_scheduledFor_idx"
ON "AccountDeletionRequest"("status", "scheduledFor");
CREATE INDEX "AccountDeletionRequest_status_processingStartedAt_idx"
ON "AccountDeletionRequest"("status", "processingStartedAt");
CREATE INDEX "PatientDataExportRequest_userId_status_createdAt_idx"
ON "PatientDataExportRequest"("userId", "status", "createdAt");
CREATE INDEX "PatientDataExportRequest_status_expiresAt_idx"
ON "PatientDataExportRequest"("status", "expiresAt");

ALTER TABLE "AccountDeletionRequest"
ADD CONSTRAINT "AccountDeletionRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PatientDataExportRequest"
ADD CONSTRAINT "PatientDataExportRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
