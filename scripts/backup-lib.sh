# Shared by backup.sh and restore.sh (OPS-6). Source it; do not run it.
# shellcheck shell=sh
# shellcheck disable=SC2016  # the snippets handed to `sh -c` / `docker compose exec` are single-quoted on purpose
#
# Two ways to reach the data, chosen with BACKUP_MODE:
#   compose (default)  the Compose stack in this folder: `db` and `api` services, `docker compose` must work here.
#   direct             no Docker: DATABASE_URL (postgres://...) and MEDIA_DIR (the photo folder), with psql, pg_dump and
#                      pg_restore on the PATH (version 16 or newer). Used for a native install and by the test suite.
# Everything the scripts need from the stack sits behind the small functions below.

# Git Bash on Windows rewrites arguments that look like paths (/data/media) unless told not to.
export MSYS_NO_PATHCONV=1

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT" || exit 1

MODE=${BACKUP_MODE:-compose}
MEDIA_IN_CONTAINER=/data/media

die() { # die <message> [exit code]
  echo "error: $1" >&2
  exit "${2:-1}"
}

command -v tar >/dev/null 2>&1 || die "tar is not installed or not on the PATH"
case $MODE in
  compose) command -v docker >/dev/null 2>&1 || die "docker is not installed or not on the PATH" ;;
  direct)
    [ -n "${DATABASE_URL:-}" ] && [ -n "${MEDIA_DIR:-}" ] || die "BACKUP_MODE=direct needs DATABASE_URL and MEDIA_DIR" 2
    for tool in psql pg_dump pg_restore; do
      command -v "$tool" >/dev/null 2>&1 || die "$tool is not installed or not on the PATH"
    done
    ;;
  *) die "BACKUP_MODE must be compose or direct, not '$MODE'" 2 ;;
esac

sha() { # sha256 of files (sha256sum, or shasum on macOS)
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}

# --- database -----------------------------------------------------------------------------------------------------
# SQL on stdin, bare values on stdout.
db_psql() {
  if [ "$MODE" = compose ]; then
    docker compose exec -T db sh -c 'exec psql -X -q -t -A -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
  else
    psql "$DATABASE_URL" -X -q -t -A -v ON_ERROR_STOP=1
  fi
}

# A consistent snapshot as a custom-format archive on stdout. Sign-in sessions are left out (they are secrets, and a
# restored copy should sign everyone out); no ownership or grants, so it restores under any database user.
db_dump() {
  if [ "$MODE" = compose ]; then
    docker compose exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl --exclude-table-data=sessions'
  else
    pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --exclude-table-data=sessions
  fi
}

# Archive on stdin. Replaces the whole `public` schema in ONE transaction, so it applies completely or not at all:
# the schema is dropped and recreated (owned by the connecting role, the same grants a fresh database has) and the
# archive is then loaded as plain SQL. Dropping it is what makes an older backup restore EXACTLY: tables a newer release
# added since are gone too, instead of lingering and breaking the next upgrade. The archive is turned into SQL in a
# temporary file first, so an archive that fails halfway never reaches the database.
RESTORE_SH=$(
  cat <<'EOS'
set -eu
t=$(mktemp)
trap 'rm -f "$t" "$t.body"' EXIT
cat >"$t" <<'SQL'
SET client_min_messages = warning;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public AUTHORIZATION CURRENT_USER;
COMMENT ON SCHEMA public IS 'standard public schema';
GRANT USAGE ON SCHEMA public TO PUBLIC;
SQL
pg_restore --no-owner --no-acl -f "$t.body"
cat "$t.body" >>"$t"
runpsql --single-transaction -f "$t" >/dev/null
EOS
)
db_restore() {
  if [ "$MODE" = compose ]; then
    docker compose exec -T db sh -c 'runpsql() { psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"; }
'"$RESTORE_SH"
  else
    sh -c 'runpsql() { psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }
'"$RESTORE_SH"
  fi
}

# pg_restore with other options, reading an archive on stdin (list it, or print table data as text).
db_readdump() {
  if [ "$MODE" = compose ]; then docker compose exec -T db pg_restore "$@"; else pg_restore "$@"; fi
}

# The rows of one table inside an archive, as COPY text, one row per line (written to $2 so a failure is noticed).
dump_table_rows() { # <archive> <table> <out file>
  db_readdump -a -t "$2" -f - <"$1" >"$3.raw" || die "could not read table $2 from $1"
  awk '/^COPY /{c=1;next} /^\\\.$/{c=0;next} c' "$3.raw" >"$3"
  rm -f "$3.raw"
}

