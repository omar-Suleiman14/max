# Using Max locally

[العربية](user-guide.ar.md)

Max stores your workspace on this computer. Pages, databases, search, workflows and local backups work without an account, subscription or internet connection. Local backup is free.

## Start a workspace

1. On the welcome screen, choose **Get started** and select English or Arabic.
2. Name the workspace. Choose a blank workspace or import a Max Blueprint file.
3. Choose a daily, weekly or manual local backup schedule, then enter the workspace.
4. Create a page or database from the workspace navigation. A database record is also a page and can contain page content.

Use **Settings → Appearance** to change the theme or language. Use **Ctrl+K** to search the workspace and **Ctrl+,** to open or leave Settings.

## Create and check a local backup

1. Open **Settings → Backup**. The local backup section shows the schedule and the last successful backup.
2. Choose **Create Local Backup Now**. Open **Backup Snapshots** to see the new snapshot's time, type, size and file location.
3. Open that snapshot and choose **Verify Integrity**. Check both the **Checksum** and **SQLite integrity** results.
4. Copy the backup file to another drive if you want protection against loss of this computer. Keep the file location somewhere you can find later.

Scheduled backups run while Max is open. If one fails, the Backup screen shows a warning. You can create a backup manually while you investigate.

## Restore a local backup

Open **Settings → Backup → Backup Snapshots**, expand the snapshot and choose **Restore**. Review the date and filename in the confirmation dialog. Max creates a protective snapshot of the current workspace before restoration and restarts to open the restored workspace. After restart, the Backup screen shows the protective snapshot's location. A snapshot made by a newer Max database version cannot be restored by an older version of Max.

Restoration of the active database is undergoing further reliability work. Keep a separate copy of important backup files and verify the restored pages and records before relying on them. If restoration fails, keep the original backup file and the protective snapshot while you seek help.

New backup files declare format version 1. Backups made before this field existed are treated as format 1. Max can restore format 1 when its SQLite schema is supported; older schemas upgrade through Max's migrations. A newer schema or unknown backup format is refused without replacing the current workspace.

## What is available now

Max Blueprint files can move supported workspace content between installations. A Blueprint is not a replacement for a full local backup. Max Cloud backup is present, but is still being repaired and should not be your only copy. GitHub and self-hosted backup destinations, sync, public publishing, and mobile access are planned features; they are not required for local work.

For developer installation and packaging commands, see the [README](../README.md). Store listings are announced only after publication.
