# Rollback runbook

Use this runbook for staging and production only after preserving evidence,
confirming the failing release version, and identifying the last known good
application image or commit.

## Application rollback

1. Stop new deployments and pause scheduled release automation.
2. Preserve API, web, migration, and database logs for the incident window.
3. Confirm the database schema is compatible with the previous application
   version. If migrations were additive/backward-compatible, roll back the
   application image first.
4. Redeploy the last known good backend and frontend images or rebuild from the
   last known good commit.
5. Keep the same production `.env.production`, TLS files, database volume, and
   document volume unless the incident specifically involves one of those
   assets.
6. Run the smoke test and UAT-critical flows before reopening traffic.

For the supplied Docker Compose deployment, a typical application-only rollback
is:

```bash
git checkout <last-known-good-release-tag>
docker compose --env-file .env.production -f docker-compose.production.yml build
docker compose --env-file .env.production -f docker-compose.production.yml up -d
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

If immutable images are pushed to a registry, prefer retagging/redeploying the
known good image digest instead of rebuilding.

## Database migration safety

Prisma migrations are forward-only operational events. Before deployment,
review every migration for destructive changes, table rewrites, long locks,
data backfills, and compatibility with the previous application version.

- Prefer expand/contract migrations: add nullable columns or new tables first,
  deploy compatible code, backfill safely, then remove old structures in a
  later release.
- Take a verified backup before `npx prisma migrate deploy`.
- For destructive or non-backward-compatible migrations, require an approved
  maintenance window and a tested restore plan.
- If a migration fails midway, stop and preserve logs. Do not improvise manual
  schema edits without a reviewed recovery plan.

## Backup requirements

Before production deployment or rollback, confirm:

- The latest PostgreSQL dump exists, has a matching SHA-256 checksum, and has
  been replicated to encrypted off-host storage.
- The private document storage volume has a matching recovery snapshot for the
  same logical backup window.
- Restore drills are current and were run against an isolated target.
- Backup credentials are separate from application credentials.

## What not to do in production

- Do not run `prisma migrate reset` in production or staging-like data
  environments. It drops and recreates the database.
- Do not delete migration rows from `_prisma_migrations` to force progress.
- Do not drop tables, truncate patient data, or wipe volumes to "clear" a bad
  deployment.
- Do not commit `.env.production`, database dumps, TLS private keys, provider
  secrets, VAPID private keys, SMTP passwords, or copied production logs with
  credentials.
- Do not roll back application code across an incompatible database migration
  without an approved database recovery plan.
- Do not restore production data into a shared developer machine.

## Rollback verification

After rollback:

1. Confirm `docker compose ... ps` shows healthy `database`, `api`, `web`, and
   supporting services.
2. Run `scripts/smoke-test.ps1` against the public HTTPS base URL.
3. Verify `GET /api/v1/health` returns success and does not expose database
   details.
4. Log in as patient, doctor, and admin test accounts if available.
5. Confirm patient A cannot access patient B records by direct URL/API probes.
6. Confirm assigned doctors can access assigned patients and cannot access
   unassigned patients.
7. Create a harmless test record in staging; in production, use read-only
   checks unless an approved validation account and action are documented.
8. Review API/web logs for elevated `401`, `403`, `429`, and `5xx` rates.
9. Confirm background jobs, notifications, and backups are running.
10. Record the rollback version, operator, timestamp, reason, checks performed,
    and any follow-up remediation.
