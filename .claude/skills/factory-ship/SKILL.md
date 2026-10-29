---
name: factory-ship
description: Stage 7 of the software factory — deliver the verified build to the owner's machine and GitHub, and report what's open. Use when a factory run passes testing, or when the owner asks to sync, push or release.
---

# Ship

## By size (see `factory`)
- **S / M / L:** the same steps; the PR carries the tier and the stage-timing line. Sections 2 and 4 apply only
  when the owner asks for them.

## 1. Final state
- Working tree clean; last commit message is a short subject plus a 1-3 line body saying what the round did. Commits end with the attribution trailer the
  session provides.
- The fix ledger lives in the PR description: a line for every finding; open items listed.
- The PR description states the tier and a stage-timing line (the PR template has both): minutes per stage
  (plan · build · verify · test · ship) and the number of agents used. These numbers are how the tiers get tuned.

## 2. Deliver to the owner's machine (when building in a separate sandbox)
- Copy source + `.git`, never `node_modules`, `.next`, `data`:
  `tar --exclude=./node_modules --exclude=./.next --exclude=./data --exclude=./.git/objects -cf - . | (cd <dest> && tar --overwrite -xf -)`
  then `tar -cf - .git/objects | (cd <dest> && tar --skip-old-files -xf -)` (git objects are read-only; existing
  ones are identical).
- On the destination: `git config core.filemode false` (mounted Windows folders flip exec bits), then
  `git status` must be clean.
- Deletions don't propagate through a copy: list stale files for the owner to delete (or ask for delete
  permission once).
- If `package.json` changed: tell the owner to run `npm ci` (not `npm audit fix --force`, which flips
  framework lint packages between majors).

## 3. GitHub
- If GitHub is connected to the session: push to the private repo the owner named.
- Otherwise give the owner the three commands:
  `gh auth login` → `gh repo create <name> --private --source . --push` (plus `safe.directory` if git complains).
- Secrets stay out: `data/` (settings with client secret, tokens) is gitignored.

## 4. Optional targets
- Docker: `docker compose up -d --build` (localhost-only port, read-only card mount). Card detection and file speed
  are weaker than native on Windows — keep native as the default.
- Vercel: imports the repo fine; file features only work on the local machine — say so.

## 5. Report to the owner
Where it is, how to run it, what changed (3–5 bullets), checks that passed, what's still open (incl. anything not
visually verified), one next step.