dump_count() { # <archive> <table>: how many rows the archive holds for the table
  t=$(mktemp)
  dump_table_rows "$1" "$2" "$t"
  wc -l <"$t" | tr -d ' '
  rm -f "$t"
}

dump_version() { # <archive>: newest migration version it contains
  t=$(mktemp)
  dump_table_rows "$1" _sqlx_migrations "$t"
  awk '{ if ($1 + 0 > m) m = $1 + 0 } END { printf "%.0f\n", m }' "$t"
  rm -f "$t"
}

dump_pg_major() { # <archive>: major version of the server that made it
  db_readdump --list <"$1" | sed -n 's/^; *Dumped from database version: *\([0-9][0-9]*\)\..*/\1/p'
}

# --- photos -------------------------------------------------------------------------------------------------------
# Run a shell snippet where the photo folder is, with the folder as $1 and stdin/stdout passed through.
media_exec() { # <snippet>
  if [ "$MODE" = compose ]; then
    docker compose exec -T api sh -c "$1" sh "$MEDIA_IN_CONTAINER"
  else
    sh -c "$1" sh "$MEDIA_DIR"
  fi
}

# Same, but while the API is stopped: a one-off container on the same volume, as the API's own user.
media_run() { # <snippet>
  if [ "$MODE" = compose ]; then
    docker compose run --rm --no-deps -T --entrypoint sh api -c "$1" sh "$MEDIA_IN_CONTAINER"
  else
    sh -c "$1" sh "$MEDIA_DIR"
  fi
}

media_count() { # photo files currently stored (a one-off container, so it works while the API is down or restarting)
  media_run 'find "$1" -type f ! -path "*/.restore-incoming/*" ! -path "*/.restore-old/*" | wc -l' </dev/null | tr -d ' \r'
}

