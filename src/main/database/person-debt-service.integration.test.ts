import { describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';
import { ObjectDomainError } from './object-repository';

function service(): DatabaseService {
  const db = new DatabaseService(':memory:');
  db.initialize();
  return db;
}

describe('PersonDebtService', () => {
  it('tracks attributable person debt across multiple sales, partial payments, and credit', () => {
    const db = service();
    const cash = db.accounts.createAccount({ accountType: 'cash', initialBalance: 1000, name: 'Cash' });
    const person = db.objects.createRecord({ label: 'Tarek Ahmed', objectKind: 'person', values: {} });

    // 1. Partial sale: Total 500, Paid 200 => Debt 300
    db.transactions.createTransaction({
      movements: [{ accountId: cash.id, amount: 200, movementType: 'inflow' }],
      transactionType: 'sale',
      paidAmount: 200,
      personId: person.id,
      totalAmount: 500,
    });

    let stmt = db.personDebt.getStatement(person.id);
    expect(stmt.summary.receivable).toBe(300);
    expect(stmt.summary.payable).toBe(0);
    expect(stmt.summary.netBalance).toBe(300);
    expect(stmt.unpaidTransactions).toHaveLength(1);

    // 2. Unpaid sale on credit: Total 400 => Debt becomes 700
    db.transactions.createTransaction({
      transactionType: 'sale',
      paidAmount: 0,
      movements: [],
      personId: person.id,
      totalAmount: 400,
    });

    stmt = db.personDebt.getStatement(person.id);
    expect(stmt.summary.receivable).toBe(700);
    expect(stmt.unpaidTransactions).toHaveLength(2);

    // 3. Partial repayment: 250 into cash => Debt becomes 450
    db.personDebt.repayDebt({
      accountId: cash.id,
      amount: 250,
      note: 'Instalment #1',
      personId: person.id,
    });

    stmt = db.personDebt.getStatement(person.id);
    expect(stmt.summary.receivable).toBe(450);
    expect(db.accounts.getAccount(cash.id).balance).toBe(1450); // 1000 + 200 + 250

    // 4. Audited debt forgiveness: 450 forgiven => Debt becomes 0
    const forgiveTx = db.personDebt.forgiveDebt({
      amount: 450,
      personId: person.id,
      reason: 'End-of-year customer settlement',
    });
    expect(forgiveTx.transactionType).toBe('adjustment');

    stmt = db.personDebt.getStatement(person.id);
    expect(stmt.summary.receivable).toBe(0);
    expect(stmt.summary.netBalance).toBe(0);
  });

  it('eliminates debt when a source transaction is reversed', () => {
    const db = service();
    const cash = db.accounts.createAccount({ accountType: 'cash', initialBalance: 500, name: 'Safe' });
    const person = db.objects.createRecord({ label: 'Sara Hassan', objectKind: 'person', values: {} });

    const tx = db.transactions.createTransaction({
      movements: [{ accountId: cash.id, amount: 100, movementType: 'inflow' }],
      transactionType: 'sale',
      paidAmount: 100,
      personId: person.id,
      totalAmount: 600,
    });

    expect(db.personDebt.getStatement(person.id).summary.receivable).toBe(500);

    // Reverse transaction
    db.transactions.reverseTransaction(tx.id, 'Customer returned merchandise');

    expect(db.personDebt.getStatement(person.id).summary.receivable).toBe(0);
    expect(db.accounts.getAccount(cash.id).balance).toBe(500); // 500 + 100 - 100
  });

  it('validates repayment and forgiveness inputs', () => {
    const db = service();
    const person = db.objects.createRecord({ label: 'Test User', objectKind: 'person', values: {} });

    expect(() =>
      db.personDebt.repayDebt({
        accountId: 'acc-1',
        amount: 0,
        personId: person.id,
      }),
    ).toThrowError(ObjectDomainError);

    expect(() =>
      db.personDebt.forgiveDebt({
        amount: 100,
        personId: person.id,
        reason: '',
      }),
    ).toThrowError(ObjectDomainError);
  });
});
