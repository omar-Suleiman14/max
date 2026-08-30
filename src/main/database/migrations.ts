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
  {
    id: 4,
    name: 'accounts_and_transactions',
    up(database) {
      database.exec(`
        CREATE TABLE shop_accounts (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
          account_type TEXT NOT NULL CHECK (account_type IN ('cash', 'bank', 'wallet', 'other')),
          initial_balance REAL NOT NULL DEFAULT 0.0 CHECK (initial_balance >= 0),
          position INTEGER NOT NULL CHECK (position >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;

        CREATE UNIQUE INDEX shop_accounts_active_name
          ON shop_accounts (name COLLATE NOCASE)
          WHERE archived_at IS NULL;

        CREATE TABLE shop_transactions (
          id TEXT PRIMARY KEY NOT NULL,
          transaction_type TEXT NOT NULL CHECK (transaction_type IN ('sale', 'purchase', 'expense', 'transfer', 'income', 'adjustment', 'reversal')),
          total_amount REAL NOT NULL CHECK (total_amount >= 0),
          paid_amount REAL NOT NULL CHECK (paid_amount >= 0),
          payment_status TEXT NOT NULL CHECK (payment_status IN ('paid', 'partial', 'unpaid')),
          person_id TEXT REFERENCES object_records(id) ON DELETE RESTRICT,
          item_id TEXT REFERENCES object_records(id) ON DELETE RESTRICT,
          note TEXT,
          reversal_of_id TEXT REFERENCES shop_transactions(id) ON DELETE RESTRICT,
          reversed_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;

        CREATE INDEX shop_transactions_created_at
          ON shop_transactions (created_at DESC);

        CREATE INDEX shop_transactions_reversal
          ON shop_transactions (reversal_of_id);

        CREATE TABLE shop_money_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id TEXT NOT NULL REFERENCES shop_transactions(id) ON DELETE RESTRICT,
          account_id TEXT NOT NULL REFERENCES shop_accounts(id) ON DELETE RESTRICT,
          movement_type TEXT NOT NULL CHECK (movement_type IN ('inflow', 'outflow')),
          amount REAL NOT NULL CHECK (amount > 0),
          created_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;

        CREATE INDEX shop_money_movements_tx
          ON shop_money_movements (transaction_id);

        CREATE INDEX shop_money_movements_account
          ON shop_money_movements (account_id);

        CREATE TABLE object_audit_log_v4 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL CHECK (entity_type IN ('property', 'record', 'template', 'account', 'transaction')),
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'archived')),
          actor TEXT NOT NULL CHECK (actor = 'local-user'),
          snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
          created_at TEXT NOT NULL
        ) STRICT;

        INSERT INTO object_audit_log_v4 (id, entity_type, entity_id, action, actor, snapshot_json, created_at)
          SELECT id, entity_type, entity_id, action, actor, snapshot_json, created_at FROM object_audit_log;

        DROP TABLE object_audit_log;

        ALTER TABLE object_audit_log_v4 RENAME TO object_audit_log;

        CREATE INDEX object_audit_log_entity
          ON object_audit_log (entity_id, id DESC);
      `);
    },
  },
  {
    id: 5,
    name: 'views_pages_and_search',
    up(database) {
      database.exec(`
        CREATE TABLE shop_saved_views (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
          target_kind TEXT NOT NULL CHECK (target_kind IN ('item', 'person', 'transaction', 'account')),
          filter_json TEXT NOT NULL CHECK (json_valid(filter_json)),
          sort_json TEXT NOT NULL CHECK (json_valid(sort_json)),
          group_by_property_id TEXT,
          position INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;

        CREATE INDEX shop_saved_views_kind
          ON shop_saved_views (target_kind, position);

        CREATE TABLE shop_custom_pages (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
          icon TEXT,
          layout_json TEXT NOT NULL CHECK (json_valid(layout_json)),
          position INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;

        CREATE INDEX shop_custom_pages_position
          ON shop_custom_pages (position);

        CREATE TABLE object_audit_log_v5 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL CHECK (entity_type IN ('property', 'record', 'template', 'account', 'transaction', 'view', 'page')),
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'archived')),
          actor TEXT NOT NULL CHECK (actor = 'local-user'),
          snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
          created_at TEXT NOT NULL
        ) STRICT;

        INSERT INTO object_audit_log_v5 (id, entity_type, entity_id, action, actor, snapshot_json, created_at)
          SELECT id, entity_type, entity_id, action, actor, snapshot_json, created_at FROM object_audit_log;

        DROP TABLE object_audit_log;

        ALTER TABLE object_audit_log_v5 RENAME TO object_audit_log;

        CREATE INDEX object_audit_log_entity
          ON object_audit_log (entity_id, id DESC);
      `);
    },
  },
  {
    id: 6,
    name: 'daily_reconciliation',
    up(database) {
      database.exec(`
        CREATE TABLE shop_daily_sessions (
          id TEXT PRIMARY KEY NOT NULL,
          account_id TEXT NOT NULL REFERENCES shop_accounts(id) ON DELETE RESTRICT,
          status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
          opening_balance REAL NOT NULL CHECK (opening_balance >= 0),
          opened_at TEXT NOT NULL,
          closed_at TEXT,
          expected_closing_balance REAL,
          actual_closing_balance REAL,
          discrepancy REAL,
          discrepancy_note TEXT,
          total_sales REAL NOT NULL DEFAULT 0.0,
          total_expenses REAL NOT NULL DEFAULT 0.0,
          total_inflows REAL NOT NULL DEFAULT 0.0,
          total_outflows REAL NOT NULL DEFAULT 0.0,
          reconciliation_transaction_id TEXT REFERENCES shop_transactions(id) ON DELETE RESTRICT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;

        CREATE INDEX shop_daily_sessions_account
          ON shop_daily_sessions (account_id, status);

        CREATE TABLE object_audit_log_v6 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL CHECK (entity_type IN ('property', 'record', 'template', 'account', 'transaction', 'view', 'page', 'daily_session')),
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'archived')),
          actor TEXT NOT NULL CHECK (actor = 'local-user'),
          snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
          created_at TEXT NOT NULL
        ) STRICT;

        INSERT INTO object_audit_log_v6 (id, entity_type, entity_id, action, actor, snapshot_json, created_at)
          SELECT id, entity_type, entity_id, action, actor, snapshot_json, created_at FROM object_audit_log;

        DROP TABLE object_audit_log;

        ALTER TABLE object_audit_log_v6 RENAME TO object_audit_log;

        CREATE INDEX object_audit_log_entity
          ON object_audit_log (entity_id, id DESC);
      `);
    },
  },
  {
    id: 7,
    name: 'record_template_origin',
    up(database) {
      database.exec(`
        ALTER TABLE object_records
          ADD COLUMN template_id TEXT REFERENCES shop_templates(id) ON DELETE SET NULL;

        CREATE INDEX object_records_template
          ON object_records (template_id);
      `);
    },
  },
  {
    id: 8,
    name: 'persistent_incremental_search_index',
    up(database) {
      database.exec(`
        CREATE VIRTUAL TABLE search_index USING fts5(
          entity_id UNINDEXED,
          kind UNINDEXED,
          display_title UNINDEXED,
          display_subtitle UNINDEXED,
          display_metadata UNINDEXED,
          search_text,
          tokenize = 'unicode61 remove_diacritics 2'
        );

        CREATE TRIGGER search_records_insert AFTER INSERT ON object_records BEGIN
          INSERT INTO search_index (entity_id, kind, display_title, display_subtitle, display_metadata, search_text)
          SELECT NEW.id, NEW.object_kind, NEW.label,
            CASE NEW.object_kind WHEN 'person' THEN 'Customer · ' ELSE 'Product · ' END || NEW.label,
            CASE NEW.object_kind WHEN 'person' THEN 'Customer / Person' ELSE 'Catalog Item' END,
            max_search_normalize(NEW.id || ' ' || NEW.label || ' ' || COALESCE((
              SELECT GROUP_CONCAT(value_json, ' ') FROM object_property_values
              WHERE record_id = NEW.id AND active = 1
            ), ''))
          WHERE NEW.archived_at IS NULL;
        END;

        CREATE TRIGGER search_records_update AFTER UPDATE ON object_records BEGIN
          DELETE FROM search_index WHERE entity_id = OLD.id AND kind = OLD.object_kind;
          INSERT INTO search_index (entity_id, kind, display_title, display_subtitle, display_metadata, search_text)
          SELECT NEW.id, NEW.object_kind, NEW.label,
            CASE NEW.object_kind WHEN 'person' THEN 'Customer · ' ELSE 'Product · ' END || NEW.label,
            CASE NEW.object_kind WHEN 'person' THEN 'Customer / Person' ELSE 'Catalog Item' END,
            max_search_normalize(NEW.id || ' ' || NEW.label || ' ' || COALESCE((
              SELECT GROUP_CONCAT(value_json, ' ') FROM object_property_values
              WHERE record_id = NEW.id AND active = 1
            ), ''))
          WHERE NEW.archived_at IS NULL;
        END;

        CREATE TRIGGER search_records_delete AFTER DELETE ON object_records BEGIN
          DELETE FROM search_index WHERE entity_id = OLD.id AND kind = OLD.object_kind;
        END;

        CREATE TRIGGER search_values_insert AFTER INSERT ON object_property_values BEGIN
          DELETE FROM search_index WHERE entity_id = NEW.record_id AND kind IN ('item', 'person');
          INSERT INTO search_index (entity_id, kind, display_title, display_subtitle, display_metadata, search_text)
          SELECT r.id, r.object_kind, r.label,
            CASE r.object_kind WHEN 'person' THEN 'Customer · ' ELSE 'Product · ' END || r.label,
            CASE r.object_kind WHEN 'person' THEN 'Customer / Person' ELSE 'Catalog Item' END,
            max_search_normalize(r.id || ' ' || r.label || ' ' || COALESCE((
              SELECT GROUP_CONCAT(value_json, ' ') FROM object_property_values
              WHERE record_id = r.id AND active = 1
            ), ''))
          FROM object_records r WHERE r.id = NEW.record_id AND r.archived_at IS NULL;
        END;

        CREATE TRIGGER search_values_update AFTER UPDATE ON object_property_values BEGIN
          DELETE FROM search_index WHERE entity_id = NEW.record_id AND kind IN ('item', 'person');
          INSERT INTO search_index (entity_id, kind, display_title, display_subtitle, display_metadata, search_text)
          SELECT r.id, r.object_kind, r.label,
            CASE r.object_kind WHEN 'person' THEN 'Customer · ' ELSE 'Product · ' END || r.label,
            CASE r.object_kind WHEN 'person' THEN 'Customer / Person' ELSE 'Catalog Item' END,
            max_search_normalize(r.id || ' ' || r.label || ' ' || COALESCE((
              SELECT GROUP_CONCAT(value_json, ' ') FROM object_property_values
              WHERE record_id = r.id AND active = 1
            ), ''))
          FROM object_records r WHERE r.id = NEW.record_id AND r.archived_at IS NULL;
        END;

        CREATE TRIGGER search_values_delete AFTER DELETE ON object_property_values BEGIN
          DELETE FROM search_index WHERE entity_id = OLD.record_id AND kind IN ('item', 'person');
          INSERT INTO search_index (entity_id, kind, display_title, display_subtitle, display_metadata, search_text)
          SELECT r.id, r.object_kind, r.label,
            CASE r.object_kind WHEN 'person' THEN 'Customer · ' ELSE 'Product · ' END || r.label,
            CASE r.object_kind WHEN 'person' THEN 'Customer / Person' ELSE 'Catalog Item' END,
            max_search_normalize(r.id || ' ' || r.label || ' ' || COALESCE((
              SELECT GROUP_CONCAT(value_json, ' ') FROM object_property_values
              WHERE record_id = r.id AND active = 1
            ), ''))
          FROM object_records r WHERE r.id = OLD.record_id AND r.archived_at IS NULL;
        END;

        CREATE TRIGGER search_accounts_insert AFTER INSERT ON shop_accounts BEGIN
          INSERT INTO search_index VALUES (
            NEW.id, 'account', NEW.name, upper(NEW.account_type) || ' account',
            'Account · ' || NEW.account_type,
            max_search_normalize(NEW.id || ' ' || NEW.name || ' ' || NEW.account_type)
          );
        END;

        CREATE TRIGGER search_accounts_update AFTER UPDATE ON shop_accounts BEGIN
          DELETE FROM search_index WHERE entity_id = OLD.id AND kind = 'account';
          INSERT INTO search_index
          SELECT NEW.id, 'account', NEW.name, upper(NEW.account_type) || ' account',
            'Account · ' || NEW.account_type,
            max_search_normalize(NEW.id || ' ' || NEW.name || ' ' || NEW.account_type)
          WHERE NEW.archived_at IS NULL;
        END;

        CREATE TRIGGER search_accounts_delete AFTER DELETE ON shop_accounts BEGIN
          DELETE FROM search_index WHERE entity_id = OLD.id AND kind = 'account';
        END;

        CREATE TRIGGER search_transactions_insert AFTER INSERT ON shop_transactions BEGIN
          INSERT INTO search_index VALUES (
            NEW.id, 'transaction', COALESCE(NEW.note, 'Transaction #' || substr(NEW.id, 1, 8)),
            upper(NEW.transaction_type) || ' · ' || printf('%.2f', NEW.total_amount) || ' (' || NEW.payment_status || ')',
            'Transaction · ' || NEW.payment_status,
            max_search_normalize(NEW.id || ' ' || NEW.transaction_type || ' ' || NEW.payment_status || ' ' ||
              printf('%.2f', NEW.total_amount) || ' ' || COALESCE(NEW.note, ''))
          );
        END;

        CREATE TRIGGER search_transactions_update AFTER UPDATE ON shop_transactions BEGIN
          DELETE FROM search_index WHERE entity_id = OLD.id AND kind = 'transaction';
          INSERT INTO search_index
          SELECT NEW.id, 'transaction', COALESCE(NEW.note, 'Transaction #' || substr(NEW.id, 1, 8)),
            upper(NEW.transaction_type) || ' · ' || printf('%.2f', NEW.total_amount) || ' (' || NEW.payment_status || ')',
            'Transaction · ' || NEW.payment_status,
            max_search_normalize(NEW.id || ' ' || NEW.transaction_type || ' ' || NEW.payment_status || ' ' ||
              printf('%.2f', NEW.total_amount) || ' ' || COALESCE(NEW.note, ''))
          WHERE NEW.archived_at IS NULL;
        END;

        CREATE TRIGGER search_transactions_delete AFTER DELETE ON shop_transactions BEGIN
          DELETE FROM search_index WHERE entity_id = OLD.id AND kind = 'transaction';
        END;

        CREATE TRIGGER search_views_insert AFTER INSERT ON shop_saved_views BEGIN
          INSERT INTO search_index VALUES (
            NEW.id, 'view', NEW.name, 'Saved View for ' || NEW.target_kind,
            'Saved View · ' || NEW.target_kind,
            max_search_normalize(NEW.id || ' ' || NEW.name || ' ' || NEW.target_kind)
          );
        END;

        CREATE TRIGGER search_views_update AFTER UPDATE ON shop_saved_views BEGIN
          DELETE FROM search_index WHERE entity_id = OLD.id AND kind = 'view';
          INSERT INTO search_index
          SELECT NEW.id, 'view', NEW.name, 'Saved View for ' || NEW.target_kind,
            'Saved View · ' || NEW.target_kind,
            max_search_normalize(NEW.id || ' ' || NEW.name || ' ' || NEW.target_kind)
          WHERE NEW.archived_at IS NULL;
        END;

        CREATE TRIGGER search_views_delete AFTER DELETE ON shop_saved_views BEGIN
          DELETE FROM search_index WHERE entity_id = OLD.id AND kind = 'view';
        END;

        CREATE TRIGGER search_pages_insert AFTER INSERT ON shop_custom_pages BEGIN
          INSERT INTO search_index VALUES (
            NEW.id, 'page', NEW.name, 'Dashboard / Page', 'Custom Page',
            max_search_normalize(NEW.id || ' ' || NEW.name)
          );
        END;

        CREATE TRIGGER search_pages_update AFTER UPDATE ON shop_custom_pages BEGIN
          DELETE FROM search_index WHERE entity_id = OLD.id AND kind = 'page';
          INSERT INTO search_index
          SELECT NEW.id, 'page', NEW.name, 'Dashboard / Page', 'Custom Page',
            max_search_normalize(NEW.id || ' ' || NEW.name)
          WHERE NEW.archived_at IS NULL;
        END;

        CREATE TRIGGER search_pages_delete AFTER DELETE ON shop_custom_pages BEGIN
          DELETE FROM search_index WHERE entity_id = OLD.id AND kind = 'page';
        END;

        INSERT INTO search_index
        SELECT r.id, r.object_kind, r.label,
          CASE r.object_kind WHEN 'person' THEN 'Customer · ' ELSE 'Product · ' END || r.label,
          CASE r.object_kind WHEN 'person' THEN 'Customer / Person' ELSE 'Catalog Item' END,
          max_search_normalize(r.id || ' ' || r.label || ' ' || COALESCE((
            SELECT GROUP_CONCAT(value_json, ' ') FROM object_property_values
            WHERE record_id = r.id AND active = 1
          ), ''))
        FROM object_records r WHERE r.archived_at IS NULL;

        INSERT INTO search_index
        SELECT id, 'account', name, upper(account_type) || ' account', 'Account · ' || account_type,
          max_search_normalize(id || ' ' || name || ' ' || account_type)
        FROM shop_accounts WHERE archived_at IS NULL;

        INSERT INTO search_index
        SELECT id, 'transaction', COALESCE(note, 'Transaction #' || substr(id, 1, 8)),
          upper(transaction_type) || ' · ' || printf('%.2f', total_amount) || ' (' || payment_status || ')',
          'Transaction · ' || payment_status,
          max_search_normalize(id || ' ' || transaction_type || ' ' || payment_status || ' ' ||
            printf('%.2f', total_amount) || ' ' || COALESCE(note, ''))
        FROM shop_transactions WHERE archived_at IS NULL;

        INSERT INTO search_index
        SELECT id, 'view', name, 'Saved View for ' || target_kind, 'Saved View · ' || target_kind,
          max_search_normalize(id || ' ' || name || ' ' || target_kind)
        FROM shop_saved_views WHERE archived_at IS NULL;

        INSERT INTO search_index
        SELECT id, 'page', name, 'Dashboard / Page', 'Custom Page', max_search_normalize(id || ' ' || name)
        FROM shop_custom_pages WHERE archived_at IS NULL;
      `);
    },
  },
  {
    id: 9,
    name: 'persistent_record_order',
    up(database) {
      database.exec(`
        ALTER TABLE object_records ADD COLUMN position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0);
        WITH ranked AS (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY object_kind ORDER BY label COLLATE NOCASE, id) - 1 AS next_position
          FROM object_records
        )
        UPDATE object_records
        SET position = (SELECT next_position FROM ranked WHERE ranked.id = object_records.id);
        CREATE INDEX object_records_kind_position
          ON object_records (object_kind, position, id)
          WHERE archived_at IS NULL;
      `);
    },
  },
];
