import { createHash, randomBytes } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const sourceUrl = databaseUrl(
  process.env.SOURCE_DATABASE_URL ?? process.env.DATABASE_URL,
  "SOURCE_DATABASE_URL or DATABASE_URL",
);
const targetAdminUrl = databaseUrl(
  process.env.VERIFY_TARGET_ADMIN_URL ?? sourceUrl.toString(),
  "VERIFY_TARGET_ADMIN_URL",
);
const maintenanceDatabase =
  process.env.VERIFY_MAINTENANCE_DATABASE?.trim() ||
  decodeURIComponent(targetAdminUrl.pathname.slice(1));
const keepBackup = process.env.KEEP_VERIFY_BACKUP === "true";
const verifyContent = process.env.VERIFY_CONTENT_HASH !== "false";
const evidencePath = process.env.VERIFY_EVIDENCE_PATH?.trim();
const runId = `${new Date()
  .toISOString()
  .replace(/[-:.TZ]/g, "")
  .slice(0, 14)}_${randomBytes(4).toString("hex")}`;
const targetDatabase = `caretrack_restore_verify_${runId}`.slice(0, 63);
const explicitOutputDirectory = process.env.BACKUP_VERIFY_OUTPUT_DIR?.trim();
const workDirectory = explicitOutputDirectory
  ? resolve(explicitOutputDirectory)
  : mkdtempSync(join(tmpdir(), "caretrack-backup-verify-"));
const dumpPath = join(workDirectory, `caretrack_${runId}.dump`);
const checksumPath = `${dumpPath}.sha256`;
const sourceEnvironment = postgresEnvironment(sourceUrl);
const targetAdminEnvironment = postgresEnvironment(
  targetAdminUrl,
  maintenanceDatabase,
);
const targetEnvironment = postgresEnvironment(targetAdminUrl, targetDatabase);

let stage = "initialization";
let targetCreated = false;
let targetDropped = false;
let verification;
let failure;
let failureStage;

mkdirSync(workDirectory, { recursive: true });

try {
  stage = "PostgreSQL client discovery";
  const pgDumpVersion = run("pg_dump", ["--version"]).stdout.trim();
  const pgRestoreVersion = run("pg_restore", ["--version"]).stdout.trim();
  run("psql", ["--version"]);
  run("createdb", ["--version"]);
  run("dropdb", ["--version"]);

  stage = "source pre-dump fingerprint";
  const sourceBefore = databaseFingerprint(sourceEnvironment, verifyContent);

  stage = "custom-format backup";
  run(
    "pg_dump",
    [
      "--format=custom",
      "--compress=9",
      "--no-owner",
      "--no-privileges",
      "--file",
      dumpPath,
    ],
    sourceEnvironment,
  );
  const dumpChecksum = await sha256File(dumpPath);
  writeFileSync(checksumPath, `${dumpChecksum}  ${basename(dumpPath)}\n`, {
    mode: 0o600,
  });

  stage = "source stability fingerprint";
  const sourceAfter = databaseFingerprint(sourceEnvironment, verifyContent);
  assertFingerprintEqual(
    sourceBefore,
    sourceAfter,
    "The source changed during verification; retry while writes are quiesced",
  );

  stage = "fresh verification database creation";
  run(
    "createdb",
    [`--maintenance-db=${maintenanceDatabase}`, targetDatabase],
    targetAdminEnvironment,
  );
  targetCreated = true;
  const emptyTargetTableCount = Number(
    scalar(
      targetEnvironment,
      `SELECT count(*) FROM information_schema.tables
       WHERE table_type = 'BASE TABLE'
         AND table_schema NOT IN ('pg_catalog', 'information_schema');`,
    ),
  );
  if (emptyTargetTableCount !== 0) {
    throw new Error("The verification database was not fresh");
  }

  stage = "backup checksum verification";
  if ((await sha256File(dumpPath)) !== dumpChecksum) {
    throw new Error("The backup checksum changed before restore");
  }

  stage = "restore into fresh database";
  run(
    "pg_restore",
    [
      "--dbname",
      targetDatabase,
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      dumpPath,
    ],
    targetEnvironment,
  );

  stage = "restored database fingerprint";
  const restored = databaseFingerprint(targetEnvironment, verifyContent);
  assertFingerprintEqual(
    sourceAfter,
    restored,
    "Restored schema or data differs from the source snapshot",
  );

  verification = {
    status: "PASS",
    completedAt: new Date().toISOString(),
    pgDumpVersion,
    pgRestoreVersion,
    freshTargetConfirmed: true,
    schemaFingerprintMatched: true,
    tableSetMatched: true,
    rowCountsMatched: true,
    contentFingerprintsMatched: verifyContent,
    sequenceStateMatched: true,
    tableCount: restored.tables.length,
    totalRows: restored.totalRows,
    dumpSha256: dumpChecksum,
  };
} catch (error) {
  failure = error;
  failureStage = stage;
} finally {
  if (targetCreated && targetDatabase.startsWith("caretrack_restore_verify_")) {
    try {
      stage = "temporary verification database cleanup";
      run(
        "dropdb",
        [
          `--maintenance-db=${maintenanceDatabase}`,
          "--if-exists",
          targetDatabase,
        ],
        targetAdminEnvironment,
      );
      targetDropped = true;
    } catch (cleanupError) {
      if (!failure) {
        failure = cleanupError;
        failureStage = stage;
      }
    }
  }

  if (!keepBackup) {
    rmSync(dumpPath, { force: true });
    rmSync(checksumPath, { force: true });
    if (!explicitOutputDirectory) {
      rmSync(workDirectory, { recursive: true, force: true });
    }
  }
}

