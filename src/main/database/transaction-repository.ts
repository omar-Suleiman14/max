import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  movementTypes,
  transactionTypes,
  type LedgerSummary,
  type MoneyMovement,
  type MoneyMovementDraft,
  type MovementType,
  type PaymentStatus,
  type TransactionDraft,
  type TransactionRecord,
  type TransactionType,
  type TransferDraft,
} from '../../shared/transaction-contract';
import { ObjectDomainError } from './object-repository';

type TransactionRow = Readonly<{
  archived_at: string | null;
  created_at: string;
  id: string;
  item_id: string | null;
  item_label: string | null;
  note: string | null;
  paid_amount: number;
  payment_status: PaymentStatus;
  person_id: string | null;
  person_label: string | null;
  provider_fee: number;
  quantity: number | null;
  reversal_of_id: string | null;
  reversed_at: string | null;
  service_fee: number;
  total_amount: number;
  transaction_type: TransactionType;
  updated_at: string;
}>;

type MovementRow = Readonly<{
  account_id: string;
  account_name: string | null;
  amount: number;
  created_at: string;
  id: number;
  movement_type: MovementType;
  transaction_id: string;
}>;

export class TransactionRepository {
  constructor(private readonly database: DatabaseSync) {}

  listTransactions(limit = 200): readonly TransactionRecord[] {
    const rows = this.database
      .prepare(`
        SELECT
          t.id,
          t.transaction_type,
          t.total_amount,
          t.paid_amount,
          t.payment_status,
          t.person_id,
          p.label AS person_label,
          t.item_id,
          i.label AS item_label,
          t.note,
          t.reversal_of_id,
          t.reversed_at,
          t.created_at,
          t.updated_at,
          t.archived_at
        FROM shop_transactions t
        LEFT JOIN object_records p ON p.id = t.person_id
        LEFT JOIN object_records i ON i.id = t.item_id
        WHERE t.archived_at IS NULL
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT ?
      `)
      .all(limit) as TransactionRow[];

    if (rows.length === 0) return [];

    const txIds = rows.map((r) => r.id);
    const placeholders = txIds.map(() => '?').join(',');
    const movementRows = this.database
      .prepare(`
        SELECT
          m.id,
          m.transaction_id,
          m.account_id,
          a.name AS account_name,
          m.movement_type,
          m.amount,
          m.created_at
        FROM shop_money_movements m
        LEFT JOIN shop_accounts a ON a.id = m.account_id
        WHERE m.transaction_id IN (${placeholders}) AND m.archived_at IS NULL
        ORDER BY m.id ASC
      `)
      .all(...txIds) as MovementRow[];

    const movementsByTx = new Map<string, MoneyMovement[]>();
    for (const row of movementRows) {
      const list = movementsByTx.get(row.transaction_id) ?? [];
      list.push({
        accountId: row.account_id,
        accountName: row.account_name ?? undefined,
        amount: Math.round(row.amount * 100) / 100,
        createdAt: row.created_at,
        id: row.id,
        movementType: row.movement_type,
        transactionId: row.transaction_id,
      });
      movementsByTx.set(row.transaction_id, list);
    }

    return rows.map((row) => ({
      createdAt: row.created_at,
      id: row.id,
      itemId: row.item_id ?? undefined,
      itemLabel: row.item_label ?? undefined,
      movements: movementsByTx.get(row.id) ?? [],
      note: row.note ?? undefined,
      paidAmount: Math.round(row.paid_amount * 100) / 100,
      paymentStatus: row.payment_status,
      personId: row.person_id ?? undefined,
      personLabel: row.person_label ?? undefined,
      providerFee: row.provider_fee ? Math.round(row.provider_fee * 100) / 100 : undefined,
      quantity: row.quantity ?? undefined,
      reversalOfId: row.reversal_of_id ?? undefined,
      reversedAt: row.reversed_at ?? undefined,
      serviceFee: row.service_fee ? Math.round(row.service_fee * 100) / 100 : undefined,
      totalAmount: Math.round(row.total_amount * 100) / 100,
      transactionType: row.transaction_type,
      updatedAt: row.updated_at,
    }));
  }

