#!/usr/bin/env sh
# Back up the database and the recipe photos into backups/<timestamp>/  (OPS-6)
#
#   sh scripts/backup.sh              run from anywhere; the stack must be up (db and api running)
#
# Writes db.dump (PostgreSQL archive), media.tar (photos), backup.info (counts and versions, readable) and SHA256SUMS.
# Contains no secrets from .env (no database password, no API key) and no sign-in sessions; it does contain your
# household's accounts (password hashes) and recipes, so keep copies private.
#
# Settings (environment):
#   BACKUP_DIR   where backups go (default: backups, in the repo folder)
#   BACKUP_KEEP  how many timestamped backups to keep, oldest removed first after a successful run (default 14, 0 = keep all)
#   BACKUP_NAME  folder name instead of the timestamp (such a folder is never pruned)
#   BACKUP_MODE  compose (default) or direct (DATABASE_URL + MEDIA_DIR, no Docker), see scripts/backup-lib.sh
set -eu
. "$(dirname "$0")/backup-lib.sh"
umask 077

base=${BACKUP_DIR:-backups}
keep=${BACKUP_KEEP:-14}
case $keep in '' | *[!0-9]*) die "BACKUP_KEEP must be a whole number, not '$keep'" 2 ;; esac
name=${BACKUP_NAME:-$(date -u +%Y%m%d-%H%M%S)}
case $name in '' | *[!A-Za-z0-9._-]* | .*) die "BACKUP_NAME may only contain letters, digits, dot, dash and underscore" 2 ;; esac

out="$base/$name"
[ ! -e "$out" ] || die "$out already exists (two backups in the same second?); nothing was changed"
mkdir -p "$base"
tmp="$base/.partial-$name"
rm -rf "$tmp"
mkdir "$tmp"
trap 'rm -rf "$tmp"' EXIT
trap 'exit 130' INT TERM

echo "select 1" | db_psql >/dev/null || die "cannot reach the database. Is the stack running? (docker compose up -d)"
media_exec 'test -d "$1"' </dev/null || die "cannot reach the photo folder. Is the stack running? (docker compose up -d)"

# The database first, then the photos: a photo uploaded in between is then in the archive without a recipe pointing at
# it (harmless), never the other way round.
db_dump >"$tmp/db.dump" || die "pg_dump failed"
media_exec 'exec tar -C "$1" -cf - .' >"$tmp/media.tar" || die "could not archive the photos"

# Prove both files can be read back before calling this a backup.
db_readdump --list <"$tmp/db.dump" >"$tmp/list.txt" || die "the database dump cannot be read back"
rm -f "$tmp/list.txt"
tar -tf "$tmp/media.tar" >"$tmp/files.txt" || die "the photo archive cannot be read back"
photos=$(grep -vc '/$' "$tmp/files.txt" || true)
rm -f "$tmp/files.txt"

# Counts come from the archive itself, so they describe exactly what was captured. Assigned first: a failure inside
# a command substitution that is only echoed would be missed.
version=$(dump_version "$tmp/db.dump")
major=$(dump_pg_major "$tmp/db.dump")
users=$(dump_count "$tmp/db.dump" users)
recipes=$(dump_count "$tmp/db.dump" recipes)
images=$(dump_count "$tmp/db.dump" images)
created=$(date -u +%Y-%m-%dT%H:%M:%SZ)
{
  echo "format=1"
  echo "created=$created"
  echo "schema_version=$version"
  echo "postgres_major=$major"
  echo "users=$users"
  echo "recipes=$recipes"
  echo "images=$images"
  echo "photo_files=$photos"
} >"$tmp/backup.info"
(cd "$tmp" && sha db.dump media.tar backup.info >SHA256SUMS)

mv "$tmp" "$out"
echo "Backup written to $out"
sed 's/^/  /' "$out/backup.info"

if [ "$keep" -gt 0 ]; then
  # Only folders named like a timestamp are ever removed; BACKUP_NAME folders, pre-restore copies and anything else stay.
  ls -1 "$base" | grep -E '^[0-9]{8}-[0-9]{6}$' | sort -r | tail -n +$((keep + 1)) | while read -r old; do
    if [ -d "$base/$old" ]; then
      rm -rf "${base:?}/$old"
      echo "Removed old backup $old (keeping the newest $keep)"
    fi
  done
fi
echo "Next: copy $out somewhere else (another drive or cloud storage). docs/wiki/Backup-and-Restore.md says how."
