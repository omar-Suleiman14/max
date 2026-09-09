import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export class DatabaseUnitOfWork {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  preview<T>(operation: () => T): T {
    const name = `preview_${randomUUID().replaceAll('-', '')}`;
    this.#database.exec(`SAVEPOINT ${name};`);
    try { return operation(); }
    finally { this.#database.exec(`ROLLBACK TO ${name}; RELEASE ${name};`); }
  }

  run<T>(operation: () => T): T {
    if (this.#database.isTransaction) {
      return operation();
    }

    this.#database.exec('BEGIN IMMEDIATE;');
    try {
      const result = operation();
      this.#database.exec('COMMIT;');
      return result;
    } catch (error) {
      if (this.#database.isTransaction) {
        this.#database.exec('ROLLBACK;');
      }
      throw error;
    }
  }
}