  getTransaction(id: string): TransactionRecord | null {
    const row = this.database
      .prepare(`
        SELECT
          t.id,
          t.transaction_type,
          t.total_amount,
          t.paid_amount,
          t.payment_status,
          t.person_id,
          p.label AS person_label,
          t.item_id,
          i.label AS item_label,
          t.note,
          t.reversal_of_id,
          t.reversed_at,
          t.created_at,
          t.updated_at,
          t.archived_at
        FROM shop_transactions t
        LEFT JOIN object_records p ON p.id = t.person_id
        LEFT JOIN object_records i ON i.id = t.item_id
        WHERE t.id = ? AND t.archived_at IS NULL
      `)
      .get(id) as TransactionRow | undefined;

    if (!row) return null;

    const movementRows = this.database
      .prepare(`
        SELECT
          m.id,
          m.transaction_id,
          m.account_id,
          a.name AS account_name,
          m.movement_type,
          m.amount,
          m.created_at
        FROM shop_money_movements m
        LEFT JOIN shop_accounts a ON a.id = m.account_id
        WHERE m.transaction_id = ? AND m.archived_at IS NULL
        ORDER BY m.id ASC
      `)
      .all(id) as MovementRow[];

    const movements: MoneyMovement[] = movementRows.map((m) => ({
      accountId: m.account_id,
      accountName: m.account_name ?? undefined,
      amount: Math.round(m.amount * 100) / 100,
      createdAt: m.created_at,
      id: m.id,
      movementType: m.movement_type,
      transactionId: m.transaction_id,
    }));

    return {
      createdAt: row.created_at,
      id: row.id,
      itemId: row.item_id ?? undefined,
      itemLabel: row.item_label ?? undefined,
      movements,
      note: row.note ?? undefined,
      paidAmount: Math.round(row.paid_amount * 100) / 100,
      paymentStatus: row.payment_status,
      personId: row.person_id ?? undefined,
      personLabel: row.person_label ?? undefined,
      providerFee: row.provider_fee ? Math.round(row.provider_fee * 100) / 100 : undefined,
      quantity: row.quantity ?? undefined,
      reversalOfId: row.reversal_of_id ?? undefined,
      reversedAt: row.reversed_at ?? undefined,
      serviceFee: row.service_fee ? Math.round(row.service_fee * 100) / 100 : undefined,
      totalAmount: Math.round(row.total_amount * 100) / 100,
      transactionType: row.transaction_type,
      updatedAt: row.updated_at,
    };
  }

