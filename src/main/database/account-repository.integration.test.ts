import { describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';
import { ObjectDomainError } from './object-repository';

function service(): DatabaseService {
  const db = new DatabaseService(':memory:');
  db.initialize();
  return db;
}

describe('AccountRepository', () => {
  it('creates and lists accounts with initial opening balance', () => {
    const db = service();
    const cash = db.accounts.createAccount({
      accountType: 'cash',
      initialBalance: 1500,
      name: 'Cash Drawer',
    });
    const bank = db.accounts.createAccount({
      accountType: 'bank',
      initialBalance: 10000,
      name: 'CIB Bank',
    });

    expect(cash.name).toBe('Cash Drawer');
    expect(cash.accountType).toBe('cash');
    expect(cash.balance).toBe(1500);

    const list = db.accounts.listAccounts();
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe(cash.id);
    expect(list[1]?.id).toBe(bank.id);
  });

  it('enforces active name uniqueness', () => {
    const db = service();
    db.accounts.createAccount({
      accountType: 'cash',
      initialBalance: 0,
      name: 'Safe',
    });

    expect(() =>
      db.accounts.createAccount({
        accountType: 'cash',
        initialBalance: 100,
        name: 'safe',
      }),
    ).toThrowError(ObjectDomainError);
  });

  it('updates account details and validates inputs', () => {
    const db = service();
    const acc = db.accounts.createAccount({
      accountType: 'wallet',
      initialBalance: 50,
      name: 'Vodafone Cash',
    });

    const updated = db.accounts.updateAccount(acc.id, {
      accountType: 'wallet',
      initialBalance: 100,
      name: 'InstaPay Wallet',
    });

    expect(updated.name).toBe('InstaPay Wallet');
    expect(updated.initialBalance).toBe(100);
  });

  it('archives account and allows reusing the name', () => {
    const db = service();
    const acc = db.accounts.createAccount({
      accountType: 'cash',
      initialBalance: 0,
      name: 'Temporary Box',
    });

    db.accounts.archiveAccount(acc.id);
    expect(db.accounts.listAccounts()).toHaveLength(0);

    // Reusing the name after archive is permitted
    const recreated = db.accounts.createAccount({
      accountType: 'cash',
      initialBalance: 200,
      name: 'Temporary Box',
    });
    expect(recreated.name).toBe('Temporary Box');
  });
});
