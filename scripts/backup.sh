#!/usr/bin/env bash
# Nightly PostgreSQL backup (cron: 0 2 * * * /opt/mwc360/scripts/backup.sh)
# Keeps 14 daily dumps. Copy the backups folder to off-site storage (S3, Backblaze, Google Drive).
set -euo pipefail
DIR="${BACKUP_DIR:-/var/backups/mwc360}"; mkdir -p "$DIR"
STAMP=$(date +%F)
docker compose exec -T db pg_dump -U mwc -d mwc360 --format=custom > "$DIR/mwc360-$STAMP.dump"
find "$DIR" -name 'mwc360-*.dump' -mtime +14 -delete
echo "Backup written: $DIR/mwc360-$STAMP.dump"
# Restore: docker compose exec -T db pg_restore -U mwc -d mwc360 --clean < mwc360-YYYY-MM-DD.dump
