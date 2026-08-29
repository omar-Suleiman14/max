import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';
import type { ObjectKind, PropertyDraft, PropertyType } from '../../shared/object-contract';

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
      migrationCount: 5,
      schemaVersion: 5,
      status: 'ready',
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
    expect(second.getHealth().migrationCount).toBe(5);
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
      .run(6, 'future_schema', new Date().toISOString());
    future.close();

    const reopened = new DatabaseService(filename);
    expect(() => reopened.initialize()).toThrow('Database schema 6 is newer than this Max build.');
    reopened.close();
  });

  it('migrates a Sprint 0 database without losing its existing metadata', () => {
    const directory = mkdtempSync(join(tmpdir(), 'max-database-'));
    temporaryDirectories.push(directory);
    const filename = join(directory, 'max.sqlite');
    const legacy = new DatabaseSync(filename);
    legacy.exec(`
      CREATE TABLE system_migrations (
        id INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE app_metadata (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `);
    legacy.prepare('INSERT INTO system_migrations VALUES (?, ?, ?)').run(1, 'foundation_metadata', new Date().toISOString());
    legacy.prepare('INSERT INTO app_metadata VALUES (?, ?, ?)').run('shop-name', 'Existing shop', new Date().toISOString());
    legacy.close();

    const upgraded = new DatabaseService(filename);
    upgraded.initialize();
    expect(upgraded.getHealth().schemaVersion).toBe(5);
    upgraded.close();

    const inspection = new DatabaseSync(filename, { readOnly: true });
    expect(inspection.prepare('SELECT value FROM app_metadata WHERE key = ?').get('shop-name')).toEqual({ value: 'Existing shop' });
    expect(inspection.prepare("SELECT name FROM sqlite_master WHERE name = 'object_records'").get()).toEqual({ name: 'object_records' });
    expect(inspection.prepare("SELECT name FROM sqlite_master WHERE name = 'shop_templates'").get()).toEqual({ name: 'shop_templates' });
    expect(inspection.prepare("SELECT name FROM sqlite_master WHERE name = 'shop_accounts'").get()).toEqual({ name: 'shop_accounts' });
    expect(inspection.prepare("SELECT name FROM sqlite_master WHERE name = 'shop_transactions'").get()).toEqual({ name: 'shop_transactions' });
    inspection.close();
  });
});

function property(name: string, type: PropertyType, objectKind: ObjectKind = 'item'): PropertyDraft {
  return {
    name,
    objectKind,
    rules: {
      choices: type === 'select' || type === 'status' ? ['One', 'Two'] : [],
      digitsOnly: false,
      relationTarget: type === 'relation' ? 'person' : undefined,
      required: false,
      unique: false,
    },
    type,
  };
}

describe('configurable object system', () => {
  it('supports every initial type, optional schema changes, audited CRUD, and relations', () => {
    const service = new DatabaseService(':memory:');
    service.initialize();
    const relatedPerson = service.objects.createRecord({ label: 'Related person', objectKind: 'person', values: {} });
    const definitions = [
      property('Text', 'text'),
      property('Number', 'number'),
      property('Money', 'money'),
      property('Date', 'date'),
      property('Checkbox', 'checkbox'),
      property('Select', 'select'),
      property('Status', 'status'),
      property('Relation', 'relation'),
    ].map((draft) => service.objects.createProperty(draft));
    const values = Object.fromEntries(definitions.map((definition) => {
      const byType = {
        checkbox: true,
        date: '2026-08-29',
        money: 99.5,
        number: 3,
        relation: relatedPerson.id,
        select: 'One',
        status: 'Two',
        text: 'Configured value',
      } as const;
      return [definition.id, byType[definition.type]];
    }));

    const created = service.objects.createRecord({ label: 'Configurable item', objectKind: 'item', values });
    const optional = service.objects.createProperty(property('Added later', 'text'));
    expect(service.objects.listRecords('item')[0]?.values[optional.id]).toBeUndefined();

    const updated = service.objects.updateRecord(created.id, {
      label: 'Updated item',
      objectKind: 'item',
      values: { ...values, [optional.id]: 'Now present' },
    });
    expect(updated.label).toBe('Updated item');
    expect(service.objects.listAudit(created.id).map(({ action }) => action)).toEqual(['updated', 'created']);

    service.objects.archiveRecord(created.id);
    expect(service.objects.listRecords('item')).toEqual([]);
    expect(service.objects.listAudit(created.id)[0]?.action).toBe('archived');
    service.close();
  });

  it('rejects validation, required-schema, and uniqueness conflicts atomically', () => {
    const service = new DatabaseService(':memory:');
    service.initialize();
    const optional = service.objects.createProperty(property('Optional note', 'text'));
    service.objects.createRecord({ label: 'First', objectKind: 'item', values: {} });
    expect(() => service.objects.updateProperty(optional.id, {
      ...property('Optional note', 'text'),
      rules: { ...property('Optional note', 'text').rules, required: true },
    })).toThrow('Optional note is required');

    const serial = service.objects.createProperty({
      ...property('Serial', 'text'),
      rules: {
        ...property('Serial', 'text').rules,
        digitsOnly: true,
        maximumLength: 4,
        minimumLength: 4,
        unique: true,
      },
    });
    expect(() => service.objects.createRecord({
      label: 'Invalid',
      objectKind: 'item',
      values: { [serial.id]: '12A4' },
    })).toThrow('use digits only');
    service.objects.createRecord({ label: 'Second', objectKind: 'item', values: { [serial.id]: '1234' } });
    expect(() => service.objects.createRecord({
      label: 'Duplicate',
      objectKind: 'item',
      values: { [serial.id]: '1234' },
    })).toThrow('Serial must be unique');
    expect(service.objects.listRecords('item').map(({ label }) => label)).toEqual(['First', 'Second']);
    service.close();
  });
});
