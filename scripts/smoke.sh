#!/usr/bin/env sh
# End-to-end smoke test of a running stack, entirely through the web container.
#   docker compose up -d --build --wait
#   sh scripts/smoke.sh                 # BASE=http://127.0.0.1:3000 by default
# Logs in (SMOKE_USER / SMOKE_PASSWORD), uploads an image, and checks it still serves after
# `docker compose down && docker compose up -d --wait` (the media and pgdata volumes survive).
# On a fresh database it creates that user as the admin, but only with SMOKE_SETUP=1, so it never claims the admin
# account of a real install by accident (CI sets it). The uploaded test image stays in your media folder.
# Works on Linux, macOS and Git Bash on Windows; needs curl.
set -eu

BASE=${BASE:-http://127.0.0.1:3000}
USERNAME=${SMOKE_USER:-smoke}
PASSWORD=${SMOKE_PASSWORD:-smoke-test-password}
RESTART=${SMOKE_RESTART:-1}
SETUP=${SMOKE_SETUP:-0}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
jar="$work/cookies"

fail() { echo "FAIL: $*" >&2; exit 1; }
step() { echo "== $*"; }

step "health through :3000"
curl -fsS "$BASE/api/health" | grep -q '"db":"ok"' || fail "/api/health did not report db ok"

step "setup or login"
if curl -fsS "$BASE/api/setup" | grep -q '"needsSetup":true'; then
  [ "$SETUP" = 1 ] || fail "no admin account yet; re-run with SMOKE_SETUP=1 to create '$USERNAME' as admin (test stacks only)"
  code=$(curl -sS -o "$work/out" -w '%{http_code}' -c "$jar" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$USERNAME\",\"displayName\":\"Smoke Test\",\"password\":\"$PASSWORD\"}" "$BASE/api/setup")
  [ "$code" = 201 ] || fail "POST /api/setup returned $code: $(cat "$work/out")"
fi
code=$(curl -sS -o "$work/out" -w '%{http_code}' -c "$jar" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" "$BASE/api/auth/login")
[ "$code" = 200 ] || fail "POST /api/auth/login returned $code: $(cat "$work/out")"
curl -fsS -b "$jar" "$BASE/api/auth/me" | grep -q "\"username\":\"$USERNAME\"" || fail "/api/auth/me after login"

step "unauthenticated request is refused"
code=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/recipes")
[ "$code" = 401 ] || fail "GET /api/recipes without a session returned $code"

step "upload an image"
# 2x2 red PNG (`base64 -d` on GNU/Git Bash, `-D` on older macOS)
png='iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg=='
printf '%s' "$png" | base64 -d > "$work/red.png" 2>/dev/null || printf '%s' "$png" | base64 -D > "$work/red.png"
code=$(curl -sS -o "$work/image.json" -w '%{http_code}' -b "$jar" -F "file=@$work/red.png;type=image/png" "$BASE/api/media")
[ "$code" = 201 ] || fail "POST /api/media returned $code: $(cat "$work/image.json")"
url=$(sed -n 's/.*"url":"\([^"]*\)".*/\1/p' "$work/image.json")
[ -n "$url" ] || fail "no url in $(cat "$work/image.json")"
curl -fsS -b "$jar" -o "$work/served.jpg" "$BASE$url" || fail "GET $url"
[ -s "$work/served.jpg" ] || fail "$url served an empty body"

if [ "$RESTART" = 1 ]; then
  step "restart the stack (down, up) and check the image survived"
  docker compose down
  docker compose up -d --wait --wait-timeout 180
  code=$(curl -sS -o /dev/null -w '%{http_code}' -c "$jar" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" "$BASE/api/auth/login")
  [ "$code" = 200 ] || fail "login after restart returned $code"
  curl -fsS -b "$jar" -o "$work/served2.jpg" "$BASE$url" || fail "GET $url after restart"
  cmp -s "$work/served.jpg" "$work/served2.jpg" || fail "image changed after restart"
fi

echo "OK: smoke test passed against $BASE"
