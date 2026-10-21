#!/usr/bin/env sh
# Restore a backup made by scripts/backup.sh. REPLACES current recipes and photos.  (OPS-6)
# Usage: sh scripts/restore.sh backups/<timestamp>
set -eu
dir="${1:?usage: sh scripts/restore.sh backups/<timestamp>}"
[ -f "$dir/db.dump" ] && [ -f "$dir/media.tar" ] || { echo "missing db.dump or media.tar in $dir"; exit 1; }
printf "This replaces all current recipes and photos with %s. Type yes to continue: " "$dir"
read -r answer
[ "$answer" = "yes" ] || { echo "cancelled"; exit 1; }
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$dir/db.dump"
docker compose exec -T api tar -C /data/media -xf - < "$dir/media.tar"
docker compose restart api
echo "Restored from $dir"
