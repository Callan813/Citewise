#!/bin/sh
# Backs up the database and uploaded files, and keeps 14 days of backups.
# Run daily from cron on the server, from the project folder. Keep a copy off the
# server too: a backup on the same disk doesn't survive losing that disk.
#   0 3 * * * cd /opt/citewise && ./deploy/backup.sh >> backup.log 2>&1
set -eu

STAMP=$(date +%Y-%m-%d-%H%M)
DIR=${BACKUP_DIR:-./backups}
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
mkdir -p "$DIR"

$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > "$DIR/db-$STAMP.sql.gz"
$COMPOSE exec -T api tar -czf - -C /app uploads > "$DIR/uploads-$STAMP.tar.gz"

find "$DIR" -type f -mtime +14 -delete
echo "Backed up to $DIR at $STAMP"
