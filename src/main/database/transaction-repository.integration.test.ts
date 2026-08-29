import { describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';
import { ObjectDomainError } from './object-repository';

function service(): DatabaseService {
  const db = new DatabaseService(':memory:');
  db.initialize();
  return db;
}

describe('TransactionRepository', () => {
  it('creates paid sale transaction and updates account balance with inflow movement', () => {
    const db = service();
    const cash = db.accounts.createAccount({
      accountType: 'cash',
      initialBalance: 1000,
      name: 'Cash Drawer',
    });

    const tx = db.transactions.createTransaction({
      movements: [{ accountId: cash.id, amount: 250, movementType: 'inflow' }],
      note: 'Sold iPhone Case',
      paidAmount: 250,
      totalAmount: 250,
      transactionType: 'sale',
    });

    expect(tx.paymentStatus).toBe('paid');
    expect(tx.movements).toHaveLength(1);
    expect(tx.movements[0]?.amount).toBe(250);
    expect(tx.movements[0]?.movementType).toBe('inflow');

    // Balance reflects the inflow
    const updatedAccount = db.accounts.getAccount(cash.id);
    expect(updatedAccount.balance).toBe(1250);
  });

  it('creates paid expense transaction and decreases account balance with outflow movement', () => {
    const db = service();
    const bank = db.accounts.createAccount({
      accountType: 'bank',
      initialBalance: 5000,
      name: 'Bank Account',
    });

    const tx = db.transactions.createTransaction({
      movements: [{ accountId: bank.id, amount: 800, movementType: 'outflow' }],
      note: 'Shop Electricity Bill',
      paidAmount: 800,
      totalAmount: 800,
      transactionType: 'expense',
    });

    expect(tx.paymentStatus).toBe('paid');
    expect(db.accounts.getAccount(bank.id).balance).toBe(4200);
  });

  it('handles partial and unpaid transactions correctly', () => {
    const db = service();
    const cash = db.accounts.createAccount({
      accountType: 'cash',
      initialBalance: 0,
      name: 'Cash',
    });

    // Partial sale: total 1000, paid 400 now
    const partialTx = db.transactions.createTransaction({
      movements: [{ accountId: cash.id, amount: 400, movementType: 'inflow' }],
      note: 'Repair Deposit',
      paidAmount: 400,
      totalAmount: 1000,
      transactionType: 'sale',
    });
    expect(partialTx.paymentStatus).toBe('partial');
    expect(db.accounts.getAccount(cash.id).balance).toBe(400);

    // Unpaid sale: total 500, paid 0 (on credit)
    const unpaidTx = db.transactions.createTransaction({
      movements: [],
      note: 'Screen repair on credit',
      paidAmount: 0,
      totalAmount: 500,
      transactionType: 'sale',
    });
    expect(unpaidTx.paymentStatus).toBe('unpaid');
    expect(unpaidTx.movements).toHaveLength(0);
    expect(db.accounts.getAccount(cash.id).balance).toBe(400);
  });

  it('creates atomic transfers between accounts without altering revenue totals', () => {
    const db = service();
    const cash = db.accounts.createAccount({
      accountType: 'cash',
      initialBalance: 3000,
      name: 'Cash Drawer',
    });
    const bank = db.accounts.createAccount({
      accountType: 'bank',
      initialBalance: 10000,
      name: 'Bank Safe',
    });

    const transfer = db.transactions.createTransfer({
      amount: 1500,
      fromAccountId: cash.id,
      note: 'End-of-day bank deposit',
      toAccountId: bank.id,
    });

    expect(transfer.transactionType).toBe('transfer');
    expect(transfer.totalAmount).toBe(1500);
    expect(transfer.movements).toHaveLength(2);

    expect(db.accounts.getAccount(cash.id).balance).toBe(1500);
    expect(db.accounts.getAccount(bank.id).balance).toBe(11500);

    const summary = db.transactions.getLedgerSummary();
    expect(summary.totalOverall).toBe(13000);
    expect(summary.totalSales).toBe(0);
    expect(summary.totalExpenses).toBe(0);
  });

  it('reverses transactions with audited counter-records and restorative money movements', () => {
    const db = service();
    const cash = db.accounts.createAccount({
      accountType: 'cash',
      initialBalance: 1000,
      name: 'Cash Drawer',
    });

    const original = db.transactions.createTransaction({
      movements: [{ accountId: cash.id, amount: 600, movementType: 'inflow' }],
      note: 'Mistyped Sale',
      paidAmount: 600,
      totalAmount: 600,
      transactionType: 'sale',
    });
    expect(db.accounts.getAccount(cash.id).balance).toBe(1600);

    const reversal = db.transactions.reverseTransaction(original.id, 'Wrong product selected');
    expect(reversal.transactionType).toBe('reversal');
    expect(reversal.reversalOfId).toBe(original.id);
    expect(reversal.movements[0]?.movementType).toBe('outflow');
    expect(reversal.movements[0]?.amount).toBe(600);

    // Original is marked reversed
    const refreshedOriginal = db.transactions.getTransaction(original.id);
    expect(refreshedOriginal?.reversedAt).toBeTruthy();

    // Balance restored back to 1000
    expect(db.accounts.getAccount(cash.id).balance).toBe(1000);

    // Double reversal is disallowed
    expect(() => db.transactions.reverseTransaction(original.id)).toThrowError(ObjectDomainError);
    expect(() => db.transactions.reverseTransaction(reversal.id)).toThrowError(ObjectDomainError);
  });

  it('supports soft-undo of recent transactions', () => {
    const db = service();
    const cash = db.accounts.createAccount({
      accountType: 'cash',
      initialBalance: 500,
      name: 'Drawer',
    });

    const tx = db.transactions.createTransaction({
      movements: [{ accountId: cash.id, amount: 150, movementType: 'inflow' }],
      note: 'Accidental click',
      paidAmount: 150,
      totalAmount: 150,
      transactionType: 'sale',
    });
    expect(db.accounts.getAccount(cash.id).balance).toBe(650);

    db.transactions.undoTransaction(tx.id);
    expect(db.transactions.getTransaction(tx.id)).toBeNull();
    expect(db.accounts.getAccount(cash.id).balance).toBe(500);
  });

  it('calculates comprehensive ledger summary across account types and transaction classes', () => {
    const db = service();
    const cash = db.accounts.createAccount({
      accountType: 'cash',
      initialBalance: 1000,
      name: 'Cash',
    });
    const bank = db.accounts.createAccount({
      accountType: 'bank',
      initialBalance: 5000,
      name: 'Bank',
    });
    const wallet = db.accounts.createAccount({
      accountType: 'wallet',
      initialBalance: 200,
      name: 'Wallet',
    });

    db.transactions.createTransaction({
      movements: [{ accountId: cash.id, amount: 300, movementType: 'inflow' }],
      note: 'Sale 1',
      paidAmount: 300,
      totalAmount: 300,
      transactionType: 'sale',
    });

    db.transactions.createTransaction({
      movements: [{ accountId: bank.id, amount: 120, movementType: 'outflow' }],
      note: 'Expense 1',
      paidAmount: 120,
      totalAmount: 120,
      transactionType: 'expense',
    });

    db.transactions.createTransaction({
      movements: [{ accountId: wallet.id, amount: 50, movementType: 'inflow' }],
      note: 'Wallet Topup Income',
      paidAmount: 50,
      totalAmount: 50,
      transactionType: 'income',
    });

    const summary = db.transactions.getLedgerSummary();
    expect(summary.totalCash).toBe(1300);
    expect(summary.totalBank).toBe(4880);
    expect(summary.totalWallet).toBe(250);
    expect(summary.totalOverall).toBe(6430);
    expect(summary.totalSales).toBe(350);
    expect(summary.totalExpenses).toBe(120);
  });

  it('rejects invalid transaction drafts and mismatched movement totals', () => {
    const db = service();
    const cash = db.accounts.createAccount({
      accountType: 'cash',
      initialBalance: 100,
      name: 'Cash',
    });

    // Mismatched movement amount: paid 200, movement 150
    expect(() =>
      db.transactions.createTransaction({
        movements: [{ accountId: cash.id, amount: 150, movementType: 'inflow' }],
        paidAmount: 200,
        totalAmount: 200,
        transactionType: 'sale',
      }),
    ).toThrowError(ObjectDomainError);

    // Paid amount exceeds total amount
    expect(() =>
      db.transactions.createTransaction({
        movements: [{ accountId: cash.id, amount: 300, movementType: 'inflow' }],
        paidAmount: 300,
        totalAmount: 200,
        transactionType: 'sale',
      }),
    ).toThrowError(ObjectDomainError);
  });
});
