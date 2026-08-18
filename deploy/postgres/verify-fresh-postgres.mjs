import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const backendDirectory = join(repositoryRoot, "backend");
const verifierPath = join(scriptDirectory, "verify-backup-restore.mjs");
const fixturePath = join(scriptDirectory, "verification-fixture.sql");
const prismaCliPath = join(
  backendDirectory,
  "node_modules",
  "prisma",
  "build",
  "index.js",
);
const adminUrl = databaseUrl(
  process.env.VERIFY_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL,
);
const maintenanceDatabase =
  process.env.VERIFY_MAINTENANCE_DATABASE?.trim() || "postgres";
const sourceDatabase =
  `caretrack_source_verify_${Date.now()}_${randomBytes(3).toString("hex")}`.slice(
    0,
    63,
  );
const sourceUrl = new URL(adminUrl);
sourceUrl.pathname = `/${sourceDatabase}`;
const adminEnvironment = postgresEnvironment(adminUrl, maintenanceDatabase);
const sourceEnvironment = postgresEnvironment(sourceUrl, sourceDatabase);
const evidencePath = process.env.VERIFY_EVIDENCE_PATH?.trim();
const expectedClinicalRelationTriggers = [
  "Appointment_immutable_care_pair",
  "DoctorNote_appointment_care_pair_check",
  "DoctorNote_immutable_care_pair",
  "PatientFollowUp_appointment_care_pair_check",
  "PatientFollowUp_immutable_care_pair",
];

let sourceCreated = false;
let sourceDropped = false;
let evidence;
let failureStage = "initialization";
let failure;

if (
  !existsSync(fixturePath) ||
  !existsSync(verifierPath) ||
  !existsSync(prismaCliPath)
) {
  throw new Error(
    "Backup verification assets or installed Prisma CLI are missing",
  );
}

try {
  failureStage = "fresh source database creation";
  runPostgres(
    "createdb",
    [`--maintenance-db=${maintenanceDatabase}`, sourceDatabase],
    adminEnvironment,
  );
  sourceCreated = true;

  failureStage = "Prisma migration deployment";
  run(
    process.execPath,
    [prismaCliPath, "migrate", "deploy"],
    {
      ...process.env,
      DATABASE_URL: sourceUrl.toString(),
    },
    backendDirectory,
  );

  failureStage = "clinical relation-integrity trigger verification";
  const installedClinicalRelationTriggers = runPostgres(
    "psql",
    [
      "--no-psqlrc",
      "--set",
      "ON_ERROR_STOP=1",
      "--tuples-only",
      "--no-align",
      "--command",
      `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'D' AND tgname IN (${expectedClinicalRelationTriggers.map((name) => `'${name}'`).join(",")}) ORDER BY tgname;`,
    ],
    sourceEnvironment,
  )
    .stdout.trim()
    .split(/\r?\n/)
    .filter(Boolean);
  const missingClinicalRelationTriggers =
    expectedClinicalRelationTriggers.filter(
      (name) => !installedClinicalRelationTriggers.includes(name),
    );
  if (missingClinicalRelationTriggers.length > 0) {
    throw new Error(
      `Expected clinical relation-integrity triggers are missing: ${missingClinicalRelationTriggers.join(", ")}`,
    );
  }

  failureStage = "deterministic fixture load";
  runPostgres(
    "psql",
    ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--file", fixturePath],
    sourceEnvironment,
  );

  failureStage = "backup and restore verification";
  const result = spawnSync(process.execPath, [verifierPath], {
    env: {
      ...process.env,
      SOURCE_DATABASE_URL: sourceUrl.toString(),
      VERIFY_TARGET_ADMIN_URL: adminUrl.toString(),
      VERIFY_MAINTENANCE_DATABASE: maintenanceDatabase,
      KEEP_VERIFY_BACKUP: process.env.KEEP_VERIFY_BACKUP ?? "false",
      VERIFY_EVIDENCE_PATH: "",
    },
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const output = (
      result.error?.message ||
      result.stderr ||
      result.stdout ||
      ""
    ).trim();
    throw new Error(
      `The backup/restore verifier did not pass${output ? `: ${redact(output)}` : ""}`,
    );
  }
  evidence = JSON.parse(result.stdout);
} catch (error) {
  failure = error;
} finally {
  if (sourceCreated && sourceDatabase.startsWith("caretrack_source_verify_")) {
    try {
      runPostgres(
        "dropdb",
        [
          `--maintenance-db=${maintenanceDatabase}`,
          "--if-exists",
          sourceDatabase,
        ],
        adminEnvironment,
      );
      sourceDropped = true;
    } catch (cleanupError) {
      failure ??= cleanupError;
      failureStage = "fresh source database cleanup";
    }
  }
}

if (failure) {
  const failureEvidence = {
    status: "FAIL",
    completedAt: new Date().toISOString(),
    failedStage: failureStage,
    fixtureSourceDatabaseDropped: sourceDropped,
  };
  emitEvidence(failureEvidence);
  const detail =
    process.env.VERIFY_VERBOSE === "true" && failure instanceof Error
      ? `: ${redact(failure.message)}`
      : "";
  console.error(
    `Fresh PostgreSQL verification failed during ${failureStage}${detail}`,
  );
  process.exit(1);
}

const finalEvidence = {
  ...evidence,
  migrationHistoryRestored: true,
  clinicalRelationIntegrityTriggerCount:
    expectedClinicalRelationTriggers.length,
  clinicalRelationIntegrityTriggersRestored:
    evidence.schemaFingerprintMatched === true,
  deterministicFixtureRestored: true,
  fixtureSourceDatabaseDropped: sourceDropped,
};
emitEvidence(finalEvidence);

function databaseUrl(value) {
  if (!value) {
    throw new Error("VERIFY_ADMIN_DATABASE_URL or DATABASE_URL is required");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("The database URL is invalid");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("The database URL must use PostgreSQL");
  }
  return parsed;
}

function postgresEnvironment(url, database) {
  return {
    ...process.env,
    PGHOST: decodeURIComponent(url.hostname),
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database,
  };
}

function postgresExecutable(name) {
  const extension = process.platform === "win32" ? ".exe" : "";
  return process.env.PG_BIN
    ? join(process.env.PG_BIN, `${name}${extension}`)
    : `${name}${extension}`;
}

function runPostgres(name, arguments_, environment) {
  return run(postgresExecutable(name), arguments_, environment, repositoryRoot);
}

function run(command, arguments_, environment, workingDirectory) {
  const result = spawnSync(command, arguments_, {
    env: environment,
    cwd: workingDirectory,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const output = (
      result.error?.message ||
      result.stderr ||
      result.stdout ||
      ""
    ).trim();
    throw new Error(`${command} failed${output ? `: ${redact(output)}` : ""}`);
  }
  return result;
}

function emitEvidence(result) {
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (evidencePath) {
    writeFileSync(resolve(evidencePath), json, { mode: 0o600 });
  }
  process.stdout.write(json);
}

function redact(value) {
  let redacted = value;
  for (const secret of [
    adminUrl.toString(),
    sourceUrl.toString(),
    decodeURIComponent(adminUrl.password),
  ]) {
    if (secret) {
      redacted = redacted.replaceAll(secret, "[REDACTED]");
    }
  }
  return redacted.slice(0, 2_000);
}
