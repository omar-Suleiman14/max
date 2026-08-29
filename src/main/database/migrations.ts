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
];
