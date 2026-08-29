import { DatabaseSync } from 'node:sqlite';

import type { DatabaseHealth } from '../../shared/ipc-contract';
import { AccountRepository } from './account-repository';
import { BlueprintService } from './blueprint-service';
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

import { PersonDebtService } from './person-debt-service';
import { QuickEntryService } from './quick-entry-service';

export class DatabaseService {
  readonly #database: DatabaseSync;
  readonly accounts: AccountRepository;
  readonly blueprints: BlueprintService;
  readonly objects: ObjectRepository;
  readonly personDebt: PersonDebtService;
  readonly quickEntry: QuickEntryService;
  readonly shopMetadata: ShopMetadataRepository;
  readonly templates: TemplateRepository;
  readonly transactions: TransactionRepository;
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
    this.accounts = new AccountRepository(this.#database);
    this.transactions = new TransactionRepository(this.#database);
    this.personDebt = new PersonDebtService(this.#database, this.transactions);
    this.quickEntry = new QuickEntryService(this.#database, this.transactions);
    this.objects = new ObjectRepository(this.#database);
    this.templates = new TemplateRepository(this.#database);
    this.shopMetadata = new ShopMetadataRepository(this.#database);
    this.blueprints = new BlueprintService(
      this.#database,
      this.objects,
      this.templates,
      this.shopMetadata,
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
