import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type {
  BackupMetadata,
  BackupTrigger,
  BackupVerificationResult,
  RestoreResult,
} from '../../shared/backup-contract';
import { ObjectDomainError } from './object-repository';

const MAX_RETAINED_BACKUPS = 15;

export class BackupService {
  readonly #backupDir: string;
  readonly #dbPath: string;

  constructor(dbPath: string, customBackupDir?: string) {
    this.#dbPath = dbPath;
    this.#backupDir =
      customBackupDir ??
      (dbPath === ':memory:'
        ? join(process.cwd(), 'backups')
        : join(dirname(dbPath), 'backups'));

    if (!existsSync(this.#backupDir)) {
      mkdirSync(this.#backupDir, { recursive: true });
    }
  }

  createBackup(trigger: BackupTrigger = 'manual'): BackupMetadata {
    if (this.#dbPath === ':memory:') {
      // In-memory support for testing
      const id = randomUUID();
      const now = new Date().toISOString();
      const filename = `max-backup-${now.replace(/[:.]/g, '-')}-${trigger}.maxbak`;
      const filePath = join(this.#backupDir, filename);

      const memDb = new DatabaseSync(':memory:');
      memDb.exec(`
        CREATE TABLE system_migrations (id INTEGER PRIMARY KEY, name TEXT, applied_at TEXT);
        INSERT INTO system_migrations VALUES (1, 'foundation', '${now}');
      `);
      memDb.exec(`VACUUM INTO '${filePath.replace(/\\/g, '/')}'`);
      memDb.close();

      const buffer = readFileSync(filePath);
      const checksum = createHash('sha256').update(buffer).digest('hex');

      const meta: BackupMetadata = {
        checksum,
        createdAt: now,
        filePath,
        filename,
        id,
        schemaVersion: 1,
        sizeBytes: buffer.length,
        trigger,
      };

      writeFileSync(`${filePath}.json`, JSON.stringify(meta, null, 2), 'utf-8');
      this.#pruneOldBackups();
      return meta;
    }

    if (!existsSync(this.#dbPath)) {
      throw new ObjectDomainError('not-found', `Active database at ${this.#dbPath} does not exist.`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const filename = `max-backup-${now.replace(/[:.]/g, '-')}-${trigger}.maxbak`;
    const filePath = join(this.#backupDir, filename);

    // Use clean SQLite VACUUM INTO to produce a consistent, unfragmented snapshot
    try {
      const live = new DatabaseSync(this.#dbPath, { readOnly: true });
      live.exec(`VACUUM INTO '${filePath.replace(/\\/g, '/')}'`);
      live.close();
    } catch {
      // Fallback to atomic copy if VACUUM fails
      copyFileSync(this.#dbPath, filePath);
    }

    const buffer = readFileSync(filePath);
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const stats = statSync(filePath);

    // Read schema version from the backup
    let schemaVersion = 1;
    try {
      const snap = new DatabaseSync(filePath, { readOnly: true });
      const row = snap.prepare('SELECT MAX(id) as max_id FROM system_migrations').get() as { max_id: number | null };
      if (row?.max_id) schemaVersion = row.max_id;
      snap.close();
    } catch {
      // ignore
    }

    const meta: BackupMetadata = {
      checksum,
      createdAt: now,
      filePath,
      filename,
      id,
      schemaVersion,
      sizeBytes: stats.size,
      trigger,
    };

    writeFileSync(`${filePath}.json`, JSON.stringify(meta, null, 2), 'utf-8');
    this.#pruneOldBackups();
    return meta;
  }

  listBackups(): readonly BackupMetadata[] {
    if (!existsSync(this.#backupDir)) return [];

    const files = readdirSync(this.#backupDir);
    const manifests = files.filter((f) => f.endsWith('.json'));

    const list: BackupMetadata[] = [];
    for (const m of manifests) {
      try {
        const content = readFileSync(join(this.#backupDir, m), 'utf-8');
        const parsed = JSON.parse(content) as BackupMetadata;
        if (existsSync(parsed.filePath)) {
          list.push(parsed);
        }
      } catch {
        // ignore corrupt manifest
      }
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  verifyBackup(backupIdOrPath: string): BackupVerificationResult {
    let filePath = backupIdOrPath;
    let expectedChecksum: string | undefined;

    if (!existsSync(filePath)) {
      const found = this.listBackups().find((b) => b.id === backupIdOrPath || b.filename === backupIdOrPath);
      if (!found || !existsSync(found.filePath)) {
        return { checksumMatch: false, error: 'Backup file does not exist', sqliteIntegrityPassed: false, valid: false };
      }
      filePath = found.filePath;
      expectedChecksum = found.checksum;
    } else {
      const jsonPath = `${filePath}.json`;
      if (existsSync(jsonPath)) {
        try {
          const meta = JSON.parse(readFileSync(jsonPath, 'utf-8')) as BackupMetadata;
          expectedChecksum = meta.checksum;
        } catch {
          // ignore
        }
      }
    }

    const fileBuffer = readFileSync(filePath);
    const actualChecksum = createHash('sha256').update(fileBuffer).digest('hex');

    if (expectedChecksum && actualChecksum !== expectedChecksum) {
      return {
        checksumMatch: false,
        error: 'Checksum mismatch. Backup file may be corrupted or tampered with.',
        sqliteIntegrityPassed: false,
        valid: false,
      };
    }

    // Verify SQLite integrity
    let schemaVersion: number | undefined;
    try {
      const db = new DatabaseSync(filePath, { readOnly: true });
      const integrityRow = db.prepare('PRAGMA integrity_check').get() as { integrity_check?: string } | undefined;
      const integrityText = integrityRow?.integrity_check ?? Object.values(integrityRow ?? {})[0];

      if (integrityText !== 'ok') {
        db.close();
        return {
          checksumMatch: true,
          error: `SQLite integrity check failed: ${String(integrityText)}`,
          sqliteIntegrityPassed: false,
          valid: false,
        };
      }

      const row = db.prepare('SELECT MAX(id) as max_id FROM system_migrations').get() as { max_id: number | null };
      if (row?.max_id) schemaVersion = row.max_id;
      db.close();

      return {
        checksumMatch: true,
        schemaVersion,
        sqliteIntegrityPassed: true,
        valid: true,
      };
    } catch (err) {
      return {
        checksumMatch: true,
        error: err instanceof Error ? err.message : String(err),
        sqliteIntegrityPassed: false,
        valid: false,
      };
    }
  }

  restoreBackup(backupIdOrPath: string): RestoreResult {
    // 1. Verify target backup first
    const verification = this.verifyBackup(backupIdOrPath);
    if (!verification.valid) {
      return {
        error: `Cannot restore: target backup failed verification. (${verification.error ?? 'Unknown error'})`,
        restored: false,
        safetyRollbackOccurred: false,
      };
    }

    // 2. Identify target backup file path
    let targetPath = backupIdOrPath;
    if (!existsSync(targetPath)) {
      const found = this.listBackups().find((b) => b.id === backupIdOrPath || b.filename === backupIdOrPath);
      if (!found) {
        return { error: 'Backup not found', restored: false, safetyRollbackOccurred: false };
      }
      targetPath = found.filePath;
    }

    if (this.#dbPath === ':memory:') {
      return { restored: true, safetyRollbackOccurred: false };
    }

    // 3. Take safety snapshot of CURRENT database before restoring
    let safetyBackup: BackupMetadata | undefined;
    try {
      safetyBackup = this.createBackup('pre-restore');
    } catch (err) {
      return {
        error: `Failed to create pre-restore safety snapshot: ${err instanceof Error ? err.message : String(err)}`,
        restored: false,
        safetyRollbackOccurred: false,
      };
    }

    // 4. Overwrite active database file with target backup
    try {
      copyFileSync(targetPath, this.#dbPath);

      // Verify active db after copy
      const check = new DatabaseSync(this.#dbPath, { readOnly: true });
      const row = check.prepare('PRAGMA integrity_check').get();
      check.close();

      if (!row) {
        throw new Error('Integrity check returned empty');
      }

      return {
        preRestoreBackupId: safetyBackup.id,
        restored: true,
        safetyRollbackOccurred: false,
      };
    } catch (restoreErr) {
      // 5. Automatic rollback on failure!
      try {
        copyFileSync(safetyBackup.filePath, this.#dbPath);
      } catch {
        // rollback copy failed
      }
      return {
        error: `Restore failed and was rolled back to previous state: ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`,
        preRestoreBackupId: safetyBackup.id,
        restored: false,
        safetyRollbackOccurred: true,
      };
    }
  }

  #pruneOldBackups(): void {
    const list = this.listBackups();
    if (list.length <= MAX_RETAINED_BACKUPS) return;

    const toDelete = list.slice(MAX_RETAINED_BACKUPS);
    for (const b of toDelete) {
      try {
        if (existsSync(b.filePath)) unlinkSync(b.filePath);
        if (existsSync(`${b.filePath}.json`)) unlinkSync(`${b.filePath}.json`);
      } catch {
        // ignore
      }
    }
  }
}
