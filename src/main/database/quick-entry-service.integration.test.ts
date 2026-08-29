import { describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';
import { ObjectDomainError } from './object-repository';

function service(): DatabaseService {
  const db = new DatabaseService(':memory:');
  db.initialize();
  return db;
}

describe('QuickEntryService', () => {
  it('resolves price precedence: explicit item price > template default > historical last > none', () => {
    const db = service();

    const priceProp = db.objects.createProperty({
      name: 'Selling Price',
      objectKind: 'item',
      rules: { choices: [], digitsOnly: false, minimum: 0, required: false, unique: false },
      type: 'money',
    });

    const itemWithPrice = db.objects.createRecord({
      label: 'iPhone 15 Case',
      objectKind: 'item',
      values: { [priceProp.id]: 250 },
    });

    const itemWithoutPrice = db.objects.createRecord({
      label: 'USB-C Cable',
      objectKind: 'item',
      values: {},
    });

    const templateWithDefault = db.templates.createTemplate({
      defaults: { 'Selling Price': 80 },
      fieldOrder: [priceProp.id],
      name: 'Standard Cable',
      objectKind: 'item',
      progressive: [],
    });

    // 1. Explicit item price
    const s1 = db.quickEntry.getSuggestion(itemWithPrice.id, templateWithDefault.id);
    expect(s1.amount).toBe(250);
    expect(s1.source).toBe('item-price');

    // 2. Template default
    const s2 = db.quickEntry.getSuggestion(itemWithoutPrice.id, templateWithDefault.id);
    expect(s2.amount).toBe(80);
    expect(s2.source).toBe('template-default');

    // 3. Historical last transaction
    const cash = db.accounts.createAccount({ accountType: 'cash', initialBalance: 1000, name: 'Cash' });
    const itemUntemplated = db.objects.createRecord({ label: 'Screen Protector', objectKind: 'item', values: {} });

    db.transactions.createTransaction({
      itemId: itemUntemplated.id,
      movements: [{ accountId: cash.id, amount: 120, movementType: 'inflow' }],
      note: 'Sold Screen Protector',
      paidAmount: 120,
      totalAmount: 120,
      transactionType: 'sale',
    });

    const s3 = db.quickEntry.getSuggestion(itemUntemplated.id);
    expect(s3.amount).toBe(120);
    expect(s3.source).toBe('historical-last');

    // 4. None / Blank
    const unrecordedItem = db.objects.createRecord({ label: 'Unknown Gadget', objectKind: 'item', values: {} });
    const s4 = db.quickEntry.getSuggestion(unrecordedItem.id);
    expect(s4.amount).toBeNull();
    expect(s4.source).toBe('none');
  });

  it('submits quick entry across full, partial, and later payment modes', () => {
    const db = service();
    const cash = db.accounts.createAccount({ accountType: 'cash', initialBalance: 500, name: 'Drawer' });
    const customer = db.objects.createRecord({ label: 'Mohamed Ali', objectKind: 'person', values: {} });

    // Full payment
    const tx1 = db.quickEntry.submit({
      accountId: cash.id,
      paymentMode: 'full',
      totalAmount: 300,
    });
    expect(tx1.paymentStatus).toBe('paid');
    expect(tx1.paidAmount).toBe(300);
    expect(db.accounts.getAccount(cash.id).balance).toBe(800);

    // Partial payment
    const tx2 = db.quickEntry.submit({
      accountId: cash.id,
      paidAmount: 150,
      paymentMode: 'partial',
      personId: customer.id,
      totalAmount: 500,
    });
    expect(tx2.paymentStatus).toBe('partial');
    expect(tx2.paidAmount).toBe(150);
    expect(tx2.totalAmount).toBe(500);
    expect(db.accounts.getAccount(cash.id).balance).toBe(950);

    // Later / Unpaid payment
    const tx3 = db.quickEntry.submit({
      paymentMode: 'later',
      personId: customer.id,
      totalAmount: 400,
    });
    expect(tx3.paymentStatus).toBe('unpaid');
    expect(tx3.paidAmount).toBe(0);
    expect(tx3.movements).toHaveLength(0);
    expect(db.accounts.getAccount(cash.id).balance).toBe(950);
  });

  it('runs a 100-transaction endurance simulation and verifies zero balance drift', () => {
    const db = service();
    const cash = db.accounts.createAccount({ accountType: 'cash', initialBalance: 10000, name: 'Main Safe' });
    const item = db.objects.createRecord({ label: 'Fast Moving Item', objectKind: 'item', values: {} });

    let expectedCash = 10000;

    for (let i = 1; i <= 100; i++) {
      const amount = 50 + (i % 20) * 10;
      db.quickEntry.submit({
        accountId: cash.id,
        itemId: item.id,
        note: `Endurance Sale #${i}`,
        paymentMode: 'full',
        totalAmount: amount,
      });
      expectedCash += amount;
    }

    const currentAccount = db.accounts.getAccount(cash.id);
    expect(currentAccount.balance).toBe(expectedCash);

    const summary = db.transactions.getLedgerSummary();
    expect(summary.totalCash).toBe(expectedCash);
    expect(summary.totalSales).toBe(expectedCash - 10000);
  });

  it('rejects invalid inputs atomically', () => {
    const db = service();
    expect(() =>
      db.quickEntry.submit({
        paymentMode: 'full',
        totalAmount: 0,
      }),
    ).toThrowError(ObjectDomainError);
  });
});
