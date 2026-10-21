#!/usr/bin/env sh
# Back up the database and recipe photos into ./backups/<timestamp>/  (OPS-6)
# Usage: sh scripts/backup.sh   (run from the repo root while the stack is up)
set -eu
stamp=$(date +%Y%m%d-%H%M%S)
out="backups/$stamp"
mkdir -p "$out"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$out/db.dump"
docker compose exec -T api tar -C /data/media -cf - . > "$out/media.tar"
echo "Backup written to $out (db.dump, media.tar)"
