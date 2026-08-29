import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  accountTypes,
  type AccountDefinition,
  type AccountDraft,
  type AccountType,
} from '../../shared/account-contract';
import { ObjectDomainError } from './object-repository';

type AccountRow = Readonly<{
  account_type: AccountType;
  balance: number;
  created_at: string;
  id: string;
  initial_balance: number;
  name: string;
  position: number;
  updated_at: string;
}>;

function rowToAccount(row: AccountRow): AccountDefinition {
  return {
    accountType: row.account_type,
    balance: Math.round(row.balance * 100) / 100,
    createdAt: row.created_at,
    id: row.id,
    initialBalance: Math.round(row.initial_balance * 100) / 100,
    name: row.name,
    position: row.position,
    updatedAt: row.updated_at,
  };
}

export class AccountRepository {
  constructor(private readonly database: DatabaseSync) {}

  listAccounts(): readonly AccountDefinition[] {
    const rows = this.database
      .prepare(`
        SELECT
          a.id,
          a.name,
          a.account_type,
          a.initial_balance,
          a.position,
          a.created_at,
          a.updated_at,
          (
            a.initial_balance
            + COALESCE((SELECT SUM(amount) FROM shop_money_movements WHERE account_id = a.id AND movement_type = 'inflow' AND archived_at IS NULL), 0)
            - COALESCE((SELECT SUM(amount) FROM shop_money_movements WHERE account_id = a.id AND movement_type = 'outflow' AND archived_at IS NULL), 0)
          ) AS balance
        FROM shop_accounts a
        WHERE a.archived_at IS NULL
        ORDER BY a.position, a.created_at
      `)
      .all() as AccountRow[];
    return rows.map(rowToAccount);
  }

  getAccount(id: string): AccountDefinition {
    const row = this.database
      .prepare(`
        SELECT
          a.id,
          a.name,
          a.account_type,
          a.initial_balance,
          a.position,
          a.created_at,
          a.updated_at,
          (
            a.initial_balance
            + COALESCE((SELECT SUM(amount) FROM shop_money_movements WHERE account_id = a.id AND movement_type = 'inflow' AND archived_at IS NULL), 0)
            - COALESCE((SELECT SUM(amount) FROM shop_money_movements WHERE account_id = a.id AND movement_type = 'outflow' AND archived_at IS NULL), 0)
          ) AS balance
        FROM shop_accounts a
        WHERE a.id = ? AND a.archived_at IS NULL
      `)
      .get(id) as AccountRow | undefined;

    if (!row) {
      throw new ObjectDomainError('not-found', 'Account not found.');
    }
    return rowToAccount(row);
  }

  createAccount(input: AccountDraft): AccountDefinition {
    const draft = this.#validateDraft(input);
    const id = randomUUID();
    const now = new Date().toISOString();
    const positionRow = this.database
      .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM shop_accounts')
      .get() as { position: number };

    return this.#transaction(() => {
      try {
        this.database
          .prepare(`
            INSERT INTO shop_accounts (id, name, account_type, initial_balance, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `)
          .run(id, draft.name, draft.accountType, draft.initialBalance, positionRow.position, now, now);
      } catch (error) {
        if (/shop_accounts(?:_active_name|\.name)/.test(String(error))) {
          throw new ObjectDomainError('unique', 'An account with this name already exists.');
        }
        throw error;
      }

      const account = this.getAccount(id);
      this.#writeAudit(id, 'created', account, now);
      return account;
    });
  }

  updateAccount(id: string, input: AccountDraft): AccountDefinition {
    const previous = this.getAccount(id);
    const draft = this.#validateDraft(input);
    const now = new Date().toISOString();

    return this.#transaction(() => {
      try {
        this.database
          .prepare(`
            UPDATE shop_accounts
            SET name = ?, account_type = ?, initial_balance = ?, updated_at = ?
            WHERE id = ? AND archived_at IS NULL
          `)
          .run(draft.name, draft.accountType, draft.initialBalance, now, id);
      } catch (error) {
        if (/shop_accounts(?:_active_name|\.name)/.test(String(error))) {
          throw new ObjectDomainError('unique', 'An account with this name already exists.');
        }
        throw error;
      }

      const updated = this.getAccount(id);
      this.#writeAudit(id, 'updated', { previous, updated }, now);
      return updated;
    });
  }

  archiveAccount(id: string): void {
    const account = this.getAccount(id);
    const now = new Date().toISOString();

    this.#transaction(() => {
      this.database
        .prepare('UPDATE shop_accounts SET archived_at = ?, updated_at = ? WHERE id = ?')
        .run(now, now, id);
      this.#writeAudit(id, 'archived', account, now);
    });
  }

  #validateDraft(draft: AccountDraft): AccountDraft {
    const name = draft.name.trim();
    if (name.length < 1 || name.length > 80) {
      throw new ObjectDomainError('invalid-input', 'Account name must contain 1–80 characters.');
    }
    if (!accountTypes.includes(draft.accountType)) {
      throw new ObjectDomainError('invalid-input', 'Invalid account type.');
    }
    const initialBalance = Number(draft.initialBalance);
    if (!Number.isFinite(initialBalance) || initialBalance < 0) {
      throw new ObjectDomainError('invalid-input', 'Initial balance must be a non-negative number.');
    }

    return {
      accountType: draft.accountType,
      initialBalance: Math.round(initialBalance * 100) / 100,
      name,
    };
  }

  #writeAudit(entityId: string, action: 'archived' | 'created' | 'updated', snapshot: unknown, now: string): void {
    this.database
      .prepare(`
        INSERT INTO object_audit_log (entity_type, entity_id, action, actor, snapshot_json, created_at)
        VALUES ('account', ?, ?, 'local-user', ?, ?)
      `)
      .run(entityId, action, JSON.stringify(snapshot), now);
  }

  #transaction<T>(work: () => T): T {
    const isNested = this.database.isTransaction;
    if (!isNested) {
      this.database.exec('BEGIN IMMEDIATE;');
    }
    try {
      const result = work();
      if (!isNested) {
        this.database.exec('COMMIT;');
      }
      return result;
    } catch (error) {
      if (!isNested && this.database.isTransaction) {
        this.database.exec('ROLLBACK;');
      }
      throw error;
    }
  }
}