if (failure) {
  const evidence = {
    status: "FAIL",
    completedAt: new Date().toISOString(),
    failedStage: failureStage,
    temporaryRestoreDatabaseDropped: targetDropped,
    backupArtifactRetained: keepBackup,
  };
  emitEvidence(evidence);
  const detail =
    process.env.VERIFY_VERBOSE === "true" && failure instanceof Error
      ? `: ${redact(failure.message)}`
      : "";
  console.error(
    `Backup/restore verification failed during ${failureStage}${detail}`,
  );
  process.exit(1);
}

verification.temporaryRestoreDatabaseDropped = targetDropped;
verification.backupArtifactRetained = keepBackup;
emitEvidence(verification);

function databaseUrl(value, name) {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL`);
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${name} must use postgres: or postgresql:`);
  }

  if (!parsed.hostname || !parsed.pathname.slice(1)) {
    throw new Error(`${name} must include a host and database name`);
  }

  return parsed;
}

function postgresEnvironment(url, databaseOverride) {
  return {
    ...process.env,
    PGHOST: decodeURIComponent(url.hostname),
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: databaseOverride ?? decodeURIComponent(url.pathname.slice(1)),
  };
}

function executable(name) {
  const extension = process.platform === "win32" ? ".exe" : "";
  return process.env.PG_BIN
    ? join(process.env.PG_BIN, `${name}${extension}`)
    : `${name}${extension}`;
}

function run(name, arguments_, environment = process.env) {
  const result = spawnSync(executable(name), arguments_, {
    env: environment,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });

  if (result.error) {
    throw new Error(
      `${name} could not start (${result.error.code ?? "ERROR"})`,
    );
  }
  if (result.status !== 0) {
    const safeError = redact((result.stderr || result.stdout || "").trim());
    throw new Error(
      `${name} exited ${result.status}${safeError ? `: ${safeError}` : ""}`,
    );
  }

  return result;
}

function query(environment, sql) {
  return run(
    "psql",
    [
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--set",
      "ON_ERROR_STOP=1",
      "--command",
      sql,
    ],
    environment,
  ).stdout.trim();
}