  createTransaction(input: TransactionDraft): TransactionRecord {
    const draft = this.#validateTransactionDraft(input);
    const id = randomUUID();
    const now = new Date().toISOString();

    const paymentStatus: PaymentStatus =
      draft.paidAmount >= draft.totalAmount
        ? 'paid'
        : draft.paidAmount > 0
          ? 'partial'
          : 'unpaid';

    return this.#transaction(() => {
      // Inventory: oversell prevention + stock mutation for sale/purchase
      if (draft.itemId && draft.quantity && draft.quantity > 0) {
        const itemRow = this.database
          .prepare('SELECT current_quantity FROM object_records WHERE id = ? AND archived_at IS NULL')
          .get(draft.itemId) as { current_quantity: number | null } | undefined;

        if (draft.transactionType === 'sale') {
          const currentQty = itemRow?.current_quantity;
          if (currentQty !== null && currentQty !== undefined && currentQty < draft.quantity) {
            throw new ObjectDomainError(
              'invalid-input',
              `Only ${currentQty} available in stock.`,
            );
          }
          // Deduct stock
          this.database
            .prepare('UPDATE object_records SET current_quantity = COALESCE(current_quantity, 0) - ? WHERE id = ?')
            .run(draft.quantity, draft.itemId);
          // Create inventory movement
          this.database
            .prepare('INSERT INTO inventory_movements (item_id, operation_id, quantity_delta, reason, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(draft.itemId, id, -draft.quantity, 'sale', now);
        } else if (draft.transactionType === 'purchase') {
          // Add stock
          this.database
            .prepare('UPDATE object_records SET current_quantity = COALESCE(current_quantity, 0) + ? WHERE id = ?')
            .run(draft.quantity, draft.itemId);
          this.database
            .prepare('INSERT INTO inventory_movements (item_id, operation_id, quantity_delta, reason, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(draft.itemId, id, draft.quantity, 'purchase', now);
        }
      }

      this.database
        .prepare(`
          INSERT INTO shop_transactions (
            id, transaction_type, total_amount, paid_amount, payment_status,
            person_id, item_id, note, quantity, provider_fee, service_fee,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          id,
          draft.transactionType,
          draft.totalAmount,
          draft.paidAmount,
          paymentStatus,
          draft.personId ?? null,
          draft.itemId ?? null,
          draft.note ?? null,
          draft.quantity ?? null,
          draft.providerFee ?? 0,
          draft.serviceFee ?? 0,
          now,
          now,
        );

      for (const m of draft.movements) {
        this.database
          .prepare(`
            INSERT INTO shop_money_movements (transaction_id, account_id, movement_type, amount, created_at)
            VALUES (?, ?, ?, ?, ?)
          `)
          .run(id, m.accountId, m.movementType, m.amount, now);
      }

      const created = this.getTransaction(id);
      if (!created) throw new Error('Transaction creation could not be verified.');
      this.#writeAudit(id, 'created', created, now);
      return created;
    });
  }

  createTransfer(input: TransferDraft): TransactionRecord {
    const draft = this.#validateTransferDraft(input);
    const id = randomUUID();
    const now = new Date().toISOString();

    return this.#transaction(() => {
      const providerFee = Math.round((Number(draft.providerFee) || 0) * 100) / 100;
      const serviceFee = Math.round((Number(draft.serviceFee) || 0) * 100) / 100;
      const outflowAmount = Math.round((draft.amount + providerFee) * 100) / 100;
      const inflowAmount = Math.round((draft.amount + serviceFee) * 100) / 100;

      this.database
        .prepare(`
          INSERT INTO shop_transactions (
            id, transaction_type, total_amount, paid_amount, payment_status,
            note, provider_fee, service_fee, created_at, updated_at
          ) VALUES (?, 'transfer', ?, ?, 'paid', ?, ?, ?, ?, ?)
        `)
        .run(id, draft.amount, draft.amount, draft.note ?? null, providerFee, serviceFee, now, now);

      // Outflow from source account (amount + provider fee)
      this.database
        .prepare(`
          INSERT INTO shop_money_movements (transaction_id, account_id, movement_type, amount, created_at)
          VALUES (?, ?, 'outflow', ?, ?)
        `)
        .run(id, draft.fromAccountId, outflowAmount, now);

      // Inflow to destination account (amount + service fee)
      this.database
        .prepare(`
          INSERT INTO shop_money_movements (transaction_id, account_id, movement_type, amount, created_at)
          VALUES (?, ?, 'inflow', ?, ?)
        `)
        .run(id, draft.toAccountId, inflowAmount, now);

      const created = this.getTransaction(id);
      if (!created) throw new Error('Transfer creation could not be verified.');
      this.#writeAudit(id, 'created', created, now);
      return created;
    });
  }

  reverseTransaction(id: string, reason?: string): TransactionRecord {
    const original = this.getTransaction(id);
    if (!original) {
      throw new ObjectDomainError('not-found', 'Transaction not found.');
    }
    if (original.reversedAt) {
      throw new ObjectDomainError('invalid-input', 'This transaction has already been reversed.');
    }
    if (original.transactionType === 'reversal') {
      throw new ObjectDomainError('invalid-input', 'A reversal transaction cannot be reversed.');
    }

    const reversalId = randomUUID();
    const now = new Date().toISOString();
    const reversalNote = reason?.trim() ? `Reversal: ${reason.trim()}` : `Reversal of transaction ${original.id}`;

    return this.#transaction(() => {
      // Mark original as reversed
      this.database
        .prepare('UPDATE shop_transactions SET reversed_at = ?, updated_at = ? WHERE id = ?')
        .run(now, now, original.id);

      // Create counter transaction
      this.database
        .prepare(`
          INSERT INTO shop_transactions (
            id, transaction_type, total_amount, paid_amount, payment_status,
            person_id, item_id, note, reversal_of_id, created_at, updated_at
          ) VALUES (?, 'reversal', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          reversalId,
          original.totalAmount,
          original.paidAmount,
          original.paymentStatus,
          original.personId ?? null,
          original.itemId ?? null,
          reversalNote,
          original.id,
          now,
          now,
        );

      // For every movement in original, create opposite movement
      for (const m of original.movements) {
        const oppositeType: MovementType = m.movementType === 'inflow' ? 'outflow' : 'inflow';
        this.database
          .prepare(`
            INSERT INTO shop_money_movements (transaction_id, account_id, movement_type, amount, created_at)
            VALUES (?, ?, ?, ?, ?)
          `)
          .run(reversalId, m.accountId, oppositeType, m.amount, now);
      }

      const reversalRecord = this.getTransaction(reversalId);
      if (!reversalRecord) throw new Error('Reversal creation failed.');
      this.#writeAudit(reversalId, 'created', reversalRecord, now);
      this.#writeAudit(original.id, 'updated', { ...original, reversedAt: now }, now);
      return reversalRecord;
    });
  }

  undoTransaction(id: string): void {
    const original = this.getTransaction(id);
    if (!original) {
      throw new ObjectDomainError('not-found', 'Transaction not found.');
    }
    const now = new Date().toISOString();

    this.#transaction(() => {
      // Restore inventory if the transaction had inventory movements
      const invMovements = this.database
        .prepare('SELECT item_id, quantity_delta FROM inventory_movements WHERE operation_id = ?')
        .all(id) as { item_id: string; quantity_delta: number }[];
      for (const inv of invMovements) {
        // Reverse: add back what was deducted or deduct what was added
        this.database
          .prepare('UPDATE object_records SET current_quantity = COALESCE(current_quantity, 0) - ? WHERE id = ?')
          .run(inv.quantity_delta, inv.item_id);
      }
      // Delete the inventory movements
      this.database
        .prepare('DELETE FROM inventory_movements WHERE operation_id = ?')
        .run(id);

      this.database
        .prepare('UPDATE shop_transactions SET archived_at = ?, updated_at = ? WHERE id = ?')
        .run(now, now, id);
      this.database
        .prepare('UPDATE shop_money_movements SET archived_at = ? WHERE transaction_id = ?')
        .run(now, id);
      this.#writeAudit(id, 'archived', original, now);
    });
  }

  getLedgerSummary(): LedgerSummary {
    const accountRows = this.database
      .prepare(`
        SELECT
          a.account_type,
          (
            a.initial_balance
            + COALESCE((SELECT SUM(amount) FROM shop_money_movements WHERE account_id = a.id AND movement_type = 'inflow' AND archived_at IS NULL), 0)
            - COALESCE((SELECT SUM(amount) FROM shop_money_movements WHERE account_id = a.id AND movement_type = 'outflow' AND archived_at IS NULL), 0)
          ) AS balance
        FROM shop_accounts a
        WHERE a.archived_at IS NULL
      `)
      .all() as { account_type: string; balance: number }[];

    let totalCash = 0;
    let totalBank = 0;
    let totalWallet = 0;

    for (const acc of accountRows) {
      const balance = acc.balance || 0;
      if (acc.account_type === 'cash') totalCash += balance;
      else if (acc.account_type === 'bank') totalBank += balance;
      else if (acc.account_type === 'wallet') totalWallet += balance;
    }

    const txTotals = this.database
      .prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN transaction_type IN ('sale', 'income') THEN total_amount ELSE 0 END), 0) AS total_sales,
          COALESCE(SUM(CASE WHEN transaction_type IN ('expense', 'purchase') THEN total_amount ELSE 0 END), 0) AS total_expenses
        FROM shop_transactions
        WHERE archived_at IS NULL AND reversed_at IS NULL AND transaction_type != 'reversal'
      `)
      .get() as { total_expenses: number; total_sales: number };

    return {
      totalBank: Math.round(totalBank * 100) / 100,
      totalCash: Math.round(totalCash * 100) / 100,
      totalExpenses: Math.round(txTotals.total_expenses * 100) / 100,
      totalOverall: Math.round((totalCash + totalBank + totalWallet) * 100) / 100,
      totalSales: Math.round(txTotals.total_sales * 100) / 100,
      totalWallet: Math.round(totalWallet * 100) / 100,
    };
  }

  #validateTransactionDraft(draft: TransactionDraft): TransactionDraft {
    if (!transactionTypes.includes(draft.transactionType)) {
      throw new ObjectDomainError('invalid-input', 'Invalid transaction type.');
    }
    const totalAmount = Number(draft.totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      throw new ObjectDomainError('invalid-input', 'Total amount must be a non-negative number.');
    }
    const paidAmount = Number(draft.paidAmount);
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      throw new ObjectDomainError('invalid-input', 'Paid amount must be a non-negative number.');
    }
    if (paidAmount > totalAmount) {
      throw new ObjectDomainError('invalid-input', 'Paid amount cannot exceed total amount.');
    }

    if (draft.personId) {
      const person = this.database
        .prepare('SELECT id FROM object_records WHERE id = ? AND object_kind = ? AND archived_at IS NULL')
        .get(draft.personId, 'person');
      if (!person) throw new ObjectDomainError('not-found', 'Selected person record not found.');
    }

    if (draft.itemId) {
      const item = this.database
        .prepare('SELECT id FROM object_records WHERE id = ? AND object_kind = ? AND archived_at IS NULL')
        .get(draft.itemId, 'item');
      if (!item) throw new ObjectDomainError('not-found', 'Selected item record not found.');
    }

    const movements: MoneyMovementDraft[] = [];
    let totalMovementAmount = 0;

    for (const m of draft.movements ?? []) {
      const amount = Number(m.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new ObjectDomainError('invalid-input', 'Money movement amount must be greater than zero.');
      }
      if (!movementTypes.includes(m.movementType)) {
        throw new ObjectDomainError('invalid-input', 'Invalid money movement type.');
      }
      const account = this.database
        .prepare('SELECT id FROM shop_accounts WHERE id = ? AND archived_at IS NULL')
        .get(m.accountId);
      if (!account) {
        throw new ObjectDomainError('not-found', 'Account for money movement not found.');
      }

      totalMovementAmount += amount;
      movements.push({
        accountId: m.accountId,
        amount: Math.round(amount * 100) / 100,
        movementType: m.movementType,
      });
    }

    if (paidAmount > 0) {
      if (movements.length === 0) {
        throw new ObjectDomainError('invalid-input', 'Paid transactions require at least one payment account.');
      }
      const roundedMovement = Math.round(totalMovementAmount * 100) / 100;
      const roundedPaid = Math.round(paidAmount * 100) / 100;
      if (Math.abs(roundedMovement - roundedPaid) > 0.01) {
        throw new ObjectDomainError(
          'invalid-input',
          `Sum of money movements (${roundedMovement}) does not match paid amount (${roundedPaid}).`,
        );
      }
    } else if (movements.length > 0) {
      throw new ObjectDomainError('invalid-input', 'Unpaid transactions cannot have money movements.');
    }

    return {
      itemId: draft.itemId,
      movements,
      note: draft.note?.trim() || undefined,
      paidAmount: Math.round(paidAmount * 100) / 100,
      personId: draft.personId,
      providerFee: draft.providerFee ? Math.round(Number(draft.providerFee) * 100) / 100 : undefined,
      quantity: draft.quantity ? Math.max(1, Math.round(Number(draft.quantity))) : undefined,
      serviceFee: draft.serviceFee ? Math.round(Number(draft.serviceFee) * 100) / 100 : undefined,
      totalAmount: Math.round(totalAmount * 100) / 100,
      transactionType: draft.transactionType,
    };
  }

  #validateTransferDraft(draft: TransferDraft): TransferDraft {
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ObjectDomainError('invalid-input', 'Transfer amount must be greater than zero.');
    }
    if (!draft.fromAccountId || !draft.toAccountId) {
      throw new ObjectDomainError('invalid-input', 'Both source and destination accounts are required.');
    }
    if (draft.fromAccountId === draft.toAccountId) {
      throw new ObjectDomainError('invalid-input', 'Source and destination accounts must be different.');
    }

    const fromAcc = this.database
      .prepare('SELECT id FROM shop_accounts WHERE id = ? AND archived_at IS NULL')
      .get(draft.fromAccountId);
    if (!fromAcc) throw new ObjectDomainError('not-found', 'Source account not found.');

    const toAcc = this.database
      .prepare('SELECT id FROM shop_accounts WHERE id = ? AND archived_at IS NULL')
      .get(draft.toAccountId);
    if (!toAcc) throw new ObjectDomainError('not-found', 'Destination account not found.');

    return {
      amount: Math.round(amount * 100) / 100,
      fromAccountId: draft.fromAccountId,
      note: draft.note?.trim() || undefined,
      toAccountId: draft.toAccountId,
    };
  }

  #writeAudit(entityId: string, action: 'archived' | 'created' | 'updated', snapshot: unknown, now: string): void {
    this.database
      .prepare(`
        INSERT INTO object_audit_log (entity_type, entity_id, action, actor, snapshot_json, created_at)
        VALUES ('transaction', ?, ?, 'local-user', ?, ?)
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
