# Shared by backup.sh and restore.sh (OPS-6). Source it; do not run it.
# shellcheck shell=sh
#
# Two ways to reach the data, chosen with BACKUP_MODE:
#   compose (default)  the Compose stack in this folder: `db` and `api` services, `docker compose` must work here.
#   direct             no Docker: DATABASE_URL (postgres://...) and MEDIA_DIR (the photo folder), with psql, pg_dump and
#                      pg_restore on the PATH (version 16 or newer). Used for a native install and by the test suite.
# Everything the scripts need from the stack sits behind the small functions below.

# Git Bash on Windows rewrites arguments that look like paths (/data/media) unless told not to.
export MSYS_NO_PATHCONV=1

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

MODE=${BACKUP_MODE:-compose}
MEDIA_IN_CONTAINER=/data/media

die() { # die <message> [exit code]
  echo "error: $1" >&2
  exit "${2:-1}"
}

case $MODE in
  compose) command -v docker >/dev/null 2>&1 || die "docker is not installed or not on the PATH" ;;
  direct)
    [ -n "${DATABASE_URL:-}" ] && [ -n "${MEDIA_DIR:-}" ] || die "BACKUP_MODE=direct needs DATABASE_URL and MEDIA_DIR" 2
    for tool in psql pg_dump pg_restore tar; do
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

# Archive on stdin, replaces the schema in one transaction: it applies completely or not at all.
db_restore() {
  if [ "$MODE" = compose ]; then
    docker compose exec -T db sh -c 'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl --single-transaction --exit-on-error'
  else
    pg_restore -d "$DATABASE_URL" --clean --if-exists --no-owner --no-acl --single-transaction --exit-on-error
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
  media_run 'find "$1" -type f ! -path "*/.restore-incoming/*" | wc -l' </dev/null | tr -d ' \r'
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
