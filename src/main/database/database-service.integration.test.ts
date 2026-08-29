import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('DatabaseService', () => {
  it('creates the foundation schema and reports health', () => {
    const service = new DatabaseService(':memory:');

    service.initialize();

    expect(service.getHealth()).toEqual({
      status: 'ready',
      migrationCount: 1,
      schemaVersion: 1,
    });
    service.close();
  });

  it('persists migrations and remains idempotent across restarts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'max-database-'));
    temporaryDirectories.push(directory);
    const filename = join(directory, 'max.sqlite');

    const first = new DatabaseService(filename);
    first.initialize();
    first.initialize();
    first.close();

    const second = new DatabaseService(filename);
    second.initialize();
    expect(second.getHealth().migrationCount).toBe(1);
    second.close();

    const inspection = new DatabaseSync(filename, { readOnly: true });
    const metadataTable = inspection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_metadata'")
      .get();
    expect(metadataTable).toEqual({ name: 'app_metadata' });
    inspection.close();
  });

  it('refuses silently altered migration history', () => {
    const directory = mkdtempSync(join(tmpdir(), 'max-database-'));
    temporaryDirectories.push(directory);
    const filename = join(directory, 'max.sqlite');

    const initial = new DatabaseService(filename);
    initial.initialize();
    initial.close();

    const tampering = new DatabaseSync(filename);
    tampering.prepare('UPDATE system_migrations SET name = ? WHERE id = 1').run('altered');
    tampering.close();

    const reopened = new DatabaseService(filename);
    expect(() => reopened.initialize()).toThrow('Migration history mismatch at id 1.');
    reopened.close();
  });

  it('refuses a database created by a newer Max schema', () => {
    const directory = mkdtempSync(join(tmpdir(), 'max-database-'));
    temporaryDirectories.push(directory);
    const filename = join(directory, 'max.sqlite');

    const initial = new DatabaseService(filename);
    initial.initialize();
    initial.close();

    const future = new DatabaseSync(filename);
    future
      .prepare('INSERT INTO system_migrations (id, name, applied_at) VALUES (?, ?, ?)')
      .run(2, 'future_schema', new Date().toISOString());
    future.close();

    const reopened = new DatabaseService(filename);
    expect(() => reopened.initialize()).toThrow('Database schema 2 is newer than this Max build.');
    reopened.close();
  });
});
