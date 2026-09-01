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
  {
    id: 10,
    name: 'semantic_roles',
    up(database) {
      database.exec(`
        ALTER TABLE object_properties ADD COLUMN semantic_role TEXT
          CHECK (semantic_role IS NULL OR semantic_role IN ('DISPLAY_NAME', 'PRICE', 'QUANTITY'));

        CREATE UNIQUE INDEX object_properties_semantic_role_unique
          ON object_properties (object_kind, semantic_role)
          WHERE archived_at IS NULL AND semantic_role IS NOT NULL;
      `);
    },
  },
  {
    id: 11,
    name: 'inventory_and_quantity',
    up(database) {
      database.exec(`
        ALTER TABLE object_records ADD COLUMN current_quantity INTEGER;

        ALTER TABLE shop_transactions ADD COLUMN quantity INTEGER;
        ALTER TABLE shop_transactions ADD COLUMN provider_fee REAL NOT NULL DEFAULT 0.0;
        ALTER TABLE shop_transactions ADD COLUMN service_fee REAL NOT NULL DEFAULT 0.0;

        CREATE TABLE inventory_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id TEXT NOT NULL REFERENCES object_records(id) ON DELETE RESTRICT,
          operation_id TEXT REFERENCES shop_transactions(id) ON DELETE RESTRICT,
          quantity_delta INTEGER NOT NULL,
          reason TEXT NOT NULL CHECK (reason IN ('opening', 'sale', 'purchase', 'adjustment', 'damaged', 'refund', 'reversal')),
          created_at TEXT NOT NULL
        ) STRICT;

        CREATE INDEX inventory_movements_item ON inventory_movements (item_id, id DESC);
        CREATE INDEX inventory_movements_operation ON inventory_movements (operation_id);
      `);
    },
  },
  {
    id: 12,
    name: 'account_fee_config',
    up(database) {
      database.exec(`
        ALTER TABLE shop_accounts ADD COLUMN fee_config_json TEXT;
      `);
    },
  },
  {
    id: 13,
    name: 'pricing_engine_core',
    up(database) {
      database.exec(`
        CREATE TABLE pricing_profiles (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
          provider TEXT,
          channel TEXT,
          service TEXT,
          currency TEXT NOT NULL DEFAULT 'EGP' CHECK (currency = 'EGP'),
          input_mode TEXT NOT NULL CHECK (input_mode IN ('customer_pays', 'customer_receives')),
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          components_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;

        CREATE UNIQUE INDEX pricing_profiles_active_name
          ON pricing_profiles (name COLLATE NOCASE)
          WHERE archived_at IS NULL;
        CREATE INDEX pricing_profiles_service_provider
          ON pricing_profiles (service, provider, channel, active)
          WHERE archived_at IS NULL;

        CREATE TABLE object_audit_log_v13 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL CHECK (entity_type IN ('property', 'record', 'template', 'account', 'transaction', 'view', 'page', 'daily_session', 'pricing_profile')),
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'archived')),
          actor TEXT NOT NULL CHECK (actor = 'local-user'),
          snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
          created_at TEXT NOT NULL
        ) STRICT;

        INSERT INTO object_audit_log_v13 (id, entity_type, entity_id, action, actor, snapshot_json, created_at)
          SELECT id, entity_type, entity_id, action, actor, snapshot_json, created_at FROM object_audit_log;
        DROP TABLE object_audit_log;
        ALTER TABLE object_audit_log_v13 RENAME TO object_audit_log;
        CREATE INDEX object_audit_log_entity ON object_audit_log (entity_id, id DESC);

        ALTER TABLE shop_transactions ADD COLUMN principal_amount REAL NOT NULL DEFAULT 0.0;
        ALTER TABLE shop_transactions ADD COLUMN delivered_value REAL NOT NULL DEFAULT 0.0;
        ALTER TABLE shop_transactions ADD COLUMN provider_cost REAL NOT NULL DEFAULT 0.0;
        ALTER TABLE shop_transactions ADD COLUMN tax_amount REAL NOT NULL DEFAULT 0.0;
        ALTER TABLE shop_transactions ADD COLUMN customer_fee REAL NOT NULL DEFAULT 0.0;
        ALTER TABLE shop_transactions ADD COLUMN profit_markup REAL NOT NULL DEFAULT 0.0;
        ALTER TABLE shop_transactions ADD COLUMN provider_commission REAL NOT NULL DEFAULT 0.0;
        ALTER TABLE shop_transactions ADD COLUMN discount REAL NOT NULL DEFAULT 0.0;
        ALTER TABLE shop_transactions ADD COLUMN cashback REAL NOT NULL DEFAULT 0.0;
        ALTER TABLE shop_transactions ADD COLUMN customer_total REAL NOT NULL DEFAULT 0.0;
        ALTER TABLE shop_transactions ADD COLUMN shop_net_cost REAL NOT NULL DEFAULT 0.0;
        ALTER TABLE shop_transactions ADD COLUMN net_profit REAL NOT NULL DEFAULT 0.0;
        ALTER TABLE shop_transactions ADD COLUMN pricing_profile_id TEXT REFERENCES pricing_profiles(id) ON DELETE SET NULL;
        ALTER TABLE shop_transactions ADD COLUMN pricing_snapshot_json TEXT;
        ALTER TABLE shop_transactions ADD COLUMN pricing_overrides_json TEXT;

        UPDATE shop_transactions
        SET principal_amount = total_amount,
            delivered_value = total_amount,
            customer_total = total_amount;
      `);
    },
  },
  {
    id: 14,
    name: 'pricing_service_catalog',
    up(database) {
      database.exec(`
        CREATE TABLE pricing_providers (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;
        CREATE UNIQUE INDEX pricing_providers_active_name
          ON pricing_providers (name COLLATE NOCASE) WHERE archived_at IS NULL;

        CREATE TABLE pricing_channels (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
          provider_id TEXT REFERENCES pricing_providers(id) ON DELETE SET NULL,
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;
        CREATE UNIQUE INDEX pricing_channels_active_name_provider
          ON pricing_channels (name COLLATE NOCASE, COALESCE(provider_id, '')) WHERE archived_at IS NULL;

        CREATE TABLE pricing_services (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
          category TEXT NOT NULL CHECK (length(trim(category)) BETWEEN 1 AND 80),
          provider_id TEXT REFERENCES pricing_providers(id) ON DELETE SET NULL,
          channel_id TEXT REFERENCES pricing_channels(id) ON DELETE SET NULL,
          pricing_profile_id TEXT NOT NULL REFERENCES pricing_profiles(id) ON DELETE RESTRICT,
          operation_kind TEXT NOT NULL CHECK (operation_kind IN ('sale', 'purchase', 'expense', 'income', 'transfer')),
          input_label TEXT NOT NULL CHECK (length(trim(input_label)) BETWEEN 1 AND 120),
          input_modes_json TEXT NOT NULL CHECK (json_valid(input_modes_json)),
          default_input_mode TEXT NOT NULL CHECK (default_input_mode IN ('customer_pays', 'customer_receives')),
          payment_account_types_json TEXT NOT NULL CHECK (json_valid(payment_account_types_json)),
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;
        CREATE UNIQUE INDEX pricing_services_active_name
          ON pricing_services (name COLLATE NOCASE) WHERE archived_at IS NULL;
        CREATE INDEX pricing_services_operation
          ON pricing_services (operation_kind, active) WHERE archived_at IS NULL;

        ALTER TABLE shop_accounts ADD COLUMN provider_id TEXT REFERENCES pricing_providers(id) ON DELETE SET NULL;
        ALTER TABLE shop_transactions ADD COLUMN pricing_service_id TEXT REFERENCES pricing_services(id) ON DELETE SET NULL;
        CREATE INDEX shop_transactions_pricing_service_date
          ON shop_transactions (pricing_service_id, created_at) WHERE archived_at IS NULL;

        CREATE TABLE object_audit_log_v14 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL CHECK (entity_type IN ('property', 'record', 'template', 'account', 'transaction', 'view', 'page', 'daily_session', 'pricing_profile', 'pricing_provider', 'pricing_channel', 'pricing_service')),
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'archived')),
          actor TEXT NOT NULL CHECK (actor = 'local-user'),
          snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
          created_at TEXT NOT NULL
        ) STRICT;
        INSERT INTO object_audit_log_v14 (id, entity_type, entity_id, action, actor, snapshot_json, created_at)
          SELECT id, entity_type, entity_id, action, actor, snapshot_json, created_at FROM object_audit_log;
        DROP TABLE object_audit_log;
        ALTER TABLE object_audit_log_v14 RENAME TO object_audit_log;
        CREATE INDEX object_audit_log_entity ON object_audit_log (entity_id, id DESC);
      `);
    },
  },
  {
    id: 15,
    name: 'workspace_schema_core',
    up(database) {
      database.exec(`
        CREATE TABLE workspace_nodes (
          id TEXT PRIMARY KEY NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('page', 'database', 'record')),
          parent_node_id TEXT REFERENCES workspace_nodes(id) ON DELETE SET NULL,
          title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
          icon TEXT,
          content_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(content_json)),
          position_key TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;

        CREATE INDEX workspace_nodes_parent
          ON workspace_nodes (parent_node_id, position_key) WHERE archived_at IS NULL;
        CREATE INDEX workspace_nodes_kind_position
          ON workspace_nodes (kind, position_key) WHERE archived_at IS NULL;

        CREATE TABLE workspace_databases (
          id TEXT PRIMARY KEY NOT NULL REFERENCES workspace_nodes(id) ON DELETE CASCADE,
          default_view_id TEXT,
          visibility TEXT NOT NULL DEFAULT 'normal' CHECK (visibility IN ('normal', 'advanced')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE workspace_properties (
          id TEXT PRIMARY KEY NOT NULL,
          database_id TEXT NOT NULL REFERENCES workspace_databases(id) ON DELETE CASCADE,
          name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
          type TEXT NOT NULL CHECK (type IN (
            'title', 'text', 'number', 'money', 'select', 'multi_select', 'status',
            'checkbox', 'date', 'relation', 'rollup', 'formula', 'url', 'email',
            'phone', 'file', 'user', 'created_time', 'created_by', 'last_edited_time',
            'last_edited_by', 'auto_id', 'button'
          )),
          required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0, 1)),
          unique_value INTEGER NOT NULL DEFAULT 0 CHECK (unique_value IN (0, 1)),
          default_value_json TEXT CHECK (default_value_json IS NULL OR json_valid(default_value_json)),
          config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config_json)),
          position_key TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;

        CREATE INDEX workspace_properties_database
          ON workspace_properties (database_id, position_key) WHERE archived_at IS NULL;
        CREATE UNIQUE INDEX workspace_properties_active_name
          ON workspace_properties (database_id, name COLLATE NOCASE) WHERE archived_at IS NULL;
        CREATE UNIQUE INDEX workspace_properties_single_title
          ON workspace_properties (database_id) WHERE type = 'title' AND archived_at IS NULL;

        CREATE TABLE workspace_status_groups (
          id TEXT PRIMARY KEY NOT NULL,
          property_id TEXT NOT NULL REFERENCES workspace_properties(id) ON DELETE CASCADE,
          category TEXT NOT NULL CHECK (category IN ('NOT_STARTED', 'ACTIVE', 'COMPLETE')),
          label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 80),
          position_key TEXT NOT NULL
        ) STRICT;

        CREATE INDEX workspace_status_groups_property
          ON workspace_status_groups (property_id, position_key);

        CREATE TABLE workspace_property_options (
          id TEXT PRIMARY KEY NOT NULL,
          property_id TEXT NOT NULL REFERENCES workspace_properties(id) ON DELETE CASCADE,
          status_group_id TEXT REFERENCES workspace_status_groups(id) ON DELETE SET NULL,
          label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
          style_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(style_json)),
          position_key TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;

        CREATE INDEX workspace_property_options_prop
          ON workspace_property_options (property_id, position_key) WHERE archived_at IS NULL;
        CREATE UNIQUE INDEX workspace_property_options_active_label
          ON workspace_property_options (property_id, label COLLATE NOCASE) WHERE archived_at IS NULL;

        CREATE TABLE workspace_record_templates (
          id TEXT PRIMARY KEY NOT NULL,
          database_id TEXT NOT NULL REFERENCES workspace_databases(id) ON DELETE CASCADE,
          name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
          icon TEXT,
          defaults_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(defaults_json)),
          content_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(content_json)),
          position_key TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;

        CREATE INDEX workspace_record_templates_db
          ON workspace_record_templates (database_id, position_key) WHERE archived_at IS NULL;

        CREATE TABLE workspace_records (
          id TEXT PRIMARY KEY NOT NULL REFERENCES workspace_nodes(id) ON DELETE CASCADE,
          database_id TEXT NOT NULL REFERENCES workspace_databases(id) ON DELETE RESTRICT,
          sequence INTEGER NOT NULL CHECK (sequence >= 1),
          position_key TEXT NOT NULL,
          template_id TEXT REFERENCES workspace_record_templates(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;

        CREATE UNIQUE INDEX workspace_records_db_sequence
          ON workspace_records (database_id, sequence);
        CREATE INDEX workspace_records_db_pos
          ON workspace_records (database_id, position_key) WHERE archived_at IS NULL;
        CREATE INDEX workspace_records_archived
          ON workspace_records (database_id, archived_at);

        CREATE TABLE workspace_property_values (
          record_id TEXT NOT NULL REFERENCES workspace_records(id) ON DELETE CASCADE,
          property_id TEXT NOT NULL REFERENCES workspace_properties(id) ON DELETE CASCADE,
          text_value TEXT,
          number_value REAL,
          money_minor_value INTEGER,
          boolean_value INTEGER CHECK (boolean_value IS NULL OR boolean_value IN (0, 1)),
          date_start TEXT,
          date_end TEXT,
          date_has_time INTEGER DEFAULT 0 CHECK (date_has_time IN (0, 1)),
          option_id TEXT REFERENCES workspace_property_options(id) ON DELETE SET NULL,
          json_value TEXT CHECK (json_value IS NULL OR json_valid(json_value)),
          updated_at TEXT NOT NULL,
          PRIMARY KEY (record_id, property_id)
        ) STRICT;

        CREATE INDEX workspace_property_values_text
          ON workspace_property_values (property_id, text_value) WHERE text_value IS NOT NULL;
        CREATE INDEX workspace_property_values_number
          ON workspace_property_values (property_id, number_value) WHERE number_value IS NOT NULL;
        CREATE INDEX workspace_property_values_money
          ON workspace_property_values (property_id, money_minor_value) WHERE money_minor_value IS NOT NULL;
        CREATE INDEX workspace_property_values_date
          ON workspace_property_values (property_id, date_start) WHERE date_start IS NOT NULL;
        CREATE INDEX workspace_property_values_option
          ON workspace_property_values (property_id, option_id) WHERE option_id IS NOT NULL;

        CREATE TABLE workspace_multi_select_values (
          record_id TEXT NOT NULL REFERENCES workspace_records(id) ON DELETE CASCADE,
          property_id TEXT NOT NULL REFERENCES workspace_properties(id) ON DELETE CASCADE,
          option_id TEXT NOT NULL REFERENCES workspace_property_options(id) ON DELETE CASCADE,
          position_key TEXT NOT NULL,
          PRIMARY KEY (record_id, property_id, option_id)
        ) STRICT;

        CREATE INDEX workspace_multi_select_prop_opt
          ON workspace_multi_select_values (property_id, option_id);

        CREATE TABLE workspace_relations (
          id TEXT PRIMARY KEY NOT NULL,
          source_property_id TEXT NOT NULL REFERENCES workspace_properties(id) ON DELETE CASCADE,
          source_database_id TEXT NOT NULL REFERENCES workspace_databases(id) ON DELETE CASCADE,
          target_database_id TEXT NOT NULL REFERENCES workspace_databases(id) ON DELETE CASCADE,
          inverse_property_id TEXT REFERENCES workspace_properties(id) ON DELETE SET NULL,
          source_cardinality TEXT NOT NULL DEFAULT 'many' CHECK (source_cardinality IN ('one', 'many')),
          target_cardinality TEXT NOT NULL DEFAULT 'many' CHECK (target_cardinality IN ('one', 'many')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;

        CREATE INDEX workspace_relations_pair
          ON workspace_relations (source_database_id, target_database_id) WHERE archived_at IS NULL;

        CREATE TABLE workspace_relation_edges (
          id TEXT PRIMARY KEY NOT NULL,
          relation_id TEXT NOT NULL REFERENCES workspace_relations(id) ON DELETE CASCADE,
          source_record_id TEXT NOT NULL REFERENCES workspace_records(id) ON DELETE CASCADE,
          target_record_id TEXT NOT NULL REFERENCES workspace_records(id) ON DELETE CASCADE,
          position_key TEXT NOT NULL,
          created_at TEXT NOT NULL,
          archived_at TEXT,
          UNIQUE (relation_id, source_record_id, target_record_id)
        ) STRICT;

        CREATE INDEX workspace_relation_edges_source
          ON workspace_relation_edges (relation_id, source_record_id) WHERE archived_at IS NULL;
        CREATE INDEX workspace_relation_edges_target
          ON workspace_relation_edges (relation_id, target_record_id) WHERE archived_at IS NULL;

        CREATE TABLE workspace_views (
          id TEXT PRIMARY KEY NOT NULL,
          database_id TEXT NOT NULL REFERENCES workspace_databases(id) ON DELETE CASCADE,
          owner_type TEXT NOT NULL DEFAULT 'database' CHECK (owner_type IN ('database', 'block')),
          owner_id TEXT NOT NULL,
          name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
          layout TEXT NOT NULL CHECK (layout IN (
            'table', 'list', 'board', 'calendar', 'gallery', 'timeline', 'chart', 'map', 'form'
          )),
          filter_ast_json TEXT CHECK (filter_ast_json IS NULL OR json_valid(filter_ast_json)),
          sort_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(sort_json)),
          group_json TEXT CHECK (group_json IS NULL OR json_valid(group_json)),
          property_state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(property_state_json)),
          layout_config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(layout_config_json)),
          position_key TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;

        CREATE INDEX workspace_views_db_pos
          ON workspace_views (database_id, position_key) WHERE archived_at IS NULL;
        CREATE INDEX workspace_views_owner
          ON workspace_views (owner_type, owner_id) WHERE archived_at IS NULL;

        CREATE TABLE workspace_dependencies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_kind TEXT NOT NULL,
          source_id TEXT NOT NULL,
          target_kind TEXT NOT NULL,
          target_id TEXT NOT NULL,
          dependency_type TEXT NOT NULL,
          metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
          created_at TEXT NOT NULL
        ) STRICT;

        CREATE INDEX workspace_dependencies_target
          ON workspace_dependencies (target_kind, target_id);
        CREATE INDEX workspace_dependencies_source
          ON workspace_dependencies (source_kind, source_id);

        CREATE TABLE workspace_workflows (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
          icon TEXT,
          kind TEXT NOT NULL DEFAULT 'custom' CHECK (kind IN ('built_in', 'custom')),
          input_schema_json TEXT NOT NULL CHECK (json_valid(input_schema_json)),
          steps_json TEXT NOT NULL CHECK (json_valid(steps_json)),
          result_schema_json TEXT DEFAULT '{}' CHECK (result_schema_json IS NULL OR json_valid(result_schema_json)),
          version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
          position_key TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        ) STRICT;

        CREATE INDEX workspace_workflows_kind_pos
          ON workspace_workflows (kind, position_key) WHERE archived_at IS NULL;

        CREATE TABLE workspace_workflow_revisions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workflow_id TEXT NOT NULL REFERENCES workspace_workflows(id) ON DELETE CASCADE,
          version INTEGER NOT NULL CHECK (version >= 1),
          definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
          created_at TEXT NOT NULL,
          UNIQUE (workflow_id, version)
        ) STRICT;

        CREATE TABLE workspace_workflow_runs (
          id TEXT PRIMARY KEY NOT NULL,
          workflow_id TEXT NOT NULL REFERENCES workspace_workflows(id) ON DELETE RESTRICT,
          workflow_version INTEGER NOT NULL CHECK (workflow_version >= 1),
          status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'rolled_back')),
          input_json TEXT NOT NULL CHECK (json_valid(input_json)),
          result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
          actor_id TEXT NOT NULL,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          error_json TEXT CHECK (error_json IS NULL OR json_valid(error_json))
        ) STRICT;

        CREATE INDEX workspace_workflow_runs_wf
          ON workspace_workflow_runs (workflow_id, started_at DESC);

        CREATE TABLE workspace_attachments (
          id TEXT PRIMARY KEY NOT NULL,
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
          content_blob BLOB NOT NULL,
          created_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE workspace_file_values (
          record_id TEXT NOT NULL REFERENCES workspace_records(id) ON DELETE CASCADE,
          property_id TEXT NOT NULL REFERENCES workspace_properties(id) ON DELETE CASCADE,
          attachment_id TEXT NOT NULL REFERENCES workspace_attachments(id) ON DELETE CASCADE,
          position_key TEXT NOT NULL,
          PRIMARY KEY (record_id, property_id, attachment_id)
        ) STRICT;

        CREATE TABLE workspace_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_kind TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'archived', 'restored')),
          actor_id TEXT NOT NULL,
          before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
          after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
          metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
          created_at TEXT NOT NULL
        ) STRICT;

        CREATE INDEX workspace_audit_log_entity
          ON workspace_audit_log (entity_kind, entity_id, id DESC);

        CREATE VIRTUAL TABLE workspace_search_index USING fts5(
          entity_id UNINDEXED,
          entity_kind UNINDEXED,
          database_id UNINDEXED,
          display_title UNINDEXED,
          display_subtitle UNINDEXED,
          display_metadata UNINDEXED,
          search_text,
          tokenize = 'unicode61 remove_diacritics 2'
        );

        CREATE TABLE workspace_migration_map (
          legacy_entity_type TEXT NOT NULL,
          legacy_id TEXT NOT NULL,
          workspace_entity_type TEXT NOT NULL,
          workspace_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (legacy_entity_type, legacy_id)
        ) STRICT;

        CREATE TABLE workspace_migration_issues (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          legacy_entity_type TEXT NOT NULL,
          legacy_id TEXT NOT NULL,
          severity TEXT NOT NULL CHECK (severity IN ('warning', 'error')),
          message TEXT NOT NULL,
          details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
          created_at TEXT NOT NULL
        ) STRICT;
      `);
    },
  },
];
