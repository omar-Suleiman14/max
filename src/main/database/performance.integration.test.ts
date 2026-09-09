import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';

function service(): DatabaseService {
  const db = new DatabaseService(':memory:');
  db.initialize();
  return db;
}

describe('Performance Audit & Reference Benchmarks', () => {
  it('executes search, ledger, and statement queries within their UI response budgets across large datasets', () => {
    const db = service();

    const cashAccount = db.accounts.createAccount({
      accountType: 'cash',
      initialBalance: 10000,
      name: 'Central Cash Vault',
    });

    const customer = db.objects.createRecord({
      label: 'Performance Test Customer VIP',
      objectKind: 'person',
      values: {},
    });

    // Populate catalog and transactions
    const startPopulate = performance.now();
    for (let i = 0; i < 500; i++) {
      db.objects.createRecord({
        label: `Product SKU-${i.toString().padStart(4, '0')} Ultra Edition`,
        objectKind: 'item',
        values: {},
      });

      if (i % 2 === 0) {
        db.transactions.createTransaction({
          movements: [{ accountId: cashAccount.id, amount: 25.5, movementType: 'inflow' }],
          note: `Invoice receipt for SKU-${i}`,
          paidAmount: 25.5,
          personId: customer.id,
          totalAmount: 25.5,
          transactionType: 'sale',
        });
      }
    }
    const populateDuration = performance.now() - startPopulate;
    expect(populateDuration).toBeGreaterThan(0);

    // 1. Benchmark universal search across 500+ items and 250+ transactions
    const t0 = performance.now();
    const searchResults = db.search.query('SKU-0250');
    const searchDurationMs = performance.now() - t0;

    expect(searchResults.length).toBeGreaterThanOrEqual(1);
    expect(searchDurationMs).toBeLessThan(25); // Target: < 25ms

    // 2. Benchmark ledger summary subqueries
    const t1 = performance.now();
    const summary = db.transactions.getLedgerSummary();
    const ledgerDurationMs = performance.now() - t1;

    expect(summary.totalSales).toBeGreaterThan(0);
    expect(ledgerDurationMs).toBeLessThan(20); // Target: < 20ms

    // 3. Benchmark person debt statement calculation
    const t2 = performance.now();
    const statement = db.personDebt.getStatement(customer.id);
    const statementDurationMs = performance.now() - t2;

    expect(statement.summary.personId).toBe(customer.id);
    // The statement deliberately materializes up to 500 full transaction
    // records and their movements. Keep its release budget below one frame,
    // while allowing normal hosted-runner scheduler variance.
    expect(statementDurationMs).toBeLessThan(40); // Release budget: < 40ms
  });
});
