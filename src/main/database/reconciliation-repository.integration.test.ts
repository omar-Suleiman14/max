import { describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';

function service(): DatabaseService {
  const db = new DatabaseService(':memory:');
  db.initialize();
  return db;
}

describe('ReconciliationRepository', () => {
  it('opens a daily drawer session, validates non-negative starting cash, and prevents duplicate active sessions', () => {
    const db = service();

    const drawer = db.accounts.createAccount({
      accountType: 'cash',
      initialBalance: 500,
      name: 'Front Register Drawer',
    });

    const session = db.reconciliation.openSession({
      accountId: drawer.id,
      openingBalance: 500,
    });

    expect(session.status).toBe('open');
    expect(session.openingBalance).toBe(500);
    expect(session.accountId).toBe(drawer.id);

    const current = db.reconciliation.getCurrentSession(drawer.id);
    expect(current?.id).toBe(session.id);

    expect(() =>
      db.reconciliation.openSession({
        accountId: drawer.id,
        openingBalance: 500,
      }),
    ).toThrow('A daily session is already open for this account');
  });

  it('calculates expected closing cash from day sales, inflows, and expenses accurately', () => {
    const db = service();

    const drawer = db.accounts.createAccount({
      accountType: 'cash',
      initialBalance: 1000,
      name: 'Main Drawer',
    });

    const session = db.reconciliation.openSession({
      accountId: drawer.id,
      openingBalance: 1000,
    });

    // 1. Sale: +450 cash
    db.transactions.createTransaction({
      movements: [{ accountId: drawer.id, amount: 450, movementType: 'inflow' }],
      note: 'Day Sale #1',
      paidAmount: 450,
      totalAmount: 450,
      transactionType: 'sale',
    });

    // 2. Expense: -120 cash
    db.transactions.createTransaction({
      movements: [{ accountId: drawer.id, amount: 120, movementType: 'outflow' }],
      note: 'Cleaning supplies',
      paidAmount: 120,
      totalAmount: 120,
      transactionType: 'expense',
    });

    const expected = db.reconciliation.getExpectedClosing(session.id);
    expect(expected.openingBalance).toBe(1000);
    expect(expected.totalInflows).toBe(450);
    expect(expected.totalOutflows).toBe(120);
    expect(expected.totalSales).toBe(450);
    expect(expected.totalExpenses).toBe(120);
    expect(expected.expectedBalance).toBe(1330);
  });

  it('closes session with perfect match (zero discrepancy) cleanly', () => {
    const db = service();

    const drawer = db.accounts.createAccount({
      accountType: 'cash',
      initialBalance: 800,
      name: 'Drawer A',
    });

    const session = db.reconciliation.openSession({
      accountId: drawer.id,
      openingBalance: 800,
    });

    db.transactions.createTransaction({
      movements: [{ accountId: drawer.id, amount: 200, movementType: 'inflow' }],
      paidAmount: 200,
      totalAmount: 200,
      transactionType: 'sale',
    });

    const closed = db.reconciliation.closeSession({
      actualClosingBalance: 1000,
      sessionId: session.id,
    });

    expect(closed.status).toBe('closed');
    expect(closed.expectedClosingBalance).toBe(1000);
    expect(closed.actualClosingBalance).toBe(1000);
    expect(closed.discrepancy).toBe(0);
    expect(closed.reconciliationTransactionId).toBeUndefined();

    expect(db.reconciliation.getCurrentSession(drawer.id)).toBeNull();
  });

  it('reconciles cash shortage with audited adjustment transaction and records explanation note', () => {
    const db = service();

    const drawer = db.accounts.createAccount({
      accountType: 'cash',
      initialBalance: 1000,
      name: 'Drawer B',
    });

    const session = db.reconciliation.openSession({
      accountId: drawer.id,
      openingBalance: 1000,
    });

    // Sale: +500 -> Expected 1500
    db.transactions.createTransaction({
      movements: [{ accountId: drawer.id, amount: 500, movementType: 'inflow' }],
      paidAmount: 500,
      totalAmount: 500,
      transactionType: 'sale',
    });

    // Counted actual: 1460 (Shortage of 40)
    const closed = db.reconciliation.closeSession({
      actualClosingBalance: 1460,
      discrepancyNote: 'Missing cash due to change error',
      sessionId: session.id,
    });

    expect(closed.status).toBe('closed');
    expect(closed.expectedClosingBalance).toBe(1500);
    expect(closed.actualClosingBalance).toBe(1460);
    expect(closed.discrepancy).toBe(-40);
    expect(closed.discrepancyNote).toBe('Missing cash due to change error');
    expect(closed.reconciliationTransactionId).toBeDefined();

    // Verify audited adjustment transaction was created
    const adjTx = db.transactions.getTransaction(closed.reconciliationTransactionId!);
    expect(adjTx).toBeDefined();
    expect(adjTx?.transactionType).toBe('adjustment');
    expect(adjTx?.totalAmount).toBe(40);
    expect(adjTx?.movements[0]?.movementType).toBe('outflow');

    // Verify account balance is adjusted to 1460
    const refreshedDrawer = db.accounts.getAccount(drawer.id);
    expect(refreshedDrawer.balance).toBe(1460);
  });

  it('lists historical daily sessions chronologically', () => {
    const db = service();

    const drawer = db.accounts.createAccount({
      accountType: 'cash',
      initialBalance: 200,
      name: 'Drawer C',
    });

    const s1 = db.reconciliation.openSession({ accountId: drawer.id, openingBalance: 200 });
    db.reconciliation.closeSession({ actualClosingBalance: 200, sessionId: s1.id });

    const s2 = db.reconciliation.openSession({ accountId: drawer.id, openingBalance: 200 });
    db.reconciliation.closeSession({ actualClosingBalance: 210, discrepancyNote: 'Surplus', sessionId: s2.id });

    const history = db.reconciliation.listSessions();
    expect(history.length).toBe(2);
    expect(history[0]?.id).toBe(s2.id);
    expect(history[1]?.id).toBe(s1.id);
  });
});
