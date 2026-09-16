import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';
import { migrations } from './migrations';
import { normalizeSearchText } from './search-service';

/**
 * Every migration still in `migrations.ts` is there because some database on
 * somebody's machine has not run it yet. Deleting retail-era code is only safe
 * if the chain that upgrades those databases still works from every point it
 * could have stopped at, so this walks the whole chain: stop at each version in
 * turn, then open the workspace with the current build and check it catches up
 * and is usable afterwards.
 */

const directories: string[] = [];
afterEach(() => {
  // Windows keeps a handle on a database file briefly after close, so a
  // temporary directory that will not go yet must not fail the test.
  for (const directory of directories.splice(0)) {
    try { rmSync(directory, { force: true, recursive: true }); } catch { /* left for the operating system */ }
  }
});

/** A database left exactly as a Max build that only knew migrations 1..`upTo` would have left it. */
function databaseAtVersion(upTo: number): string {
  const directory = mkdtempSync(join(tmpdir(), 'max-migration-chain-'));
  directories.push(directory);
  const path = join(directory, 'max.sqlite');

  const database = new DatabaseSync(path);
  // The search triggers migration 8 installs call this, and the real service
  // registers it before it runs any migration. A harness that skipped it would
  // be testing its own omission rather than the migration.
  database.function('max_search_normalize', { deterministic: true }, (value: unknown) =>
    normalizeSearchText(typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'bigint' ? value.toString() : ''));
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec(`
    CREATE TABLE IF NOT EXISTS system_migrations (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);
  for (const migration of migrations.filter(({ id }) => id <= upTo)) {
    migration.up(database);
    database
      .prepare('INSERT INTO system_migrations (id, name, applied_at) VALUES (?, ?, ?)')
      .run(migration.id, migration.name, new Date().toISOString());
  }
  database.close();

  return path;
}

const latestVersion = Math.max(...migrations.map(({ id }) => id));
const everyVersion = migrations.map(({ id }) => id);

describe('upgrading a workspace left at an older schema version', () => {
  it('has a contiguous plan, so every intermediate version is reachable', () => {
    expect(everyVersion).toEqual(migrations.map((_, index) => index + 1));
  });

  it.each(everyVersion)('catches a database stopped at version %i up to the current schema', (version) => {
    const path = databaseAtVersion(version);

    const service = new DatabaseService(path);
    service.initialize();

    try {
      const health = service.getHealth();
      expect(health.status).toBe('ready');
      expect(health.schemaVersion).toBe(latestVersion);
      expect(health.migrationCount).toBe(migrations.length);

      // Upgraded is not the same as usable. Prove the workspace still works by
      // writing through it after the catch-up rather than trusting the counter.
      const database = service.databases.createDatabase({ title: 'After upgrade' });
      const record = service.records.createRecord({ databaseId: database.id, properties: {}, title: 'A record' });
      expect(service.databaseQuery.query({ databaseId: database.id }).records.map(({ id }) => id)).toEqual([record.id]);
    } finally {
      service.close();
    }
  });

  it('reopens an already-current workspace without applying anything again', () => {
    const path = databaseAtVersion(latestVersion);

    const first = new DatabaseService(path);
    first.initialize();
    const created = first.databases.createDatabase({ title: 'Kept' });
    first.close();

    const second = new DatabaseService(path);
    second.initialize();
    try {
      expect(second.getHealth().migrationCount).toBe(migrations.length);
      expect(second.databases.getDatabase(created.id)?.title).toBe('Kept');
    } finally {
      second.close();
    }
  });
// Every case here builds a database on disk and replays the migration chain
// against it. That is comfortably inside a second on a developer machine and
// has run past vitest's five second default on the Windows CI runner, which is
// slower at creating and fsyncing files.
}, 30_000);
