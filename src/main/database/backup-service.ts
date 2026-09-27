import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
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
  LocalBackupStatus,
  RestoreResult,
} from '../../shared/backup-contract';
import { BACKUP_FORMAT_VERSION } from '../../shared/backup-contract';
import { ObjectDomainError } from './object-repository';
import { migrations } from './migrations';

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

  getStatus(): LocalBackupStatus {
    let lastScheduledFailureAt: string | undefined;
    let lastRestoreSafetyPath: string | undefined;
    try {
      const value = JSON.parse(readFileSync(join(this.#backupDir, 'schedule-failure.state'), 'utf8')) as { at?: unknown };
      if (typeof value.at === 'string' && Number.isFinite(Date.parse(value.at))) lastScheduledFailureAt = value.at;
    } catch { /* Optional status must never prevent local work. */ }
    try {
      const value = JSON.parse(readFileSync(join(this.#backupDir, 'restore-status.state'), 'utf8')) as { safetyPath?: unknown };
      if (typeof value.safetyPath === 'string' && existsSync(value.safetyPath)) lastRestoreSafetyPath = value.safetyPath;
    } catch { /* Optional status must never prevent local work. */ }
    return { currentBackupFormatVersion: BACKUP_FORMAT_VERSION, currentSchemaVersion: migrations.at(-1)?.id ?? 0, ...(lastScheduledFailureAt ? { lastScheduledFailureAt } : {}), ...(lastRestoreSafetyPath ? { lastRestoreSafetyPath } : {}) };
  }

  recordScheduledFailure(): void {
    try {
      const path = join(this.#backupDir, 'schedule-failure.state');
      const temporary = `${path}.tmp`;
      writeFileSync(temporary, JSON.stringify({ at: new Date().toISOString() }), 'utf8');
      renameSync(temporary, path);
    } catch { /* A status write cannot block local Max. */ }
  }

  clearScheduledFailure(): void {
    try {
      const path = join(this.#backupDir, 'schedule-failure.state');
      if (existsSync(path)) unlinkSync(path);
    } catch { /* A status write cannot block local Max. */ }
  }

  createBackup(trigger: BackupTrigger = 'manual'): BackupMetadata {
    if (this.#dbPath === ':memory:') {
      // In-memory support for testing
      const id = randomUUID();
      const now = new Date().toISOString();
      const filename = `max-backup-${now.replace(/[:.]/g, '-')}-${trigger}-${id}.maxbak`;
      const filePath = join(this.#backupDir, filename);

      const memDb = new DatabaseSync(':memory:');
      memDb.exec(`
        CREATE TABLE system_migrations (id INTEGER PRIMARY KEY, name TEXT, applied_at TEXT);
        INSERT INTO system_migrations VALUES (1, 'foundation', '${now}');
      `);
      memDb.prepare('VACUUM INTO ?').run(filePath);
      memDb.close();

      const buffer = readFileSync(filePath);
      const checksum = createHash('sha256').update(buffer).digest('hex');

      const meta: BackupMetadata = {
        checksum,
        createdAt: now,
        filePath,
        filename,
        formatVersion: BACKUP_FORMAT_VERSION,
        id,
        schemaVersion: 1,
        sizeBytes: buffer.length,
        trigger,
      };

      writeFileSync(`${filePath}.json`, JSON.stringify(meta, null, 2), 'utf-8');
      if (trigger !== 'pre-restore' && trigger !== 'pre-migration') this.#pruneOldBackups();
      return meta;
    }

    if (!existsSync(this.#dbPath)) {
      throw new ObjectDomainError('not-found', `Active database at ${this.#dbPath} does not exist.`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const filename = `max-backup-${now.replace(/[:.]/g, '-')}-${trigger}-${id}.maxbak`;
    const filePath = join(this.#backupDir, filename);
    const existedBefore = existsSync(filePath);

    // A plain file copy can omit committed writes in the WAL. If SQLite cannot
    // produce a consistent snapshot, fail without publishing a backup.
    let live: DatabaseSync | undefined;
    try {
      live = new DatabaseSync(this.#dbPath, { readOnly: true });
      live.prepare('VACUUM INTO ?').run(filePath);
    } catch (error) {
      live?.close();
      live = undefined;
      if (!existedBefore && existsSync(filePath)) unlinkSync(filePath);
      throw error;
    } finally {
      live?.close();
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
      formatVersion: BACKUP_FORMAT_VERSION,
      id,
      schemaVersion,
      sizeBytes: stats.size,
      trigger,
    };

    writeFileSync(`${filePath}.json`, JSON.stringify(meta, null, 2), 'utf-8');
    if (trigger !== 'pre-restore' && trigger !== 'pre-migration') this.#pruneOldBackups();
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
    let formatVersion: unknown;

    if (!existsSync(filePath)) {
      const found = this.listBackups().find((b) => b.id === backupIdOrPath || b.filename === backupIdOrPath);
      if (!found || !existsSync(found.filePath)) {
        return { checksumMatch: false, error: 'Backup file does not exist', sqliteIntegrityPassed: false, valid: false };
      }
      filePath = found.filePath;
      expectedChecksum = found.checksum;
      formatVersion = found.formatVersion;
    } else {
      const jsonPath = `${filePath}.json`;
      if (existsSync(jsonPath)) {
        try {
          const meta = JSON.parse(readFileSync(jsonPath, 'utf-8')) as BackupMetadata;
          expectedChecksum = meta.checksum;
          formatVersion = meta.formatVersion;
        } catch {
          return { checksumMatch: false, error: 'Backup metadata could not be read.', sqliteIntegrityPassed: false, valid: false };
        }
      }
    }

    const declaredVersion = formatVersion === undefined ? 1 : formatVersion;
    if (typeof declaredVersion !== 'number' || !Number.isInteger(declaredVersion) || declaredVersion !== BACKUP_FORMAT_VERSION) {
      const label = typeof declaredVersion === 'number' || typeof declaredVersion === 'string' ? String(declaredVersion) : 'invalid';
      return { checksumMatch: false, error: `Unsupported backup format version: ${label}.`, sqliteIntegrityPassed: false, valid: false };
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

      if (schemaVersion !== undefined && schemaVersion > (migrations.at(-1)?.id ?? 0)) {
        return { checksumMatch: true, error: 'Backup schema is newer than this Max version.', schemaVersion, sqliteIntegrityPassed: true, valid: false };
      }

      return {
        checksumMatch: true,
        formatVersion: declaredVersion,
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

    if (existsSync(`${this.#dbPath}-wal`) && statSync(`${this.#dbPath}-wal`).size > 0) {
      return { error: 'Close the active database before restoring.', restored: false, safetyRollbackOccurred: false };
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

    // 4. Stage and verify beside the database so replacement is a single
    // filesystem rename. The caller must close its SQLite connection first.
    const stagedPath = join(dirname(this.#dbPath), `.max-restore-${randomUUID()}.sqlite`);
    let replaced = false;
    try {
      copyFileSync(targetPath, stagedPath);
      const stagedVerification = this.verifyBackup(stagedPath);
      if (!stagedVerification.valid) throw new Error(stagedVerification.error ?? 'Staged backup failed verification.');
      renameSync(stagedPath, this.#dbPath);
      replaced = true;

      const check = new DatabaseSync(this.#dbPath, { readOnly: true });
      let integrity: string | undefined;
      try { integrity = (check.prepare('PRAGMA integrity_check').get() as { integrity_check?: string } | undefined)?.integrity_check; }
      finally { check.close(); }
      if (integrity !== 'ok') throw new Error('Restored database failed integrity verification.');
      try {
        const statusPath = join(this.#backupDir, 'restore-status.state');
        const temporaryPath = `${statusPath}.tmp`;
        writeFileSync(temporaryPath, JSON.stringify({ safetyPath: safetyBackup.filePath }), 'utf8');
        renameSync(temporaryPath, statusPath);
      } catch { /* Optional status cannot invalidate a completed restore. */ }

      return {
        preRestoreBackupId: safetyBackup.id,
        restored: true,
        safetyRollbackOccurred: false,
      };
    } catch (restoreErr) {
      let rolledBack = false;
      if (replaced) {
        const rollbackPath = join(dirname(this.#dbPath), `.max-rollback-${randomUUID()}.sqlite`);
        try {
          copyFileSync(safetyBackup.filePath, rollbackPath);
          renameSync(rollbackPath, this.#dbPath);
          rolledBack = true;
        } catch {
          // The verified protective backup remains available for manual recovery.
        } finally {
          try { if (existsSync(rollbackPath)) unlinkSync(rollbackPath); } catch { /* Preserve the result. */ }
        }
      }
      return {
        error: `${rolledBack ? 'Restore failed and was rolled back' : 'Restore failed; the protective backup remains available'}: ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`,
        preRestoreBackupId: safetyBackup.id,
        restored: false,
        safetyRollbackOccurred: rolledBack,
      };
    } finally {
      try { if (existsSync(stagedPath)) unlinkSync(stagedPath); } catch { /* Preserve the result. */ }
    }
  }

  importDownloadedBackup(input: Readonly<{
    bytes: Uint8Array;
    checksum: string;
    createdAt: string;
    id: string;
    trigger: BackupTrigger;
  }>): BackupMetadata {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.id)) {
      throw new ObjectDomainError('invalid-input', 'Invalid cloud backup identifier.');
    }
    const actualChecksum = createHash('sha256').update(input.bytes).digest('hex');
    if (!input.checksum || actualChecksum !== input.checksum) {
      throw new ObjectDomainError('invalid-input', 'Downloaded cloud backup failed checksum verification.');
    }

    const filename = `max-cloud-${input.id}.maxbak`;
    const filePath = join(this.#backupDir, filename);
    const temporaryPath = `${filePath}.download`;
    writeFileSync(temporaryPath, input.bytes);
    renameSync(temporaryPath, filePath);

    const provisional: BackupMetadata = {
      checksum: actualChecksum,
      createdAt: input.createdAt,
      filePath,
      filename,
      formatVersion: BACKUP_FORMAT_VERSION,
      id: input.id,
      schemaVersion: 0,
      sizeBytes: input.bytes.byteLength,
      trigger: input.trigger,
    };
    writeFileSync(`${filePath}.json`, JSON.stringify(provisional, null, 2), 'utf-8');
    const verification = this.verifyBackup(filePath);
    if (!verification.valid) {
      unlinkSync(filePath);
      unlinkSync(`${filePath}.json`);
      throw new ObjectDomainError('invalid-input', `Downloaded cloud backup is invalid: ${verification.error ?? 'SQLite integrity check failed.'}`);
    }
    const metadata = { ...provisional, schemaVersion: verification.schemaVersion ?? 1 };
    writeFileSync(`${filePath}.json`, JSON.stringify(metadata, null, 2), 'utf-8');
    this.#pruneOldBackups();
    return metadata;
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
