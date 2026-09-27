import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import { BackupService } from './backup-service';
import { DatabaseService } from './database-service';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('BackupService', () => {
  it('keeps an optional scheduled failure status and clears it after recovery', () => {
    const dir = mkdtempSync(join(tmpdir(), 'max-backup-status-'));
    temporaryDirectories.push(dir);
    const service = new BackupService(':memory:', join(dir, 'backups'));
    expect(service.getStatus()).toMatchObject({ currentSchemaVersion: 19 });
    service.recordScheduledFailure();
    expect(service.getStatus().lastScheduledFailureAt).toBeDefined();
    service.clearScheduledFailure();
    expect(service.getStatus().lastScheduledFailureAt).toBeUndefined();
  });

  it('refuses a backup made with a newer database schema before replacing live data', () => {
    const dir = mkdtempSync(join(tmpdir(), 'max-backup-future-'));
    temporaryDirectories.push(dir);
    const dbPath = join(dir, 'max.sqlite');
    const db = new DatabaseService(dbPath); db.initialize(); db.close();
    const service = new BackupService(dbPath, join(dir, 'backups'));
    const backup = service.createBackup('manual');
    const futurePath = join(dir, 'future.maxbak');
    copyFileSync(backup.filePath, futurePath);
    const future = new DatabaseSync(futurePath);
    future.prepare("INSERT INTO system_migrations (id, name, applied_at) VALUES (999, 'future', ?)").run(new Date().toISOString());
    future.close();
    expect(service.verifyBackup(futurePath)).toMatchObject({ valid: false, schemaVersion: 999, sqliteIntegrityPassed: true });
    expect(service.restoreBackup(futurePath)).toMatchObject({ restored: false, safetyRollbackOccurred: false });
    expect(service.verifyBackup(backup.filePath).valid).toBe(true);
  });
  it('creates timestamped SQLite snapshots with SHA-256 checksum and correct schema version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'max-backup-test-'));
    temporaryDirectories.push(dir);
    const dbPath = join(dir, 'max.sqlite');
    const backupDir = join(dir, 'backups');

    const db = new DatabaseService(dbPath);
    db.initialize();
    db.objects.createRecord({ label: 'Backup Test Item', objectKind: 'item', values: {} });
    db.close();

    const service = new BackupService(dbPath, backupDir);
    const backup = service.createBackup('manual');

    expect(backup.id).toBeDefined();
    expect(backup.trigger).toBe('manual');
    expect(backup.checksum).toHaveLength(64); // SHA-256 hex
    expect(backup.schemaVersion).toBe(19);
    expect(backup.sizeBytes).toBeGreaterThan(0);

    const list = service.listBackups();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(backup.id);
  });

  it('verifies integrity of healthy backups and rejects tampered files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'max-backup-test-'));
    temporaryDirectories.push(dir);
    const dbPath = join(dir, 'max.sqlite');
    const backupDir = join(dir, 'backups');

    const db = new DatabaseService(dbPath);
    db.initialize();
    db.close();

    const service = new BackupService(dbPath, backupDir);
    const backup = service.createBackup('daily');

    // 1. Healthy verification
    const healthyCheck = service.verifyBackup(backup.id);
    expect(healthyCheck.valid).toBe(true);
    expect(healthyCheck.checksumMatch).toBe(true);
    expect(healthyCheck.sqliteIntegrityPassed).toBe(true);
    expect(healthyCheck.schemaVersion).toBe(19);

    // 2. Tampered file verification
    writeFileSync(backup.filePath, 'TAMPERED_RANDOM_CORRUPT_BYTES', 'utf-8');
    const corruptCheck = service.verifyBackup(backup.id);
    expect(corruptCheck.valid).toBe(false);
    expect(corruptCheck.checksumMatch).toBe(false);
  });

  it('performs safe restore drills with automatic pre-restore safety snapshot', () => {
    const dir = mkdtempSync(join(tmpdir(), 'max-backup-test-'));
    temporaryDirectories.push(dir);
    const dbPath = join(dir, 'max.sqlite');
    const backupDir = join(dir, 'backups');

    // State 1: 1 item
    const db1 = new DatabaseService(dbPath);
    db1.initialize();
    db1.objects.createRecord({ label: 'Original Item 1', objectKind: 'item', values: {} });
    db1.close();

    const service = new BackupService(dbPath, backupDir);
    const backupState1 = service.createBackup('manual');

    // State 2: 2 items
    const db2 = new DatabaseService(dbPath);
    db2.initialize();
    db2.objects.createRecord({ label: 'Item 2 Added Later', objectKind: 'item', values: {} });
    expect(db2.objects.listRecords('item')).toHaveLength(2);
    db2.close();

    // Restore to State 1
    const restoreResult = service.restoreBackup(backupState1.id);
    expect(restoreResult.restored).toBe(true);
    expect(restoreResult.preRestoreBackupId).toBeDefined();
    expect(restoreResult.safetyRollbackOccurred).toBe(false);

    // Verify State 1 is restored
    const dbRestored = new DatabaseService(dbPath);
    dbRestored.initialize();
    const restoredItems = dbRestored.objects.listRecords('item');
    expect(restoredItems).toHaveLength(1);
    expect(restoredItems[0]?.label).toBe('Original Item 1');
    dbRestored.close();

    // Verify pre-restore snapshot was recorded
    const allBackups = service.listBackups();
    const preRestore = allBackups.find((b) => b.trigger === 'pre-restore');
    expect(preRestore).toBeDefined();
  });
});
