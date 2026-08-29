import type { DatabaseSync } from 'node:sqlite';

import type {
  ForgivenessDraft,
  PersonBalanceSummary,
  PersonFinancialStatement,
  RepaymentDraft,
} from '../../shared/person-debt-contract';
import type { TransactionRecord } from '../../shared/transaction-contract';
import { ObjectDomainError } from './object-repository';
import type { TransactionRepository } from './transaction-repository';

export class PersonDebtService {
  constructor(
    private readonly database: DatabaseSync,
    private readonly transactions: TransactionRepository,
  ) {}

  getBalances(): readonly PersonBalanceSummary[] {
    const people = this.database
      .prepare(`
        SELECT id, label
        FROM object_records
        WHERE object_kind = 'person' AND archived_at IS NULL
        ORDER BY label COLLATE NOCASE
      `)
      .all() as { id: string; label: string }[];

    return people.map((p) => {
      const balanceRow = this.database
        .prepare(`
          SELECT
            COALESCE(SUM(CASE WHEN transaction_type = 'sale' THEN (total_amount - paid_amount) ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN transaction_type = 'income' AND (note LIKE 'Debt Repayment%' OR note LIKE 'سداد دين%') THEN paid_amount ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN transaction_type = 'adjustment' AND (note LIKE 'Debt Forgiveness%' OR note LIKE 'إسقاط دين%') THEN total_amount ELSE 0 END), 0)
            AS receivable,
            COALESCE(SUM(CASE WHEN transaction_type IN ('purchase', 'expense') THEN (total_amount - paid_amount) ELSE 0 END), 0)
            AS payable,
            MAX(created_at) AS last_activity
          FROM shop_transactions
          WHERE person_id = ? AND archived_at IS NULL AND reversed_at IS NULL
        `)
        .get(p.id) as { last_activity: string | null; payable: number; receivable: number };

      const receivable = Math.max(0, Math.round(balanceRow.receivable * 100) / 100);
      const payable = Math.max(0, Math.round(balanceRow.payable * 100) / 100);

      return {
        lastActivity: balanceRow.last_activity ?? undefined,
        netBalance: Math.round((receivable - payable) * 100) / 100,
        payable,
        personId: p.id,
        personLabel: p.label,
        receivable,
      };
    });
  }

  getStatement(personId: string): PersonFinancialStatement {
    const person = this.database
      .prepare('SELECT id, label FROM object_records WHERE id = ? AND object_kind = ? AND archived_at IS NULL')
      .get(personId, 'person') as { id: string; label: string } | undefined;

    if (!person) {
      throw new ObjectDomainError('not-found', 'Person record not found.');
    }

    const allBalances = this.getBalances();
    const summary = allBalances.find((b) => b.personId === personId) ?? {
      netBalance: 0,
      payable: 0,
      personId: person.id,
      personLabel: person.label,
      receivable: 0,
    };

    const history = this.transactions
      .listTransactions(500)
      .filter((tx) => tx.personId === personId);

    const unpaidTransactions = history.filter(
      (tx) =>
        (tx.paymentStatus === 'partial' || tx.paymentStatus === 'unpaid') &&
        !tx.reversedAt &&
        tx.transactionType === 'sale',
    );

    return {
      history,
      summary,
      unpaidTransactions,
    };
  }

  repayDebt(draft: RepaymentDraft): TransactionRecord {
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ObjectDomainError('invalid-input', 'Repayment amount must be greater than zero.');
    }
    if (!draft.personId) {
      throw new ObjectDomainError('invalid-input', 'Person identifier is required for debt repayment.');
    }
    if (!draft.accountId) {
      throw new ObjectDomainError('invalid-input', 'Payment account is required for debt repayment.');
    }

    const note = draft.note?.trim() ? `Debt Repayment: ${draft.note.trim()}` : 'Debt Repayment';

    return this.transactions.createTransaction({
      movements: [{ accountId: draft.accountId, amount, movementType: 'inflow' }],
      note,
      paidAmount: amount,
      personId: draft.personId,
      totalAmount: amount,
      transactionType: 'income',
    });
  }

  forgiveDebt(draft: ForgivenessDraft): TransactionRecord {
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ObjectDomainError('invalid-input', 'Forgiveness amount must be greater than zero.');
    }
    const reason = draft.reason.trim();
    if (reason.length < 1) {
      throw new ObjectDomainError('invalid-input', 'A reason is required for debt forgiveness.');
    }
    if (!draft.personId) {
      throw new ObjectDomainError('invalid-input', 'Person identifier is required.');
    }

    return this.transactions.createTransaction({
      movements: [],
      note: `Debt Forgiveness: ${reason}`,
      paidAmount: 0,
      personId: draft.personId,
      totalAmount: amount,
      transactionType: 'adjustment',
    });
  }
}
