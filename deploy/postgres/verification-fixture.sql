BEGIN;

INSERT INTO "User" (
  "id",
  "name",
  "email",
  "passwordHash",
  "role",
  "accountStatus",
  "emailVerifiedAt",
  "createdAt",
  "updatedAt"
) VALUES (
  '81000000-0000-4000-8000-000000000001',
  'Backup Verification Patient – اختبار',
  'backup-verification@example.test',
  '$2b$12$backup.verification.fixture.only',
  'PATIENT',
  'ACTIVE',
  '2026-01-01T00:00:00.000Z',
  '2026-01-01T00:00:00.000Z',
  '2026-01-01T00:00:00.000Z'
);

INSERT INTO "Patient" (
  "id",
  "userId",
  "dateOfBirth",
  "phoneNumber",
  "emergencyContact",
  "timeZone",
  "createdAt",
  "updatedAt"
) VALUES (
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '1990-05-10',
  '+96170123456',
  'Verification Contact',
  'Asia/Beirut',
  '2026-01-01T00:00:00.000Z',
  '2026-01-01T00:00:00.000Z'
);

INSERT INTO "Measurement" (
  "id",
  "patientId",
  "type",
  "value",
  "secondaryValue",
  "unit",
  "measuredAt",
  "createdAt",
  "updatedAt"
) VALUES (
  '83000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  'HEART_RATE',
  72,
  NULL,
  'bpm',
  '2026-01-01T12:30:00.000Z',
  '2026-01-01T12:30:00.000Z',
  '2026-01-01T12:30:00.000Z'
);

INSERT INTO "AuditLog" (
  "id",
  "userId",
  "action",
  "entity",
  "entityId",
  "metadata",
  "createdAt"
) VALUES (
  '84000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  'BACKUP_VERIFICATION_FIXTURE_CREATED',
  'Measurement',
  '83000000-0000-4000-8000-000000000001',
  '{"purpose":"backup-restore-verification","containsRealPatientData":false}',
  '2026-01-01T12:31:00.000Z'
);

COMMIT;
