#!/usr/bin/env sh
# Fetch the third-party skills the factory uses into .factory/vendor (gitignored). Re-run to update.
set -e
dir="$(cd "$(dirname "$0")/../.." && pwd)/.factory/vendor"
mkdir -p "$dir"
for repo in dietrichgebert/ponytail codeswithroh/tastemaker pbakaus/impeccable LovroPodobnik/refactoring-ui-skill; do
  name="${repo#*/}"
  if [ -d "$dir/$name/.git" ]; then git -C "$dir/$name" pull -q --ff-only; else git clone -q --depth 1 "https://github.com/$repo" "$dir/$name"; fi
  echo "ok $name"
done
