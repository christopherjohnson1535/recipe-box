# Backup and restore

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

The backup is made while the app keeps running. It checks both files can be read back before it says "Backup
written", and a backup that fails leaves nothing half-written behind.

## Restore
```sh
sh scripts/restore.sh backups/<date>-<time>
```

Restore **replaces** what is there with the backup, so it is careful:

- It checks the fingerprints first and stops if the backup is damaged.
- It asks you to type `yes`. Anything else cancels and changes nothing.
- If the Recipe Box already has recipes, accounts or photos it refuses, and tells you so. Add `--force` to go ahead;
  it first saves what is there as `backups/pre-restore-<time>`, so even a wrong restore can be undone.
- It refuses a backup made by a **newer** Recipe Box than the one running ("Upgrade first"). An older backup is fine:
  the app upgrades the database itself when it starts.
- The database is replaced in one step: it applies completely or not at all. The app is stopped while this happens
  and started again at the end, and the script checks the numbers match the backup.

Use `--yes` to skip the question (for scripts).

### On a new computer
1. Install Docker, get the repo, copy your saved `.env` in.
2. `docker compose up -d` (use the same release as the backup came from, or a newer one: `IMAGE_TAG`, see
   [[Deploying]]). Do not create an admin account; the backup brings the accounts.
3. `sh scripts/restore.sh backups/<date>-<time>`.

### Going back after a bad upgrade
Take a backup before every upgrade. If the new version misbehaves: set the old `IMAGE_TAG`, `docker compose up -d`,
then `sh scripts/restore.sh backups/<the one from before> --force`.

## Run it automatically
Backups only help if they happen. A daily one, keeping the newest 14 (the default; change with `BACKUP_KEEP`, `0`
keeps everything):

**Linux, Raspberry Pi, Mac** (`crontab -e`; change the path):
```
30 3 * * * cd /home/pi/recipe-box && sh scripts/backup.sh >> backups/backup.log 2>&1
```
**Windows** (Task Scheduler → Create Basic Task → daily → Start a program; Docker Desktop and Git for Windows installed):
program `C:\Program Files\Git\bin\bash.exe`, arguments `-c "cd /c/Users/you/recipe-box && sh scripts/backup.sh"`.

Only the folders named like a timestamp are ever removed (oldest first, and only after a new backup succeeded).
`pre-restore-*` folders and anything you name yourself stay until you delete them.

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

## In-app export
Admins will also be able to export every recipe and photo as a zip from the app and import it again (ACC-5). That is
for moving recipes between Recipe Boxes; it has no accounts or settings. This page is the whole-server backup.