# Direct mode empties MEDIA_DIR on restore, so look hard at it first. It must be a real absolute path (not / and not
# relative) and look like what the API keeps there: plain files in one flat folder. A folder that holds other folders
# (your home, /var, /) is not the photo folder, and nothing is touched. Compose mode always uses /data/media.
media_dir_guard() {
  [ "$MODE" = direct ] || return 0
  d=$MEDIA_DIR
  case $d in /*) ;; *) die "MEDIA_DIR must be an absolute path, not '$d'. Nothing was changed." 2 ;; esac
  trimmed=$d
  while [ "${trimmed%/}" != "$trimmed" ]; do trimmed=${trimmed%/}; done
  [ -n "$trimmed" ] || die "MEDIA_DIR must not be /. Nothing was changed." 2
  case /$trimmed/ in */../* | */./*) die "MEDIA_DIR must not contain . or .. parts ('$d'). Nothing was changed." 2 ;; esac
  [ -d "$d" ] || die "MEDIA_DIR '$d' is not a folder. Nothing was changed." 2
  sub=$(find "$d" -mindepth 1 -maxdepth 1 -type d ! -name '.restore-*' ! -name lost+found | head -n 1)
  [ -z "$sub" ] || die "MEDIA_DIR '$d' holds folders (for example $(basename "$sub")). The API keeps photos as plain files in one folder, so this does not look like the photo folder. Nothing was changed." 3
}

# Refuse a photo archive that could write outside the photo folder or create anything but plain files and folders
# (absolute or .. names, symlinks, hardlinks, devices, pipes). Read with the host's tar; the first character of each
# `tar -tv` line is the member type.
tar_check_members() { # <archive>
  names=$(mktemp)
  verbose=$(mktemp)
  if ! tar -tf "$1" >"$names" 2>/dev/null || ! tar -tvf "$1" >"$verbose" 2>/dev/null; then
    rm -f "$names" "$verbose"
    die "the photo archive cannot be read"
  fi
  if [ "$(wc -l <"$names")" != "$(wc -l <"$verbose")" ]; then
    rm -f "$names" "$verbose"
    die "the photo archive has unusual file names (a line break in one): refusing it. Nothing was changed."
  fi
  bad=""
  grep -Eq '^/|(^|/)\.\.(/|$)' "$names" && bad="a path that is absolute or contains .."
  [ -z "$bad" ] && [ -n "$(cut -c1 "$verbose" | grep -v '^[-d]$' | head -n 1)" ] && bad="something that is not a plain file or folder (a link, device or pipe)"
  rm -f "$names" "$verbose"
  [ -z "$bad" ] || die "the photo archive is unsafe: it holds $bad. Nothing was changed."
}

# Unpack the photo archive on stdin into <MEDIA_DIR>/.restore-incoming, the same filesystem as the photos so that moving
# them in later is a rename. A full test extraction: it fails now, with nothing else touched, if the archive is bad.
# Files get explicit modes (folders 755, files 644) so the API, which may run as another user than the operator, can
# read them; run as root, ownership is copied from the photo folder.
media_stage() { # <expected number of files>
  case $1 in '' | *[!0-9]*) die "internal error: file count '$1'" ;; esac
  media_run "want=$1"'; d=$1; inc=$d/.restore-incoming; old=$d/.restore-old
umask 022
if [ -e "$old" ]; then echo "$old is left from an interrupted restore: move its contents back into $d or delete it, then run again" >&2; exit 1; fi
rm -rf "$inc"
mkdir "$inc" || exit 1
if ! tar --no-same-owner -C "$inc" -xf -; then rm -rf "$inc"; echo "the photo archive could not be unpacked" >&2; exit 1; fi
got=$(find "$inc" -type f | wc -l | tr -d " ")
if [ "$got" != "$want" ]; then rm -rf "$inc"; echo "the photo archive holds $got files after unpacking, expected $want" >&2; exit 1; fi
find "$inc" -type d -exec chmod 755 {} + && find "$inc" -type f -exec chmod 644 {} + || { rm -rf "$inc"; echo "could not set permissions on the unpacked photos" >&2; exit 1; }
if [ "$(id -u)" = 0 ]; then chown -R "$(stat -c %u:%g "$d")" "$inc" || { rm -rf "$inc"; echo "could not set the owner of the unpacked photos" >&2; exit 1; }; fi'
}

# Swap the staged photos in: the current ones are renamed aside, the new ones renamed in, the old ones deleted after
# that. A failure on the way puts the old ones back. (Renames only, inside MEDIA_DIR: it can be a mount point.)
media_swap() {
  media_run 'd=$1; inc=$d/.restore-incoming; old=$d/.restore-old
[ -d "$inc" ] || { echo "no unpacked photos to swap in" >&2; exit 1; }
[ ! -e "$old" ] || { echo "$old is left from an interrupted restore" >&2; exit 1; }
mkdir "$old" || exit 1
moveall() { find "$1" -mindepth 1 -maxdepth 1 ! -name .restore-incoming ! -name .restore-old -exec sh -c '"'"'dest=$1; shift; mv -- "$@" "$dest"/'"'"' sh "$2" {} +; }
if ! moveall "$d" "$old"; then moveall "$old" "$d"; rmdir "$old"; echo "could not move the current photos aside; they are as they were" >&2; exit 1; fi
if ! moveall "$inc" "$d"; then
  find "$d" -mindepth 1 -maxdepth 1 ! -name .restore-incoming ! -name .restore-old -exec rm -rf {} +
  moveall "$old" "$d"; rmdir "$old"
  echo "could not move the restored photos in; the previous photos were put back" >&2; exit 1
fi
rm -rf "$old" || echo "warning: could not delete $old; remove it by hand" >&2
rmdir "$inc" 2>/dev/null || rm -rf "$inc"' </dev/null
}

media_unstage() { # drop an unpacked-but-unused copy
  media_run 'rm -rf "$1/.restore-incoming"' </dev/null
}

# --- the API ------------------------------------------------------------------------------------------------------
# Direct mode cannot stop the API for you, so look before anything is changed: nobody else may be connected.
api_check_stopped() {
  [ "$MODE" = direct ] || return 0
  others=$(echo "select count(*) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()" | db_psql)
  [ "$others" = 0 ] || die "$others other connection(s) to the database: stop the Recipe Box API first, then run this again" 3
}

api_stop() {
  if [ "$MODE" = compose ]; then docker compose stop api >&2; else api_check_stopped; fi
}

api_start() {
  if [ "$MODE" = compose ]; then
    docker compose up -d --no-deps --wait --wait-timeout 180 api >&2
  else
    echo "Start the Recipe Box API again."
  fi
}

# --- the target's current state ------------------------------------------------------------------------------------
table_rows() { # <table>: row count, 0 when the table does not exist yet
  has=$(echo "select to_regclass('public.$1') is not null" | db_psql)
  [ "$has" = t ] || { echo 0; return; }
  echo "select count(*) from public.$1" | db_psql
}

schema_version() { # newest applied migration, 0 when the API has never run
  has=$(echo "select to_regclass('public._sqlx_migrations') is not null" | db_psql)
  [ "$has" = t ] || { echo 0; return; }
  echo "select coalesce(max(version), 0) from public._sqlx_migrations" | db_psql
}

pg_major() {
  echo "select current_setting('server_version_num')::int / 10000" | db_psql
}