function scalar(environment, sql) {
  return query(environment, sql).split(/\r?\n/).filter(Boolean).at(-1) ?? "";
}

function databaseFingerprint(environment, includeContent) {
  const tables = lines(
    query(
      environment,
      `SELECT quote_ident(table_schema) || '.' || quote_ident(table_name)
       FROM information_schema.tables
       WHERE table_type = 'BASE TABLE'
         AND table_schema NOT IN ('pg_catalog', 'information_schema')
       ORDER BY table_schema, table_name;`,
    ),
  );
  const tableFingerprints = [];
  let totalRows = 0n;

  for (const table of tables) {
    const contentExpression = includeContent
      ? `COALESCE(md5(string_agg(row_value, E'\\n' ORDER BY row_value)), md5(''))`
      : `md5('content-check-disabled')`;
    const result = scalar(
      environment,
      `SELECT count(*)::text || E'\\t' || ${contentExpression}
       FROM (
         SELECT to_jsonb(row_source)::text AS row_value
         FROM ${table} AS row_source
       ) AS serialized;`,
    );
    const [rowCount, hash] = result.split("\t");
    if (!/^\d+$/.test(rowCount ?? "") || !/^[a-f0-9]{32}$/.test(hash ?? "")) {
      throw new Error(`Unable to fingerprint table ${table}`);
    }
    totalRows += BigInt(rowCount);
    tableFingerprints.push(`${table}\t${rowCount}\t${hash}`);
  }

  const sequences = lines(
    query(
      environment,
      `SELECT quote_ident(sequence_schema) || '.' || quote_ident(sequence_name)
       FROM information_schema.sequences
       WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')
       ORDER BY sequence_schema, sequence_name;`,
    ),
  );
  const sequenceFingerprints = sequences.map((sequence) => {
    const state = scalar(
      environment,
      `SELECT last_value::text || E'\\t' || is_called::text FROM ${sequence};`,
    );
    return `${sequence}\t${state}`;
  });
  const schemaDescription = query(
    environment,
    `WITH objects AS (
       SELECT 'COLUMN|' || table_schema || '|' || table_name || '|' ||
              column_name || '|' || data_type || '|' ||
              is_nullable || '|' || COALESCE(column_default, '') AS value
       FROM information_schema.columns
       WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
       UNION ALL
       SELECT 'CONSTRAINT|' || n.nspname || '|' || c.relname || '|' || con.conname ||
              '|' || pg_get_constraintdef(con.oid, true)
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
       UNION ALL
       SELECT 'INDEX|' || schemaname || '|' || tablename || '|' || indexname ||
              '|' || indexdef
       FROM pg_indexes
       WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
       UNION ALL
       SELECT 'ENUM|' || n.nspname || '|' || t.typname || '|' || e.enumsortorder ||
              '|' || e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
       UNION ALL
       SELECT 'EXTENSION|' || ext.extname || '|' || ext.extversion || '|' ||
              n.nspname
       FROM pg_extension ext
       JOIN pg_namespace n ON n.oid = ext.extnamespace
       WHERE ext.extname <> 'plpgsql'
       UNION ALL
       SELECT 'VIEW|' || schemaname || '|' || viewname || '|' || definition
       FROM pg_views
       WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
       UNION ALL
       SELECT 'TRIGGER|' || n.nspname || '|' || c.relname || '|' || tg.tgname ||
              '|' || pg_get_triggerdef(tg.oid, true)
       FROM pg_trigger tg
       JOIN pg_class c ON c.oid = tg.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE NOT tg.tgisinternal
         AND n.nspname NOT IN ('pg_catalog', 'information_schema')
       UNION ALL
       SELECT 'FUNCTION|' || n.nspname || '|' || p.proname || '|' ||
              pg_get_function_identity_arguments(p.oid) || '|' ||
              pg_get_functiondef(p.oid)
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
       UNION ALL
       SELECT 'POLICY|' || schemaname || '|' || tablename || '|' || policyname ||
              '|' || permissive || '|' || roles::text || '|' || cmd || '|' ||
              COALESCE(qual, '') || '|' || COALESCE(with_check, '')
       FROM pg_policies
     )
     SELECT encode(convert_to(value, 'UTF8'), 'hex')
     FROM objects
     ORDER BY value;`,
  );
  const schemaObjects = lines(schemaDescription).map((encoded) =>
    Buffer.from(encoded, "hex").toString("utf8"),
  );
  const schemaDefinitions = {};
  for (const object of schemaObjects) {
    const category = object.slice(0, object.indexOf("|"));
    const values = schemaDefinitions[category] ?? [];
    values.push(object);
    schemaDefinitions[category] = values;
  }
  const schemaHashes = {};
  for (const [category, definitions] of Object.entries(schemaDefinitions)) {
    schemaHashes[category] = sha256Text(definitions.join("\n"));
  }

  return {
    tables,
    tableFingerprints,
    sequenceFingerprints,
    schemaDefinitions,
    schemaHashes,
    totalRows: totalRows.toString(),
  };
}

