import { DatabaseSync } from 'node:sqlite';

import type { DatabaseHealth, DemoSeedSummary } from '../../shared/ipc-contract';
import type { CompleteOnboardingDraft, ShopMetadata } from '../../shared/blueprint-contract';
import { phoneShopBlueprint } from '../../shared/starter-blueprints';
import { AccountRepository } from './account-repository';
import { BlueprintService } from './blueprint-service';
import { DemoDataService } from './demo-data-service';
import { migrations, type Migration } from './migrations';
import { ObjectRepository } from './object-repository';
import { ShopMetadataRepository } from './shop-metadata-repository';
import { TemplateRepository } from './template-repository';
import { TransactionRepository } from './transaction-repository';

const MIGRATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS system_migrations (
    id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  ) STRICT;
`;

import { BackupService } from './backup-service';
import { PersonDebtService } from './person-debt-service';
import { QuickEntryService } from './quick-entry-service';
import { ReconciliationRepository } from './reconciliation-repository';
import { normalizeSearchText, SearchService } from './search-service';
import { ViewsPagesRepository } from './views-pages-repository';

export class DatabaseService {
  readonly #database: DatabaseSync;
  readonly accounts: AccountRepository;
  readonly backups: BackupService;
  readonly blueprints: BlueprintService;
  readonly demoData: DemoDataService;
  readonly objects: ObjectRepository;
  readonly personDebt: PersonDebtService;
  readonly quickEntry: QuickEntryService;
  readonly reconciliation: ReconciliationRepository;
  readonly search: SearchService;
  readonly shopMetadata: ShopMetadataRepository;
  readonly templates: TemplateRepository;
  readonly transactions: TransactionRepository;
  readonly viewsPages: ViewsPagesRepository;
  #initialized = false;

  constructor(filename: string) {
    this.#database = new DatabaseSync(filename, {
      allowBareNamedParameters: false,
      allowExtension: false,
      allowUnknownNamedParameters: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      timeout: 5_000,
    });
    this.#database.function('max_search_normalize', { deterministic: true }, (value: unknown) => {
      const text = typeof value === 'string'
        ? value
        : typeof value === 'number' || typeof value === 'bigint'
          ? value.toString()
          : '';
      return normalizeSearchText(text);
    });
    this.backups = new BackupService(filename);
    this.accounts = new AccountRepository(this.#database);
    this.transactions = new TransactionRepository(this.#database);
    this.reconciliation = new ReconciliationRepository(this.#database, this.transactions);
    this.personDebt = new PersonDebtService(this.#database, this.transactions);
    this.quickEntry = new QuickEntryService(this.#database, this.transactions);
    this.viewsPages = new ViewsPagesRepository(this.#database);
    this.search = new SearchService(this.#database);
    this.objects = new ObjectRepository(this.#database);
    this.templates = new TemplateRepository(this.#database);
    this.shopMetadata = new ShopMetadataRepository(this.#database);
    this.blueprints = new BlueprintService(
      this.#database,
      this.objects,
      this.templates,
      this.shopMetadata,
    );
    this.demoData = new DemoDataService(
      this.#database,
      this.accounts,
      this.objects,
      this.templates,
      this.transactions,
      this.viewsPages,
    );

    if (filename !== ':memory:') {
      this.#database.exec('PRAGMA journal_mode = WAL;');
      this.#database.exec('PRAGMA synchronous = NORMAL;');
    }
  }

  initialize(): void {
    if (this.#initialized) {
      return;
    }

    this.#database.exec(MIGRATIONS_TABLE_SQL);
    this.#validateMigrationPlan(migrations);

    const appliedMigrations = this.#database
      .prepare('SELECT id, name FROM system_migrations ORDER BY id')
      .all() as { id: number; name: string }[];
    this.#validateAppliedMigrations(appliedMigrations);
    const appliedIds = new Set(appliedMigrations.map(({ id }) => id));

    for (const migration of migrations) {
      if (!appliedIds.has(migration.id)) {
        this.#applyMigration(migration);
      }
    }

    this.#initialized = true;
  }

  getHealth(): DatabaseHealth {
    this.#assertInitialized();

    const integrity = this.#database.prepare('PRAGMA quick_check').get() as
      | { quick_check: string }
      | undefined;
    if (integrity?.quick_check !== 'ok') {
      throw new Error(`SQLite quick check failed: ${String(integrity?.quick_check)}`);
    }

    const foreignKeyViolation = this.#database.prepare('PRAGMA foreign_key_check').get();
    if (foreignKeyViolation) {
      throw new Error('SQLite foreign key check failed.');
    }

    const row = this.#database
      .prepare('SELECT COUNT(*) AS migrationCount, COALESCE(MAX(id), 0) AS schemaVersion FROM system_migrations')
      .get() as { migrationCount: number; schemaVersion: number };

    return {
      migrationCount: row.migrationCount,
      schemaVersion: row.schemaVersion,
      status: 'ready',
    };
  }

  close(): void {
    if (this.#database.isOpen) {
      this.#database.close();
    }
  }

  resetWorkspace(): void {
    this.#assertInitialized();
    this.#database.exec('BEGIN IMMEDIATE;');
    try {
      this.#clearWorkspace();
      this.#database.exec('COMMIT;');
    } catch (error) {
      if (this.#database.isTransaction) this.#database.exec('ROLLBACK;');
      throw error;
    }
  }

  resetDemoWorkspace(locale: 'ar' | 'en'): DemoSeedSummary {
    this.#assertInitialized();
    this.#database.exec('BEGIN IMMEDIATE;');
    try {
      this.#clearWorkspace();
      this.blueprints.importBlueprint(phoneShopBlueprint);
      const summary = this.demoData.seed(locale);
      this.shopMetadata.completeOnboarding({
        backupSchedule: 'daily',
        includeDemoData: false,
        locale,
        shopName: locale === 'ar' ? 'متجر Max التجريبي' : 'Max Demo Mobile Store',
      });
      this.#database.exec('COMMIT;');
      return summary;
    } catch (error) {
      if (this.#database.isTransaction) this.#database.exec('ROLLBACK;');
      throw error;
    }
  }

  #clearWorkspace(): void {
    const tables = [
      'inventory_movements', 'shop_money_movements', 'shop_daily_sessions', 'shop_transactions', 'shop_accounts',
      'object_property_values', 'object_audit_log', 'object_records', 'shop_templates',
      'object_properties', 'shop_saved_views', 'shop_custom_pages', 'app_metadata',
    ];
    for (const table of tables) this.#database.exec(`DELETE FROM ${table};`);
  }

  completeOnboarding(draft: CompleteOnboardingDraft): ShopMetadata {
    this.#assertInitialized();
    this.#database.exec('BEGIN IMMEDIATE;');
    try {
      if (draft.blueprint) this.blueprints.importBlueprint(draft.blueprint);
      if (draft.includeDemoData) this.demoData.seed(draft.locale);
      const metadata = this.shopMetadata.completeOnboarding(draft);
      this.#database.exec('COMMIT;');
      return metadata;
    } catch (error) {
      if (this.#database.isTransaction) this.#database.exec('ROLLBACK;');
      throw error;
    }
  }

  seedDemoData(locale: 'ar' | 'en'): DemoSeedSummary {
    this.#assertInitialized();
    this.#database.exec('BEGIN IMMEDIATE;');
    try {
      const summary = this.demoData.seed(locale);
      this.#database.exec('COMMIT;');
      return summary;
    } catch (error) {
      if (this.#database.isTransaction) this.#database.exec('ROLLBACK;');
      throw error;
    }
  }

  #assertInitialized(): void {
    if (!this.#initialized) {
      throw new Error('DatabaseService must be initialized before use.');
    }
  }

  #applyMigration(migration: Migration): void {
    this.#database.exec('BEGIN IMMEDIATE;');

    try {
      migration.up(this.#database);
      this.#database
        .prepare('INSERT INTO system_migrations (id, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.id, migration.name, new Date().toISOString());
      this.#database.exec('COMMIT;');
    } catch (error) {
      if (this.#database.isTransaction) {
        this.#database.exec('ROLLBACK;');
      }
      throw error;
    }
  }

  #validateMigrationPlan(plan: readonly Migration[]): void {
    const ids = new Set<number>();
    const names = new Set<string>();

    for (const [index, migration] of plan.entries()) {
      const expectedId = index + 1;
      if (migration.id !== expectedId) {
        throw new Error(`Migration ${migration.name} must have id ${expectedId}.`);
      }
      if (ids.has(migration.id) || names.has(migration.name)) {
        throw new Error(`Duplicate migration detected: ${migration.id}/${migration.name}.`);
      }
      ids.add(migration.id);
      names.add(migration.name);
    }
  }

  #validateAppliedMigrations(applied: readonly { id: number; name: string }[]): void {
    for (const [index, persisted] of applied.entries()) {
      const expectedId = index + 1;
      const planned = migrations[index];

      if (persisted.id !== expectedId) {
        throw new Error(`Persisted migrations are not contiguous at id ${expectedId}.`);
      }
      if (!planned) {
        throw new Error(`Database schema ${persisted.id} is newer than this Max build.`);
      }
      if (planned.name !== persisted.name) {
        throw new Error(`Migration history mismatch at id ${persisted.id}.`);
      }
    }
  }
}
