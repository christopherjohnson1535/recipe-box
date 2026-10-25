#!/usr/bin/env sh
# Restore a backup made by scripts/backup.sh. REPLACES the current recipes, accounts and photos.  (OPS-6)
#
#   sh scripts/restore.sh backups/<timestamp> [--yes] [--force]
#
# The stack must be up (the database must be reachable). The script:
#   1. checks the backup is complete and unchanged (SHA256SUMS);
#   2. refuses a backup from a NEWER version of Recipe Box than the one running, or from a newer PostgreSQL;
#   3. refuses to touch a database that already holds recipes, accounts or photos unless you pass --force, and then
#      takes a safety backup of it first (backups/pre-restore-<time>);
#   4. asks you to type yes (skip with --yes, for scripts);
#   5. stops the API, replaces the database (one transaction: all or nothing) and the photos, starts the API, and
#      checks the counts against the backup.
# An older backup is fine: the API upgrades the database itself when it starts.
# Exit codes: 0 done, 1 failed or cancelled, 2 wrong usage, 3 refused (not empty without --force, or newer backup).
set -eu

dir=""
yes=0
force=0
for arg in "$@"; do
  case $arg in
    --yes) yes=1 ;;
    --force) force=1 ;;
    -h | --help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "unknown option $arg (see --help)" >&2; exit 2 ;;
    *) [ -z "$dir" ] || { echo "only one backup folder, please" >&2; exit 2; }; dir=$arg ;;
  esac
done
[ -n "$dir" ] || { echo "usage: sh scripts/restore.sh backups/<timestamp> [--yes] [--force]" >&2; exit 2; }
case $dir in /*) ;; *) dir="$PWD/$dir" ;; esac # relative to where you are, before the library moves to the repo folder

. "$(dirname "$0")/backup-lib.sh"
umask 077

# --- 1. the backup itself ------------------------------------------------------------------------------------------
for f in db.dump media.tar backup.info SHA256SUMS; do
  [ -f "$dir/$f" ] || die "$dir is not a complete backup: $f is missing"
done
(cd "$dir" && sha -c SHA256SUMS >/dev/null 2>&1) || die "$dir does not match its SHA256SUMS: the backup is damaged or was changed. Nothing was restored."
grep -qx 'format=1' "$dir/backup.info" || die "$dir was made by a different version of these scripts (backup.info has no format=1)"

backup_version=$(dump_version "$dir/db.dump")
backup_major=$(dump_pg_major "$dir/db.dump")
want_users=$(dump_count "$dir/db.dump" users)
want_recipes=$(dump_count "$dir/db.dump" recipes)
want_photos=$(tar -tf "$dir/media.tar" | grep -vc '/$' || true)

# --- 2 and 3. is it safe to restore here? --------------------------------------------------------------------------
echo "select 1" | db_psql >/dev/null || die "cannot reach the database. Is the stack running? (docker compose up -d)"
have_version=$(schema_version)
have_major=$(pg_major)
have_users=$(table_rows users)
have_recipes=$(table_rows recipes)
have_photos=$(media_count)

[ -n "$backup_major" ] || die "cannot read the PostgreSQL version from $dir/db.dump"
if [ "$backup_major" -gt "$have_major" ]; then
  die "the backup came from PostgreSQL $backup_major but this database is PostgreSQL $have_major. Use the same or a newer PostgreSQL. Nothing was changed." 3
fi
if [ "$backup_version" -gt "$have_version" ] && [ "$have_version" -gt 0 ]; then
  die "the backup is from a newer Recipe Box (database version $backup_version) than the one running here ($have_version). Upgrade first (set IMAGE_TAG to the newer release, or pull and rebuild), then restore. Nothing was changed." 3
fi

nonempty=0
if [ "$have_users" -gt 0 ] || [ "$have_recipes" -gt 0 ] || [ "$have_photos" -gt 0 ]; then nonempty=1; fi
if [ "$nonempty" = 1 ] && [ "$force" = 0 ]; then
  die "this Recipe Box already has data ($have_recipes recipes, $have_users accounts, $have_photos photo files). Restoring replaces all of it. If that is what you want, run again with --force (a safety backup is taken first)." 3
fi

# --- 4. confirm ----------------------------------------------------------------------------------------------------
echo "Backup:   $dir"
sed 's/^/          /' "$dir/backup.info"
echo "Here now: $have_recipes recipes, $have_users accounts, $have_photos photo files (database version $have_version)"
if [ "$backup_version" -lt "$have_version" ]; then
  echo "Note:     the backup is older ($backup_version); it is restored as is and the API upgrades it when it starts."
fi
if [ "$have_version" -eq 0 ]; then
  echo "Note:     the API has not run here yet, so the database version could not be compared. If it will not start afterwards, run a newer release."
fi
api_check_stopped
if [ "$yes" = 0 ]; then
  printf "This replaces all current recipes, accounts and photos with the backup. Type yes to continue: "
  answer=""
  read -r answer || true
  [ "$answer" = "yes" ] || die "cancelled. Nothing was changed."
fi

# --- 5. restore ----------------------------------------------------------------------------------------------------
if [ "$nonempty" = 1 ]; then
  safety=$(date -u +pre-restore-%Y%m%d-%H%M%S)
  echo "Taking a safety backup of the current data first: ${BACKUP_DIR:-backups}/$safety"
  BACKUP_NAME=$safety sh "$ROOT/scripts/backup.sh" >/dev/null </dev/null || die "the safety backup failed, so nothing was changed"
fi

api_stopped=0
finish() {
  if [ "$api_stopped" = 1 ]; then api_start || echo "The API did not start. Check: docker compose logs api" >&2; fi
}
trap finish EXIT
trap 'exit 130' INT TERM

api_stop
api_stopped=1
db_restore <"$dir/db.dump" || die "the database restore failed. It ran in one transaction, so the database is as it was. Restarting the API."

# The new photos are unpacked beside the old ones first and swapped in only when the archive read cleanly.
media_run 'd=$1; inc=$d/.restore-incoming
rm -rf "$inc"; mkdir -p "$inc"
if ! tar --no-same-owner -C "$inc" -xf -; then rm -rf "$inc"; echo "the photo archive could not be unpacked; photos left unchanged" >&2; exit 1; fi
find "$d" -mindepth 1 -maxdepth 1 ! -name .restore-incoming -exec rm -rf {} +
find "$inc" -mindepth 1 -maxdepth 1 -exec mv {} "$d"/ \;
rmdir "$inc"' <"$dir/media.tar" || die "the database was restored but the photos were not (the archive could not be unpacked). Run this restore again; the safety backup, if one was made, is in ${BACKUP_DIR:-backups}."

api_start
api_stopped=0

# --- verify --------------------------------------------------------------------------------------------------------
got_users=$(table_rows users)
got_recipes=$(table_rows recipes)
got_photos=$(media_count)
echo "Restored: $got_recipes recipes, $got_users accounts, $got_photos photo files"
if [ "$got_users" != "$want_users" ] || [ "$got_recipes" != "$want_recipes" ] || [ "$got_photos" != "$want_photos" ]; then
  die "the counts after the restore ($got_recipes recipes, $got_users accounts, $got_photos photos) differ from the backup ($want_recipes, $want_users, $want_photos)"
fi
echo "Restored from $dir. Everyone has to sign in again."
