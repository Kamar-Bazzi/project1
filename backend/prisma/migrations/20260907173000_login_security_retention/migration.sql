-- Conservative login lock state and privacy-preserving context fingerprints.
-- Abnormal context alone never blocks a login; only repeated invalid
-- credentials can populate lockedUntil, and the application expires it.
ALTER TABLE "User"
ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastFailedLoginAt" TIMESTAMP(3),
ADD COLUMN "lockedUntil" TIMESTAMP(3);

ALTER TABLE "User"
ADD CONSTRAINT "User_failed_login_attempts_check"
CHECK ("failedLoginAttempts" >= 0);

ALTER TABLE "AuthSession"
ADD COLUMN "deviceFingerprint" TEXT,
ADD COLUMN "networkFingerprint" TEXT;

CREATE INDEX "User_lockedUntil_idx" ON "User"("lockedUntil");
CREATE INDEX "AuthSession_userId_deviceFingerprint_idx"
ON "AuthSession"("userId", "deviceFingerprint");
CREATE INDEX "AuthSession_userId_networkFingerprint_idx"
ON "AuthSession"("userId", "networkFingerprint");

-- Global cutoff indexes keep scheduled retention scans bounded and avoid
-- relying on user-scoped composite indexes for age-based deletion.
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
