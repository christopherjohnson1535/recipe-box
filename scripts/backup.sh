#!/usr/bin/env sh
# Back up the database and the recipe photos into backups/<timestamp>/  (OPS-6)
#
#   sh scripts/backup.sh [--stop-api]    run from anywhere; the stack must be up (db and api running)
#
# Writes db.dump (PostgreSQL archive), media.tar (photos), backup.info (counts and versions, readable) and SHA256SUMS.
# Contains no secrets from .env (no database password, no API key) and no sign-in sessions; it does contain your
# household's accounts (password hashes) and recipes, so keep copies private.
#
# The app keeps running while it backs up. The database is one consistent snapshot; the photos are archived right
# after it, so a photo uploaded in between is in the archive without a recipe, and a photo deleted in between leaves
# a recipe whose picture is missing. Photos are written once and never changed, so files do not change under the
# archiver (if one does, a warning says so). --stop-api stops the API for the few seconds it takes and starts it again:
# then nothing can change and the backup is exactly consistent.
#
# Settings (environment):
#   BACKUP_DIR   where backups go (default: backups, in the repo folder)
#   BACKUP_KEEP  how many timestamped backups to keep, oldest removed first after a successful run (default 14, 0 = keep all)
#   BACKUP_NAME  folder name instead of the timestamp (never pruned; a name that looks like a timestamp is refused)
#   BACKUP_MODE  compose (default) or direct (DATABASE_URL + MEDIA_DIR, no Docker), see scripts/backup-lib.sh
# shellcheck disable=SC2016  # snippets for `sh -c` / `docker compose exec` are single-quoted on purpose
set -eu

stop_api=0
for arg in "$@"; do
  case $arg in
    --stop-api) stop_api=1 ;;
    -h | --help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument $arg (see --help)" >&2; exit 2 ;;
  esac
done

# shellcheck source=backup-lib.sh
. "$(dirname "$0")/backup-lib.sh"
umask 077

base=${BACKUP_DIR:-backups}
keep=${BACKUP_KEEP:-14}
case $keep in '' | *[!0-9]*) die "BACKUP_KEEP must be a whole number, not '$keep'" 2 ;; esac
name=${BACKUP_NAME:-$(date -u +%Y%m%d-%H%M%S)}
case $name in '' | *[!A-Za-z0-9._-]* | .*) die "BACKUP_NAME may only contain letters, digits, dot, dash and underscore" 2 ;; esac
if [ -n "${BACKUP_NAME:-}" ] && printf '%s\n' "$name" | grep -Eq '^[0-9]{8}-[0-9]{6}$'; then
  die "BACKUP_NAME '$name' looks like a timestamp, and timestamped folders are pruned. Pick another name (for example before-upgrade)." 2
fi

out="$base/$name"
[ ! -e "$out" ] || die "$out already exists (two backups in the same second?); nothing was changed"
mkdir -p "$base"
tmp="$base/.partial-$name"
rm -rf "$tmp"
mkdir "$tmp"

# restore.sh stops the API itself and then asks for a safety backup: BACKUP_API_STOPPED=1 (internal) says the API is
# already down, so the photos are read with a one-off container instead of `exec` into the API.
api_down=${BACKUP_API_STOPPED:-0}
api_stopped=0
cleanup() {
  rm -rf "$tmp"
  if [ "$api_stopped" = 1 ]; then api_start || echo "The API did not start. Check: docker compose logs api" >&2; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

photos_run() { if [ "$api_down" = 1 ]; then media_run "$1"; else media_exec "$1"; fi; }

echo "select 1" | db_psql >/dev/null || die "cannot reach the database. Is the stack running? (docker compose up -d)"
if [ "$stop_api" = 1 ] && [ "$api_down" = 0 ]; then
  api_stop
  api_stopped=1
  api_down=1
fi
photos_run 'test -d "$1"' </dev/null || die "cannot reach the photo folder. Is the stack running? (docker compose up -d)"

# The database first, then the photos. GNU tar exits 1 when a file changed or vanished while it was read: only that is
# tolerated, with a warning (photos are written once and renamed into place, so it takes a deletion to cause it).
db_dump >"$tmp/db.dump" || die "pg_dump failed"
photos_run 'tar -C "$1" --exclude=./.restore-incoming --exclude=./.restore-old -cf - .; rc=$?
if [ "$rc" -eq 1 ] && tar --version 2>/dev/null | grep -q GNU; then
  echo "warning: a photo changed or was deleted while the photos were archived. Run with --stop-api for an exactly consistent backup." >&2
  exit 0
fi
exit "$rc"' >"$tmp/media.tar" </dev/null || die "could not archive the photos"

# Prove both files can be read back, all the way through, before calling this a backup.
db_readdump -f /dev/null <"$tmp/db.dump" || die "the database dump cannot be read back"
tar -xOf "$tmp/media.tar" >/dev/null || die "the photo archive cannot be read back"
tar -tf "$tmp/media.tar" >"$tmp/files.txt" || die "the photo archive cannot be listed"
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
  find "$base" -mindepth 1 -maxdepth 1 -type d | sed 's|.*/||' | grep -E '^[0-9]{8}-[0-9]{6}$' | sort -r | tail -n +$((keep + 1)) | while read -r old; do
    rm -rf "${base:?}/$old"
    echo "Removed old backup $old (keeping the newest $keep)"
  done
fi
echo "Next: copy $out somewhere else (another drive or cloud storage). docs/wiki/Backup-and-Restore.md says how."
