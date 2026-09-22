# Production deployment, HTTPS, and backups

The supplied deployment uses Docker Compose, NGINX TLS termination, a private
PostgreSQL network, one-shot Prisma migrations, health checks, and scheduled
checksummed database dumps.

## Prerequisites

- Linux host with Docker Engine and the Compose plugin
- Node.js and npm available on the CI/release runner for lint, build, Prisma,
  audit, and test commands
- DNS record pointing the production hostname to the host
- TLS certificate and private key from a trusted CA
- SMTP credentials and VAPID web-push keys
- External encrypted, versioned storage for off-host backup copies
- Secret manager, or a root-owned deployment environment file as a fallback
- Enough memory for clamd and signature reloads. The
  [official ClamAV container guidance](https://docs.clamav.net/manual/Installing/Docker.html#memory-ram-requirements)
  calls for roughly 3 GiB minimum and 4 GiB preferred for ClamAV alone; size
  the host for the database, API, web tier, and backup jobs in addition to it.

## Configure

1. Copy `.env.production.example` to `.env.production` on the host.
2. Replace every placeholder. URL-encode the database password in
   `DATABASE_URL`; keep the raw password in `POSTGRES_PASSWORD`.
3. Make the file readable only by the deployment account:
   `chmod 600 .env.production`.
4. Put the certificate chain at `deploy/certs/fullchain.pem` and its private key
   at `deploy/certs/privkey.pem`, both outside source control.
5. Keep `AUTH_REQUIRE_VERIFIED_EMAIL=true`, `COOKIE_SECURE=true`, an HTTPS
   `APP_PUBLIC_URL`/`CORS_ORIGIN`, and `TRUST_PROXY=true` for this one-proxy
   topology. Set deployment-specific `JWT_ISSUER` and `JWT_AUDIENCE` values so
   tokens issued for another service cannot be accepted here.
6. Keep `DOCUMENT_STORAGE_PATH=/var/lib/caretrack/documents`. The Compose file
   mounts the private `document-data` volume at that API-only path; do not mount
   it into NGINX or expose it through a static-file route.
7. Keep `DOCUMENT_MALWARE_SCAN_REQUIRED=true`, `CLAMAV_HOST=clamav`, and
   `CLAMAV_PORT=3310`. The API sends uploads to clamd over the private backend
   network before storing them. Port 3310 is exposed only to other Compose
   services and is deliberately not published on the host. A separate network
   used only by the ClamAV container provides outbound access for FreshClam
   signature updates without joining the public web network.
8. Size document capacity deliberately with
   `DOCUMENT_MAX_FILES_PER_PATIENT`, `DOCUMENT_MAX_BYTES_PER_PATIENT`, and
   `DOCUMENT_MAX_TOTAL_BYTES`. Defaults are 500 files, 1 GiB per patient, and
   100 GiB total. The upload endpoint is also throttled to 10 requests per
   minute.

Generate secrets outside shell history where possible. `JWT_SECRET` should be
at least 32 cryptographically random bytes. Store SMTP passwords, the VAPID
private key, database credentials, and JWT secret in the platform secret
manager.

The Compose file marks the API `env_file` as optional so
`docker compose ... config` can be parsed by CI without creating a real
`.env.production`. Runtime deployment still requires the variables from the
secret manager or host environment; the API startup verifier fails closed when
required production values are missing or placeholders remain.

## Production environment variables

The production environment file or secret manager must provide, at minimum:

- `DATABASE_URL`, plus `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`
  when self-hosting PostgreSQL with the supplied Compose file.
- `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, access-token lifetime, refresh
  lifetime, and account-recovery token lifetimes.
- `APP_PUBLIC_URL` for the deployed frontend origin.
- `CORS_ORIGIN` as the exact HTTPS frontend origin; do not use `*` in
  production with credentials.
- SMTP host, port, TLS mode, user, password, and sender address.
- Web Push/VAPID subject, public key, and private key.
- SMS provider variables only when SMS is enabled; use secret manager values
  for real provider credentials.
- Wearable provider variables only after a real provider integration exists.
  Fitbit and Garmin require OAuth client configuration and secure token
  storage; HealthKit and Health Connect require native mobile companion apps.
- Document storage, malware scanning, retention, and backup variables.

Keep real values out of Git. `.env.production.example` documents names and
placeholder shapes only.

## Database setup

For the supplied self-hosted topology, PostgreSQL runs as the private
`database` service and stores data in the `database-data` named volume. Managed
PostgreSQL is also acceptable: point `DATABASE_URL` at the managed database,
remove or ignore the Compose `database` and `backup` services as appropriate,
and keep backup/restore monitoring at the database provider layer.

Apply schema changes with Prisma's production-safe deploy command:

```bash
cd backend
npx prisma migrate deploy
```

The Compose `migrate` service runs the same command before the API starts:

```bash
docker compose --env-file .env.production \
  -f docker-compose.production.yml run --rm migrate
```

Never use `prisma migrate reset` outside disposable local development.

## Validate and launch

```bash
docker compose --env-file .env.production \
  -f docker-compose.production.yml config --quiet

docker compose --env-file .env.production \
  -f docker-compose.production.yml build --pull

docker compose --env-file .env.production \
  -f docker-compose.production.yml run --rm migrate

docker compose --env-file .env.production \
  -f docker-compose.production.yml run --rm --no-deps api \
  npm run verify:production

docker compose --env-file .env.production \
  -f docker-compose.production.yml up -d
```

`migrate` must complete successfully before `api` starts. The API also waits
for the private `clamav` health check, which can take several minutes while a
new signature volume is initialized, and `web` waits for the public
`GET /api/v1/health` readiness endpoint. That endpoint returns success only
after a PostgreSQL probe; it exposes no counts, credentials, or database error
detail. Inspect status and redacted logs:

```bash
docker compose --env-file .env.production \
  -f docker-compose.production.yml ps
docker compose --env-file .env.production \
  -f docker-compose.production.yml logs --tail=100 migrate clamav api web backup
```

Do not paste Compose configuration or unredacted logs into tickets: expanded
environment values can contain secrets.

## Backend deployment

The backend image is built from `backend/Dockerfile` and runs `node
dist/main.js` as the unprivileged `node` user. The API container receives
runtime configuration from `.env.production` or the platform secret manager,
mounts only the private document volume, and exposes port `3000` only to the
Compose frontend network. Before startup, the Compose command runs
`npm run verify:production` to reject placeholder or unsafe production
configuration.

## Frontend deployment

The frontend image is built from `frontend/Dockerfile`. The supplied Compose
deployment builds the SPA with `VITE_API_URL=/api/v1` so browser API calls stay
same-origin behind NGINX. If the frontend is hosted separately, set the
frontend production API URL to the deployed API origin, and update
`CORS_ORIGIN` to exactly match the frontend HTTPS origin.

## CORS configuration

Production CORS must be explicit. Use one trusted HTTPS origin in `CORS_ORIGIN`
for this backend. Do not deploy wildcard CORS, comma-separated unparsed values,
or localhost origins. Because refresh/session flows use credentials, the
frontend origin and cookie/TLS settings must be tested together.

## HTTPS verification

Port 80 performs a permanent redirect to 443. NGINX accepts TLS 1.2 and 1.3,
disables session tickets, sends HSTS, and proxies `/api/v1` without exposing the
API container port.

After launch, verify from a separate machine:

```bash
curl -I http://medical.example.com/
curl -I https://medical.example.com/
curl https://medical.example.com/api/v1
openssl s_client -connect medical.example.com:443 \
  -servername medical.example.com -tls1_2 </dev/null
```

Also run an independent TLS scanner. Renew certificates before expiry, replace
both mounted files atomically, and reload NGINX:

```bash
docker compose --env-file .env.production \
  -f docker-compose.production.yml exec web nginx -s reload
```

## Health endpoint verification

`GET /api/v1/health` is public and returns readiness only after the API can
probe PostgreSQL. A `200` response means the API and database are reachable; a
`503` response means the API process is alive but database readiness failed.
The endpoint must not expose credentials, counts, patient data, or detailed
database errors.

## Post-deployment smoke testing

From a Windows workstation or CI runner with PowerShell:

```powershell
$env:CARETRACK_BASE_URL = 'https://medical.example.com'
.\scripts\smoke-test.ps1
```

Optional authenticated checks run only when non-production or approved UAT
credentials are provided:

```powershell
$env:CARETRACK_SMOKE_EMAIL = '<uat-account@example.test>'
$env:CARETRACK_SMOKE_PASSWORD = '<injected test password>'
.\scripts\smoke-test.ps1 -BaseUrl 'https://medical.example.com'
```

The script exits non-zero on failure and performs only non-destructive probes.
Use [rollback.md](rollback.md) if smoke tests fail after deployment.

## Deploy updates

Back up first. Build immutable images from a reviewed commit, then:

```bash
docker compose --env-file .env.production \
  -f docker-compose.production.yml build --pull
docker compose --env-file .env.production \
  -f docker-compose.production.yml up -d
```

Review migration SQL before deployment. Take a maintenance window for a
destructive or non-backward-compatible migration. Roll application images back
only when the database migration is compatible; never reverse migrations by
deleting production data ad hoc.

## Database data retention

At 03:15 UTC each day, the API removes expired records in bounded batches. The
defaults retain audit logs for 365 days, notifications for 180 days, health
metrics for 2,555 days, and already expired/revoked sessions and security
tokens for a further 7 days. `DATA_RETENTION_BATCH_SIZE` and
`DATA_RETENTION_MAX_BATCHES` cap work per run so cleanup does not hold a large
table lock. The active values and calculated cutoffs are visible to an
administrator at `GET /api/v1/admin/data-retention/policies`.

These defaults are operational safeguards, not a statement of legal or
clinical-record obligations. Before launch, align each `*_RETENTION_DAYS`
value with the operator's jurisdiction, care-record policy, litigation holds,
and incident-response evidence requirements. Database backups are separate
copies: configure backup expiry and off-site lifecycle rules consistently, and
never shorten a required hold by changing the application setting alone.

## Backup policy

The `backup` service immediately creates a PostgreSQL custom-format dump, a
SHA-256 checksum, then repeats every `BACKUP_INTERVAL_SECONDS` (default 24
hours). Files older than `BACKUP_RETENTION_DAYS` (default 30 days) are removed
from the local named volume.

Local volume copies are not disaster recovery. Replicate completed `.dump` and
`.sha256` pairs to restricted, encrypted, versioned off-host storage. Monitor
backup age, job exit/restart count, checksum status, volume capacity, and
off-site replication. Use separate credentials with write-only access where
the provider supports it.

Uploaded health documents live in the separate `document-data` volume, while
their authorization metadata lives in PostgreSQL. Back up both as one logical
recovery set: take a filesystem snapshot of `document-data` at the same backup
cut, encrypt it, checksum it, and replicate it off host alongside the database
dump. A database-only restore does not restore uploaded files. Restore drills
must verify that an authorized API download resolves every restored document
metadata row and that no document volume is reachable from the web container.

ClamAV signatures live in the separate `clamav-signatures` volume. The official
container runs FreshClam to update them and clamd reloads updated definitions.
Persisting this volume avoids downloading the full database after every
restart; it is replaceable operational data rather than the authoritative
patient-document backup. Alert on clamd health and signature-update failures.
Any clamd timeout, connection failure, protocol error, or detection fails the
upload closed before document bytes reach `document-data`.

The API retries tombstoned document deletions every minute. Monitor warnings
from the document-deletion reconciler: repeated failures indicate that the API
cannot remove bytes from `document-data` or finalize their metadata records.

List backup files without exposing database contents:

```bash
docker run --rm \
  -v medical-tracking_database-backups:/backups:ro \
  postgres:17-alpine sh -c 'ls -lh /backups/*.dump'
```

## Restore drill

Perform restores only into an isolated environment unless an approved disaster
recovery event is active. Stop writers, choose the backup, and verify its
checksum. The restore script uses `--clean --if-exists` and therefore replaces
objects in the target database.

```bash
docker compose --env-file .env.production \
  -f docker-compose.production.yml stop web api

docker compose --env-file .env.production \
  -f docker-compose.production.yml run --rm \
  --entrypoint /bin/sh \
  -v ./deploy/postgres/restore.sh:/scripts/restore.sh:ro \
  backup /scripts/restore.sh /backups/medical_tracking_TIMESTAMP.dump

docker compose --env-file .env.production \
  -f docker-compose.production.yml up -d api web
```

For a drill, point `DATABASE_URL` and all PostgreSQL variables at the isolated
target instead of production. After restoration run database integrity and
application smoke tests, record recovery point/time objectives, then securely
destroy the drill copy. Run a drill at least quarterly and after material
schema or backup tooling changes.

### Automated fresh-database verification

`deploy/postgres/verify-fresh-postgres.mjs` is the repeatable acceptance drill.
It creates a uniquely named source database with the guarded prefix
`caretrack_source_verify_`, applies every Prisma migration, loads the synthetic
non-PHI fixture, and calls the generic backup verifier. The verifier:

1. fingerprints the quiescent source schema, table contents, row counts, and
   sequence state;
2. creates a compressed custom-format dump and SHA-256 checksum;
3. creates a separately named, demonstrably empty
   `caretrack_restore_verify_` target;
4. validates the checksum and restores with `pg_restore`;
5. requires exact schema/table/content/count/sequence matches; and
6. drops both temporary databases and removes temporary artifacts by default,
   including on handled failure.

The PostgreSQL account must be allowed to create and drop only drill databases.
The scripts refuse to drop names outside their verification prefixes. Supply
credentials through environment variables; they are converted to `PG*`
variables for child processes and are never included in process arguments or
normal output.

With PostgreSQL client tools on `PATH`:

```bash
cd backend
VERIFY_ADMIN_DATABASE_URL='postgresql://verify-user:secret@127.0.0.1:5432/postgres' \
  npm run verify:backup-restore
```

On Windows, point `PG_BIN` at the client installation when it is not on
`PATH`:

```powershell
cd backend
$env:VERIFY_ADMIN_DATABASE_URL = '<injected PostgreSQL administrator URL>'
$env:PG_BIN = 'C:\Program Files\PostgreSQL\17\bin'
npm run verify:backup-restore
```

To verify an existing quiescent source rather than generate a migrated fixture,
run `node deploy/postgres/verify-backup-restore.mjs` from the repository root
with `SOURCE_DATABASE_URL` and `VERIFY_TARGET_ADMIN_URL`. Use
`VERIFY_CONTENT_HASH=false` only for an explicitly approved large-data smoke
drill; the default exact content comparison is the stronger test. Set
`KEEP_VERIFY_BACKUP=true` only when the test artifact is secured and scheduled
for deletion. `VERIFY_EVIDENCE_PATH` may record machine-readable JSON in a
protected evidence location.

The latest repository-state drill and its limitations are recorded in
[Backup/restore evidence](backup-restore-evidence.md).

## Observability and operations

Alert on API/database/clamd health, ClamAV signature freshness, elevated
`401`/`403`/`429`/`5xx` rates, mail/push delivery failures, audit-log pipeline
failures, certificate expiry, migration failure, and backup age. Logs must use
request/correlation IDs and redact
authorization headers, cookies, passwords, token hashes, reset URLs, VAPID
subscriptions, SMTP credentials, and patient payloads.

Production API requests emit one structured JSON completion event when
`HTTP_LOGGING=true` (production enables it implicitly). The event is limited to
request ID, method, path without query parameters, status, and duration; it
does not log headers, cookies, request/response bodies, or query values. The
same request ID is returned in `X-Request-Id`. Readiness polling is omitted to
avoid log noise.

NGINX uses the `caretrack_safe` access-log format: it records `$uri` without
`$args` and omits the Referer header. Password-reset and email-verification
links place their single-use token in the URL fragment (`#token=...`), which is
not sent in the HTTP request; the SPA removes it from browser history before
making the API call. These controls prevent ordinary edge/application access
logs from collecting one-time credentials.
