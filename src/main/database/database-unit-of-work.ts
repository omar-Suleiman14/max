import type { DatabaseSync } from 'node:sqlite';

export class DatabaseUnitOfWork {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
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
