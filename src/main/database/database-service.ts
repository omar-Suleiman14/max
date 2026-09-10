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
import { ReconciliationRepository } from './reconciliation-repository';
import { normalizeSearchText, SearchService } from './search-service';
import { ViewsPagesRepository } from './views-pages-repository';
import { DatabaseUnitOfWork } from './database-unit-of-work';
import { WorkspaceChangeBus } from './workspace-change-bus';
import { WorkspaceRepository } from './workspace-repository';
import { PropertyRepository } from './property-repository';
import { DatabaseRepository } from './database-repository';
import { RecordRepository } from './record-repository';
import { RelationRepository } from './relation-repository';
import { DependencyService } from './dependency-service';
import { PropertySchemaService } from './property-schema-service';
import { FormulaParser } from './formula/parser';
import { ComputedPropertyService } from './computed-property-service';
import { DatabaseQueryService } from './query/database-query-service';
import { ViewRepository } from './view-repository';
import { WorkflowService } from './workflow-service';
import { WorkspaceSearchService } from './workspace-search-service';
import { WorkspaceTemplateService } from './workspace-template-service';
import { V020MigrationService } from './v020-migration-service';
import { RecordTemplateRepository } from './record-template-repository';

export class DatabaseService {
  readonly #database: DatabaseSync;
  readonly accounts: AccountRepository;
  readonly backups: BackupService;
  readonly blueprints: BlueprintService;
  readonly demoData: DemoDataService;
  readonly objects: ObjectRepository;
  readonly personDebt: PersonDebtService;
  readonly reconciliation: ReconciliationRepository;
  readonly search: SearchService;
  readonly shopMetadata: ShopMetadataRepository;
  readonly templates: TemplateRepository;
  readonly transactions: TransactionRepository;
  readonly viewsPages: ViewsPagesRepository;

  // Max v0.2.0 Workspace Services
  readonly unitOfWork: DatabaseUnitOfWork;
  readonly changeBus: WorkspaceChangeBus;
  readonly workspace: WorkspaceRepository;
  readonly properties: PropertyRepository;
  readonly databases: DatabaseRepository;
  readonly records: RecordRepository;
  readonly recordTemplates: RecordTemplateRepository;
  readonly relations: RelationRepository;
  readonly dependencies: DependencyService;
  readonly propertySchema: PropertySchemaService;
  readonly computedProperties: ComputedPropertyService;
  readonly databaseQuery: DatabaseQueryService;
  readonly views: ViewRepository;
  readonly workflows: WorkflowService;
  readonly workspaceSearch: WorkspaceSearchService;
  readonly workspaceTemplates: WorkspaceTemplateService;
  readonly v020Migration: V020MigrationService;

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

    // Max v0.2.0 Core Workspace initialization
    this.unitOfWork = new DatabaseUnitOfWork(this.#database);
    this.changeBus = new WorkspaceChangeBus();
    this.workspaceSearch = new WorkspaceSearchService(this.#database);
    this.workspace = new WorkspaceRepository(this.#database, this.workspaceSearch);
    this.properties = new PropertyRepository(this.#database);
    this.recordTemplates = new RecordTemplateRepository(this.#database);
    this.records = new RecordRepository(this.#database, this.workspace, this.properties, this.workspaceSearch);
    this.databases = new DatabaseRepository(this.#database, this.workspace, this.properties, this.records);
    this.relations = new RelationRepository(this.#database, this.properties, this.records);
    this.dependencies = new DependencyService(this.#database);
    this.propertySchema = new PropertySchemaService(this.#database, this.properties, this.dependencies);
    const formulaParser = new FormulaParser();
    this.computedProperties = new ComputedPropertyService(
      this.#database,
      this.properties,
      this.records,
      this.relations,
      formulaParser,
    );
    this.databaseQuery = new DatabaseQueryService(
      this.#database,
      this.properties,
      this.records,
      this.computedProperties,
    );
    this.views = new ViewRepository(this.#database, this.workspaceSearch, this.workspace);
    this.workflows = new WorkflowService(
      this.#database,
      this.unitOfWork,
      this.records,
      this.relations,
      this.properties,
      this.databaseQuery,
      this.computedProperties,
    );
    this.workspaceTemplates = new WorkspaceTemplateService(
      this.unitOfWork,
      this.databases,
      this.properties,
      this.relations,
      this.views,
      this.workflows,
      this.workspace,
      this.recordTemplates,
      this.records,
    );
    this.v020Migration = new V020MigrationService(
      this.#database,
      this.unitOfWork,
      this.workspaceTemplates,
      this.records,
      this.relations,
      this.workspace,
      this.properties,
      this.views,
      this.backups,
      filename !== ':memory:',
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
        templateId: 'phone-shop',
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
      'workspace_migration_issues',
      'workspace_migration_map',
      'workspace_search_index',
      'workspace_audit_log',
      'workspace_file_values',
      'workspace_attachments',
      'workspace_workflow_runs',
      'workspace_workflow_revisions',
      'workspace_workflows',
      'workspace_dependencies',
      'workspace_views',
      'workspace_relation_edges',
      'workspace_relations',
      'workspace_multi_select_values',
      'workspace_property_values',
      'workspace_records',
      'workspace_record_templates',
      'workspace_property_options',
      'workspace_status_groups',
      'workspace_properties',
      'workspace_databases',
      'workspace_nodes',
      'inventory_movements', 'shop_money_movements', 'shop_daily_sessions', 'shop_transactions', 'pricing_services', 'pricing_profiles', 'shop_accounts', 'pricing_channels', 'pricing_providers',
      'object_property_values', 'object_audit_log', 'object_records', 'shop_templates',
      'object_properties', 'shop_saved_views', 'shop_custom_pages', 'app_metadata',
    ];
    for (const table of tables) this.#database.exec(`DELETE FROM ${table};`);
  }

  completeOnboarding(draft: CompleteOnboardingDraft): ShopMetadata {
    this.#assertInitialized();
    this.#database.exec('BEGIN IMMEDIATE;');
    try {
      if (draft.blueprint?.version === 2) this.workspaceTemplates.importBlueprintV2(draft.blueprint);
      else if (draft.blueprint) this.blueprints.importBlueprint(draft.blueprint);
      if (draft.includeDemoData) this.demoData.seed(draft.locale);
      this.#database.prepare(`
        INSERT INTO app_metadata (key, value, updated_at) VALUES ('workspace.template.id', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(draft.templateId ?? (draft.blueprint ? 'custom' : 'blank'), new Date().toISOString());
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
