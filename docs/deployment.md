# Production deployment, HTTPS, and backups

The supplied deployment uses Docker Compose, NGINX TLS termination, a private
PostgreSQL network, one-shot Prisma migrations, health checks, and scheduled
checksummed database dumps.

## Prerequisites

- Linux host with Docker Engine and the Compose plugin
- DNS record pointing the production hostname to the host
- TLS certificate and private key from a trusted CA
- SMTP credentials and VAPID web-push keys
- External encrypted, versioned storage for off-host backup copies
- Secret manager, or a root-owned deployment environment file as a fallback

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

Generate secrets outside shell history where possible. `JWT_SECRET` should be
at least 32 cryptographically random bytes. Store SMTP passwords, the VAPID
private key, database credentials, and JWT secret in the platform secret
manager.

## Validate and launch

```bash
docker compose --env-file .env.production \
  -f docker-compose.production.yml config --quiet

docker compose --env-file .env.production \
  -f docker-compose.production.yml build --pull

docker compose --env-file .env.production \
  -f docker-compose.production.yml run --rm --no-deps api \
  npm run verify:production

docker compose --env-file .env.production \
  -f docker-compose.production.yml up -d
```

`migrate` must complete successfully before `api` starts, and `web` waits for
the public `GET /api/v1/health` readiness endpoint. That endpoint returns
success only after a PostgreSQL probe; it exposes no counts, credentials, or
database error detail. Inspect status and redacted logs:

```bash
docker compose --env-file .env.production \
  -f docker-compose.production.yml ps
docker compose --env-file .env.production \
  -f docker-compose.production.yml logs --tail=100 migrate api web backup
```

Do not paste Compose configuration or unredacted logs into tickets: expanded
environment values can contain secrets.

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

Alert on API/database health, elevated `401`/`403`/`429`/`5xx` rates, mail/push
delivery failures, audit-log pipeline failures, certificate expiry, migration
failure, and backup age. Logs must use request/correlation IDs and redact
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
