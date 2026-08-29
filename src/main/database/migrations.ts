import type { DatabaseSync } from 'node:sqlite';

export type Migration = Readonly<{
  id: number;
  name: string;
  up: (database: DatabaseSync) => void;
}>;

export const migrations: readonly Migration[] = [
  {
    id: 1,
    name: 'foundation_metadata',
    up(database) {
      database.exec(`
        CREATE TABLE app_metadata (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
      `);
    },
  },
  {
    id: 2,
    name: 'configurable_objects',
    up(database) {
      database.exec(`
        CREATE TABLE object_properties (
          id TEXT PRIMARY KEY NOT NULL,
          object_kind TEXT NOT NULL CHECK (object_kind IN ('item', 'person')),
          name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
          property_type TEXT NOT NULL CHECK (property_type IN ('text', 'number', 'money', 'date', 'checkbox', 'select', 'status', 'relation')),
          rules_json TEXT NOT NULL CHECK (json_valid(rules_json)),
          position INTEGER NOT NULL CHECK (position >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;

        CREATE UNIQUE INDEX object_properties_active_name
          ON object_properties (object_kind, name COLLATE NOCASE)
          WHERE archived_at IS NULL;

        CREATE TABLE object_records (
          id TEXT PRIMARY KEY NOT NULL,
          object_kind TEXT NOT NULL CHECK (object_kind IN ('item', 'person')),
          label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;

        CREATE INDEX object_records_active_kind_label
          ON object_records (object_kind, label COLLATE NOCASE)
          WHERE archived_at IS NULL;

        CREATE TABLE object_property_values (
          record_id TEXT NOT NULL REFERENCES object_records(id) ON DELETE RESTRICT,
          property_id TEXT NOT NULL REFERENCES object_properties(id) ON DELETE RESTRICT,
          value_json TEXT NOT NULL CHECK (json_valid(value_json)),
          normalized_value TEXT,
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          updated_at TEXT NOT NULL,
          PRIMARY KEY (record_id, property_id)
        ) STRICT;

        CREATE UNIQUE INDEX object_property_values_active_unique
          ON object_property_values (property_id, normalized_value)
          WHERE active = 1 AND normalized_value IS NOT NULL;

        CREATE TABLE object_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL CHECK (entity_type IN ('property', 'record')),
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'archived')),
          actor TEXT NOT NULL CHECK (actor = 'local-user'),
          snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
          created_at TEXT NOT NULL
        ) STRICT;

        CREATE INDEX object_audit_log_entity
          ON object_audit_log (entity_id, id DESC);
      `);
    },
  },
  {
    id: 3,
    name: 'templates_and_onboarding',
    up(database) {
      database.exec(`
        CREATE TABLE shop_templates (
          id TEXT PRIMARY KEY NOT NULL,
          object_kind TEXT NOT NULL CHECK (object_kind IN ('item', 'person')),
          name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
          field_order_json TEXT NOT NULL CHECK (json_valid(field_order_json)),
          defaults_json TEXT NOT NULL CHECK (json_valid(defaults_json)),
          progressive_json TEXT NOT NULL CHECK (json_valid(progressive_json)),
          position INTEGER NOT NULL CHECK (position >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;

        CREATE UNIQUE INDEX shop_templates_active_name
          ON shop_templates (object_kind, name COLLATE NOCASE)
          WHERE archived_at IS NULL;

        CREATE TABLE object_audit_log_v3 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL CHECK (entity_type IN ('property', 'record', 'template')),
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'archived')),
          actor TEXT NOT NULL CHECK (actor = 'local-user'),
          snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
          created_at TEXT NOT NULL
        ) STRICT;

        INSERT INTO object_audit_log_v3 (id, entity_type, entity_id, action, actor, snapshot_json, created_at)
          SELECT id, entity_type, entity_id, action, actor, snapshot_json, created_at FROM object_audit_log;

        DROP TABLE object_audit_log;

        ALTER TABLE object_audit_log_v3 RENAME TO object_audit_log;

        CREATE INDEX object_audit_log_entity
          ON object_audit_log (entity_id, id DESC);
      `);
    },
  },
];
