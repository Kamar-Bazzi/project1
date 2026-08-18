#!/bin/sh
set -eu
umask 077

: "${POSTGRES_HOST:?POSTGRES_HOST is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

temporary_backup=""
cleanup() {
  if [ -n "$temporary_backup" ]; then
    rm -f "$temporary_backup"
  fi
}
trap cleanup EXIT
trap 'cleanup; exit 143' HUP INT TERM

while true; do
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  database_backup="$BACKUP_DIR/${POSTGRES_DB}_${timestamp}.dump"
  temporary_backup="${database_backup}.partial"

  pg_dump \
    --host "$POSTGRES_HOST" \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --format custom \
    --compress 9 \
    --no-owner \
    --no-privileges \
    --file "$temporary_backup"

  mv "$temporary_backup" "$database_backup"
  temporary_backup=""
  sha256sum "$database_backup" > "${database_backup}.sha256"

  find "$BACKUP_DIR" -type f \
    \( -name '*.dump' -o -name '*.dump.sha256' \) \
    -mtime "+$BACKUP_RETENTION_DAYS" -delete

  sleep "$BACKUP_INTERVAL_SECONDS"
done
