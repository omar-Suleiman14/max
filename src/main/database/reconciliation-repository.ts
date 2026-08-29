import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type {
  CloseSessionDraft,
  DailySession,
  OpenSessionDraft,
  SessionExpectedClosing,
} from '../../shared/reconciliation-contract';
import { ObjectDomainError } from './object-repository';
import type { TransactionRepository } from './transaction-repository';

type DailySessionRow = {
  account_id: string;
  actual_closing_balance: number | null;
  closed_at: string | null;
  created_at: string;
  discrepancy: number | null;
  discrepancy_note: string | null;
  expected_closing_balance: number | null;
  id: string;
  opened_at: string;
  opening_balance: number;
  reconciliation_transaction_id: string | null;
  status: 'closed' | 'open';
  total_expenses: number;
  total_inflows: number;
  total_outflows: number;
  total_sales: number;
  updated_at: string;
};

export class ReconciliationRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly transactions: TransactionRepository,
  ) {}

  #audit(entityId: string, action: 'created' | 'updated', snapshot: unknown): void {
    const now = new Date().toISOString();
    this.database
      .prepare(`
        INSERT INTO object_audit_log (entity_type, entity_id, action, actor, snapshot_json, created_at)
        VALUES ('daily_session', ?, ?, 'local-user', ?, ?)
      `)
      .run(entityId, action, JSON.stringify(snapshot), now);
  }

  getCurrentSession(accountId?: string): DailySession | null {
    const sql = accountId
      ? 'SELECT * FROM shop_daily_sessions WHERE account_id = ? AND status = ? ORDER BY opened_at DESC LIMIT 1'
      : 'SELECT * FROM shop_daily_sessions WHERE status = ? ORDER BY opened_at DESC LIMIT 1';

    const row = (
      accountId
        ? this.database.prepare(sql).get(accountId, 'open')
        : this.database.prepare(sql).get('open')
    ) as DailySessionRow | undefined;

    return row ? this.#rowToSession(row) : null;
  }

  getSession(id: string): DailySession {
    const row = this.database
      .prepare('SELECT * FROM shop_daily_sessions WHERE id = ?')
      .get(id) as DailySessionRow | undefined;

    if (!row) {
      throw new ObjectDomainError('not-found', `Daily session ${id} not found.`);
    }
    return this.#rowToSession(row);
  }

  listSessions(limit = 50): readonly DailySession[] {
    const rows = this.database
      .prepare('SELECT * FROM shop_daily_sessions ORDER BY opened_at DESC, created_at DESC, id DESC LIMIT ?')
      .all(limit) as DailySessionRow[];
    return rows.map((r) => this.#rowToSession(r));
  }

  openSession(draft: OpenSessionDraft): DailySession {
    const openingBalance = Number(draft.openingBalance);
    if (!Number.isFinite(openingBalance) || openingBalance < 0) {
      throw new ObjectDomainError('invalid-input', 'Opening balance must be zero or positive.');
    }
    if (!draft.accountId) {
      throw new ObjectDomainError('invalid-input', 'Account identifier is required to open a register session.');
    }

    const existingOpen = this.getCurrentSession(draft.accountId);
    if (existingOpen) {
      throw new ObjectDomainError(
        'schema-conflict',
        'A daily session is already open for this account. Close it first before opening a new one.',
      );
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    this.database
      .prepare(`
        INSERT INTO shop_daily_sessions (
          id, account_id, status, opening_balance, opened_at, total_sales, total_expenses, total_inflows, total_outflows, created_at, updated_at
        ) VALUES (?, ?, 'open', ?, ?, 0, 0, 0, 0, ?, ?)
      `)
      .run(id, draft.accountId, openingBalance, now, now, now);

    const session = this.getSession(id);
    this.#audit(id, 'created', session);
    return session;
  }

  getExpectedClosing(sessionId: string): SessionExpectedClosing {
    const session = this.getSession(sessionId);

    const movementsRow = this.database
      .prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN movement_type = 'inflow' THEN amount ELSE 0 END), 0) AS inflows,
          COALESCE(SUM(CASE WHEN movement_type = 'outflow' THEN amount ELSE 0 END), 0) AS outflows
        FROM shop_money_movements
        WHERE account_id = ? AND archived_at IS NULL AND created_at >= ?
      `)
      .get(session.accountId, session.openedAt) as { inflows: number; outflows: number };

    const totalsRow = this.database
      .prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN t.transaction_type = 'sale' THEN m.amount ELSE 0 END), 0) AS sales,
          COALESCE(SUM(CASE WHEN t.transaction_type = 'expense' THEN m.amount ELSE 0 END), 0) AS expenses
        FROM shop_money_movements m
        JOIN shop_transactions t ON t.id = m.transaction_id
        WHERE m.account_id = ? AND m.archived_at IS NULL AND m.created_at >= ? AND t.reversed_at IS NULL
      `)
      .get(session.accountId, session.openedAt) as { expenses: number; sales: number };

    const totalInflows = Math.round(movementsRow.inflows * 100) / 100;
    const totalOutflows = Math.round(movementsRow.outflows * 100) / 100;
    const netMovement = Math.round((totalInflows - totalOutflows) * 100) / 100;
    const expectedBalance = Math.round((session.openingBalance + netMovement) * 100) / 100;

    return {
      expectedBalance,
      netMovement,
      openingBalance: session.openingBalance,
      sessionId: session.id,
      totalExpenses: Math.round(totalsRow.expenses * 100) / 100,
      totalInflows,
      totalOutflows,
      totalSales: Math.round(totalsRow.sales * 100) / 100,
    };
  }

  closeSession(draft: CloseSessionDraft): DailySession {
    const session = this.getSession(draft.sessionId);
    if (session.status !== 'open') {
      throw new ObjectDomainError('schema-conflict', 'This daily session is already closed.');
    }

    const actual = Number(draft.actualClosingBalance);
    if (!Number.isFinite(actual) || actual < 0) {
      throw new ObjectDomainError('invalid-input', 'Counted actual closing cash must be zero or positive.');
    }

    const expected = this.getExpectedClosing(session.id);
    const discrepancy = Math.round((actual - expected.expectedBalance) * 100) / 100;

    let reconTxId: string | undefined;

    // If there is a variance between actual cash and expected cash, create an audited adjustment transaction
    if (discrepancy !== 0) {
      const isSurplus = discrepancy > 0;
      const amount = Math.abs(discrepancy);
      const note = draft.discrepancyNote?.trim()
        ? `Daily Reconciliation ${isSurplus ? 'Surplus' : 'Shortage'}: ${draft.discrepancyNote.trim()}`
        : `Daily Reconciliation ${isSurplus ? 'Surplus' : 'Shortage'}`;

      const reconTx = this.transactions.createTransaction({
        movements: [
          {
            accountId: session.accountId,
            amount,
            movementType: isSurplus ? 'inflow' : 'outflow',
          },
        ],
        note,
        paidAmount: amount,
        totalAmount: amount,
        transactionType: 'adjustment',
      });
      reconTxId = reconTx.id;
    }

    const now = new Date().toISOString();

    this.database
      .prepare(`
        UPDATE shop_daily_sessions
        SET status = 'closed',
            closed_at = ?,
            expected_closing_balance = ?,
            actual_closing_balance = ?,
            discrepancy = ?,
            discrepancy_note = ?,
            total_sales = ?,
            total_expenses = ?,
            total_inflows = ?,
            total_outflows = ?,
            reconciliation_transaction_id = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .run(
        now,
        expected.expectedBalance,
        actual,
        discrepancy,
        draft.discrepancyNote?.trim() ?? null,
        expected.totalSales,
        expected.totalExpenses,
        expected.totalInflows,
        expected.totalOutflows,
        reconTxId ?? null,
        now,
        session.id,
      );

    const closed = this.getSession(session.id);
    this.#audit(session.id, 'updated', closed);
    return closed;
  }

  #rowToSession(r: DailySessionRow): DailySession {
    return {
      accountId: r.account_id,
      actualClosingBalance: r.actual_closing_balance ?? undefined,
      closedAt: r.closed_at ?? undefined,
      createdAt: r.created_at,
      discrepancy: r.discrepancy ?? undefined,
      discrepancyNote: r.discrepancy_note ?? undefined,
      expectedClosingBalance: r.expected_closing_balance ?? undefined,
      id: r.id,
      openedAt: r.opened_at,
      openingBalance: r.opening_balance,
      reconciliationTransactionId: r.reconciliation_transaction_id ?? undefined,
      status: r.status,
      totalExpenses: r.total_expenses,
      totalInflows: r.total_inflows,
      totalOutflows: r.total_outflows,
      totalSales: r.total_sales,
      updatedAt: r.updated_at,
    };
  }
}
