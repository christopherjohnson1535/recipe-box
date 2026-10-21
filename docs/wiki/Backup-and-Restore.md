# Backup and restore

From the repo folder, with the stack running:

```sh
sh scripts/backup.sh                 # → backups/<time>/db.dump and media.tar
sh scripts/restore.sh backups/<time> # replaces everything; asks to confirm
```

Copy the `backups/` folder somewhere else (another drive, cloud storage). Test a restore once after setting up.

_Status: scripts exist; full test and scheduling are a Phase 4 issue._
