# Backup and restore

There are two complementary ways to keep your recipes safe: the **operator backup** on this page (scripts that copy
the whole server) and the **in-app zip export** (recipes and photos only, from Settings; see [In-app export](#in-app-export-and-import)
below). Use the backup for disaster recovery and the zip to move recipes between Recipe Boxes.

Your recipes live in two places: the database (recipes, accounts, tags) and the photo folder. One command backs up
both, one command puts them back. The test suite does this for real on every pull request: it backs up a household,
deletes the whole stack including its disks, restores, and checks every recipe and photo is identical.

## Back up
From the repo folder, with the stack running:

```sh
sh scripts/backup.sh
```

It writes a folder `backups/<date>-<time>/` with four files:

| File | What it is |
|---|---|
| `db.dump` | The database: recipes, tags, accounts (password hashes, not passwords). |
| `media.tar` | Every photo. |
| `backup.info` | Plain text: when, how many recipes, accounts and photos, the database version. |
| `SHA256SUMS` | Fingerprints, so a restore can tell if a file was damaged or changed. |

What is **not** in a backup, on purpose: the `.env` file (database password, AI key), and sign-in sessions. After a
restore everyone signs in again with the same password. Keep your `.env` somewhere safe (a password manager); you
need it to set up a new machine. The backup folder is readable only by you, but it holds your household's recipes and
password hashes, so treat copies as private.

The backup is made while the app keeps running. Before it says "Backup written" it reads both files back from start to
end (the whole database dump and the whole photo archive), and a backup that fails leaves nothing half-written behind.

**How exact is a backup taken while the app is running?** The database is saved as one consistent snapshot, then the
photos are packed right after. Photos are written once and never changed, so a photo uploaded in between is simply in
the archive without its recipe (harmless). The reverse can happen too: a photo deleted in those few seconds leaves a
recipe whose picture is missing in the backup. If a photo changes while it is being packed, the backup warns you and
carries on. For a backup where nothing can have changed, stop the app for the few seconds it takes and start it again,
all in one command:

```sh
sh scripts/backup.sh --stop-api
```
Do that before an upgrade or a move to a new computer. The daily automatic one does not need it.

## Restore
```sh
sh scripts/restore.sh backups/<date>-<time>
```

Restore **replaces** what is there with the backup, so it is careful:

- It checks the fingerprints first and stops if the backup is damaged, or if the fingerprint file does not cover all
  three files. It also reads the whole database dump and the photo archive, and refuses a photo archive that holds
  anything but plain files (no absolute paths, `..`, links or devices), so a tampered backup cannot write outside the
  photo folder.
- It unpacks the photos into a scratch folder next to the current ones first, as a full trial. If that fails, nothing
  has changed yet.
- It asks you to type `yes`. Anything else cancels and changes nothing.
- If the Recipe Box already has recipes, accounts or photos it refuses, and tells you so. Add `--force` to go ahead;
  it saves what is there as `backups/pre-restore-<time>` (after the app is stopped, so no change is lost; it is never
  pruned, and it never prunes your other backups), so even a wrong restore can be undone.
- It refuses a backup made by a **newer** Recipe Box than the one running ("Upgrade first"). An older backup is fine:
  the app upgrades the database itself when it starts.
- The database is replaced in one step: it applies completely or not at all. The whole database schema is rebuilt from
  the backup, so the result is exactly what was backed up, with nothing left over from a newer version.
- The photos are swapped in by renaming: the current ones are moved aside, the new ones moved in, and the old ones
  deleted only after that worked. If a step fails, the old photos are put back. The app is stopped while this happens
  and started again at the end, and the script checks the numbers match the backup.

Use `--yes` to skip the question (for scripts).

### On a new computer
1. Install Docker, get the repo, copy your saved `.env` in.
2. `docker compose up -d` (use the same release as the backup came from, or a newer one: `IMAGE_TAG`, see
   [[Deploying]]). Do not create an admin account; the backup brings the accounts.
3. `sh scripts/restore.sh backups/<date>-<time>`.

### Going back after a bad upgrade
Take a backup before every upgrade (`sh scripts/backup.sh --stop-api`). If the new version misbehaves: set the old
`IMAGE_TAG`, `docker compose up -d`, then `sh scripts/restore.sh backups/<the one from before> --force`. Tables the
newer version added are removed by the restore, so the old version (and a later upgrade again) starts from exactly the
state you backed up.

## Run it automatically
Backups only help if they happen. A daily one, keeping the newest 14 (the default; change with `BACKUP_KEEP`, `0`
keeps everything):

**Linux, Raspberry Pi, Mac** (`crontab -e`; change the path):
```
30 3 * * * cd /home/pi/recipe-box && sh scripts/backup.sh >> backups/backup.log 2>&1
```
**Windows** (Task Scheduler → Create Basic Task → daily → Start a program; Git for Windows installed):
program `C:\Program Files\Git\bin\bash.exe`, arguments `-c "cd /c/Users/you/recipe-box && sh scripts/backup.sh >> backups/backup.log 2>&1"`.
Two settings matter, or the task silently does nothing:
- **Docker Desktop must be running** when the task starts (the scripts talk to the containers through it). Set Docker
  Desktop to start when you sign in, and leave the computer on; if it is not running the log says "cannot reach the
  database".
- In the task's properties choose **Run whether user is logged on or not**, so it still runs when the screen is locked
  or nobody is signed in (Windows asks for your password once).

Only the folders named like a timestamp are ever removed (oldest first, and only after a new backup succeeded).
`pre-restore-*` folders and anything you name yourself stay until you delete them. A name you give with `BACKUP_NAME`
may not look like a timestamp (the script refuses it), so it can never be pruned by mistake.

## Copy backups off the machine
A backup on the same disk as the app does not survive a dead disk, a theft or a fire. Keep a copy somewhere else,
automatically. Pick one:

```sh
# another computer on your network or a VPS (adds new folders, never deletes)
rsync -a backups/ you@other-machine:recipe-box-backups/

# any cloud storage rclone supports (Google Drive, Dropbox, OneDrive, S3, Backblaze...): `rclone config` once
rclone copy backups remote:recipe-box-backups
```
Use `copy`, not `sync`: `sync` would also delete the remote copies when local retention prunes old ones. A USB drive
you swap every month works too. Aim for three copies, two kinds of storage, one away from home. If the destination is
not yours alone (shared cloud storage), encrypt first, for example `tar -c backups/<folder> | age -p > backup.tar.age`.

Put the copy on the same schedule right after the backup, for example
`... sh scripts/backup.sh && rclone copy backups remote:recipe-box-backups`.

**Test a restore once** on a spare machine or a second folder before you need it. The steps above are the whole
procedure.

## Not using Docker Compose
Fly.io and other managed hosts have no `docker compose` to run the scripts against. The scripts also work against a
plain Postgres and a photo folder: `BACKUP_MODE=direct DATABASE_URL=postgres://... MEDIA_DIR=/path/to/photos sh scripts/backup.sh`
(needs `psql`, `pg_dump`, `pg_restore` version 16 or newer, and `tar`). For restore, stop the API first; the script
refuses while anything is connected. See [[Deploy-Fly]] for what that means there.

Because restore empties the photo folder, it first checks `MEDIA_DIR`: it must be an absolute path, not `/`, an existing
folder, and look like a photo folder (plain files only, no folders inside). Pointing it at your home folder by mistake
is refused. Restored photos get fixed permissions (folders `755`, files `644`) so the API can read them whichever
account ran the restore; run the restore as the same account that runs the API (or as root) so that it can also
write new photos there.

## In-app export and import
Admins can also download every recipe and photo as one `.zip` from **Settings > Export and import**, and import such a
zip into any Recipe Box (ACC-5). It is for moving recipes between boxes or keeping a portable copy. It holds recipes and
photos only: no accounts, sign-in sessions or settings, so it is **not** a replacement for the backup above. For a whole
server (accounts included), use `scripts/backup.sh` and `scripts/restore.sh`.

- **Download export** saves one `.zip` with every recipe and every photo. Recipes you deleted are not in it. It is built as it downloads, so a big box starts downloading at once.
- **Import export** picks such a zip and adds its recipes. Nothing is overwritten.

What import does:
- Every recipe and photo gets a new identity and is recorded as added by you, today.
- A recipe that is already in the box (same id, which is the case when you import a file back into the box it came from) is **skipped**. Importing the same file into a different box twice adds the recipes twice.
- Everything is checked first: the recipe fields follow the same rules as typing a recipe in, and photos are checked and re-saved like any upload. If anything is wrong, **nothing is imported** and the message says what. The recipes are added in a single database transaction.
- Only one import runs at a time; a second one started meanwhile is refused (HTTP 409). Try again when the first finishes.
- Files that are not exports, are damaged, are too big (limit `MAX_BACKUP_MB`, 512 MB by default), contain unexpected files, or come from a newer Recipe Box are refused.

To move to a new install without the backup scripts: set up the new box, sign in as its admin, and import the zip.
Household accounts and settings are not in the zip; add members again (a script restore brings them back).

The zip format is documented in `docs/API.md` ("Backup archive format").