function assertFingerprintEqual(first, second, message) {
  const differences = [];
  const schemaCategories = new Set([
    ...Object.keys(first.schemaHashes),
    ...Object.keys(second.schemaHashes),
  ]);
  for (const category of schemaCategories) {
    if (first.schemaHashes[category] !== second.schemaHashes[category]) {
      differences.push(
        `schema ${category.toLowerCase()}${schemaDifferenceDetail(
          first.schemaDefinitions[category] ?? [],
          second.schemaDefinitions[category] ?? [],
        )}`,
      );
    }
  }
  if (JSON.stringify(first.tables) !== JSON.stringify(second.tables)) {
    differences.push("table set");
  }
  if (
    JSON.stringify(first.tableFingerprints) !==
    JSON.stringify(second.tableFingerprints)
  ) {
    differences.push("row counts/content");
  }
  if (
    JSON.stringify(first.sequenceFingerprints) !==
    JSON.stringify(second.sequenceFingerprints)
  ) {
    differences.push("sequence state");
  }
  if (differences.length > 0) {
    throw new Error(`${message} (${differences.join(", ")})`);
  }
}

function schemaDifferenceDetail(first, second) {
  if (process.env.VERIFY_VERBOSE !== "true") {
    return "";
  }
  const firstSet = new Set(first);
  const secondSet = new Set(second);
  const sourceOnly = first.filter((value) => !secondSet.has(value)).slice(0, 3);
  const restoredOnly = second
    .filter((value) => !firstSet.has(value))
    .slice(0, 3);
  return ` [source-only: ${sourceOnly.join(" ; ") || "none"}; restored-only: ${
    restoredOnly.join(" ; ") || "none"
  }]`;
}

function sha256File(path) {
  if (!existsSync(path)) {
    throw new Error("Expected backup artifact was not created");
  }

  return new Promise((resolveChecksum, rejectChecksum) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", rejectChecksum);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveChecksum(hash.digest("hex")));
  });
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function lines(value) {
  return value ? value.split(/\r?\n/).filter(Boolean) : [];
}

function emitEvidence(evidence) {
  const json = `${JSON.stringify(evidence, null, 2)}\n`;
  if (evidencePath) {
    writeFileSync(resolve(evidencePath), json, { mode: 0o600 });
  }
  process.stdout.write(json);
}

function redact(value) {
  let redacted = value;
  for (const [secret, replacement] of [
    [sourceUrl.toString(), "[REDACTED_DATABASE_URL]"],
    [targetAdminUrl.toString(), "[REDACTED_TARGET_URL]"],
    [sourceEnvironment.PGPASSWORD, "[REDACTED]"],
    [targetAdminEnvironment.PGPASSWORD, "[REDACTED]"],
  ]) {
    if (secret) {
      redacted = redacted.replaceAll(secret, replacement);
    }
  }
  return redacted.slice(0, 1_000);
}
