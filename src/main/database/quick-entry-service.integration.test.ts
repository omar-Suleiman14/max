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
      operationKind: 'sale',
      paymentMode: 'full',
      totalAmount: 300,
    });
    expect(tx1.paymentStatus).toBe('paid');
    expect(tx1.paidAmount).toBe(300);
    expect(db.accounts.getAccount(cash.id).balance).toBe(800);

    // Partial payment
    const tx2 = db.quickEntry.submit({
      accountId: cash.id,
      operationKind: 'sale',
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
      operationKind: 'sale',
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
        operationKind: 'sale',
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

  it('records audited account adjustments from quick entry in either direction', () => {
    const db = service();
    const cash = db.accounts.createAccount({ accountType: 'cash', initialBalance: 100, name: 'Drawer' });

    const decrease = db.quickEntry.submit({
      accountId: cash.id,
      adjustmentDirection: 'outflow',
      note: 'Count correction',
      operationKind: 'adjustment',
      paymentMode: 'full',
      totalAmount: 12.5,
    });
    expect(decrease.transactionType).toBe('adjustment');
    expect(decrease.movements[0]?.movementType).toBe('outflow');
    expect(db.accounts.getAccount(cash.id).balance).toBe(87.5);

    const increase = db.quickEntry.submit({
      accountId: cash.id,
      adjustmentDirection: 'inflow',
      operationKind: 'adjustment',
      paymentMode: 'full',
      totalAmount: 2.5,
    });
    expect(increase.movements[0]?.movementType).toBe('inflow');
    expect(db.accounts.getAccount(cash.id).balance).toBe(90);
  });

  it('persists an immutable pricing snapshot and all transaction profit amounts', () => {
    const db = service();
    const cash = db.accounts.createAccount({ accountType: 'cash', initialBalance: 0, name: 'Drawer' });
    const baseProfile = {
      active: true,
      components: [
        { base: 'principal', calculation: { fixedAmount: 5, kind: 'fixed' }, chargedTo: 'customer', conditions: [], id: 'provider-fee', label: 'Provider fee', order: 10, priority: 0, rounding: { mode: 'nearest', precision: 2 }, type: 'provider_fee' },
        { base: 'principal', calculation: { fixedAmount: 3, kind: 'fixed' }, chargedTo: 'customer', conditions: [], id: 'profit', label: 'Profit', order: 20, priority: 0, rounding: { mode: 'nearest', precision: 2 }, type: 'profit' },
        { base: 'principal', calculation: { fixedAmount: 2, kind: 'fixed' }, chargedTo: 'provider', conditions: [], id: 'commission', label: 'Commission', order: 30, paidTo: 'shop', priority: 0, rounding: { mode: 'nearest', precision: 2 }, type: 'commission' },
      ],
      currency: 'EGP',
      inputMode: 'customer_pays',
      name: 'Electricity bill',
      provider: 'Fawry',
      service: 'Electricity',
    } as const;
    const profile = db.pricing.createProfile(baseProfile);

    const transaction = db.quickEntry.submit({
      accountId: cash.id,
      operationKind: 'sale',
      paymentMode: 'full',
      pricingProfileId: profile.id,
      providerCost: 505,
      totalAmount: 500,
    });
    expect(transaction.totalAmount).toBe(508);
    expect(transaction.pricing).toMatchObject({
      customerTotal: 508,
      netProfit: 5,
      principalAmount: 500,
      profitMarkup: 3,
      providerCommission: 2,
      providerFee: 5,
      shopNetCost: 503,
    });
    expect(db.accounts.getAccount(cash.id).balance).toBe(508);

    db.pricing.updateProfile(profile.id, {
      ...baseProfile,
      components: baseProfile.components.map((component) => component.id === 'profit'
        ? { ...component, calculation: { fixedAmount: 10, kind: 'fixed' as const } }
        : component),
    });
    const historical = db.transactions.getTransaction(transaction.id);
    expect(historical?.pricing?.profitMarkup).toBe(3);
    expect(historical?.pricing?.snapshot.profile.components.find(({ id }) => id === 'profit')?.calculation).toMatchObject({ fixedAmount: 3 });
  });

  it('resolves service pricing and automatic provider, channel, same-provider, and first-N context', () => {
    const db = service();
    const vodafone = db.pricingCatalog.createProvider({ active: true, name: 'Vodafone' });
    const orange = db.pricingCatalog.createProvider({ active: true, name: 'Orange' });
    const aman = db.pricingCatalog.createChannel({ active: true, name: 'Aman', providerId: vodafone.id });
    const source = db.accounts.createAccount({ accountType: 'wallet', initialBalance: 1_000, name: 'Vodafone Cash', providerId: vodafone.id });
    const destination = db.accounts.createAccount({ accountType: 'wallet', initialBalance: 0, name: 'Orange Cash', providerId: orange.id });
    const base = { base: 'principal', chargedTo: 'customer', order: 10, priority: 0, rounding: { mode: 'nearest', precision: 2 } } as const;
    const profile = db.pricing.createProfile({
      active: true, components: [
        { ...base, calculation: { fixedAmount: 5, kind: 'fixed' }, conditions: [{ field: 'same_provider', operator: 'eq', value: false }], id: 'different-provider-profit', label: 'Different provider profit', type: 'profit' },
        { ...base, calculation: { fixedAmount: 2, kind: 'fixed' }, conditions: [{ field: 'transaction_count', operator: 'gte', value: 3 }], id: 'after-free-fee', label: 'Fee after first two', order: 20, type: 'provider_fee' },
        { ...base, calculation: { fixedAmount: 1, kind: 'fixed' }, conditions: [{ field: 'channel', operator: 'eq', value: 'Aman' }], id: 'aman-fee', label: 'Aman fee', order: 30, type: 'customer_fee' },
        { ...base, calculation: { fixedAmount: 4, kind: 'fixed' }, chargedTo: 'provider', conditions: [{ field: 'source_provider', operator: 'eq', value: 'Vodafone' }, { field: 'destination_provider', operator: 'eq', value: 'Orange' }], id: 'commission', label: 'Commission', order: 40, paidTo: 'shop', type: 'commission' },
      ], currency: 'EGP', inputMode: 'customer_pays', name: 'Wallet routing',
    });
    const pricingService = db.pricingCatalog.createService({
      active: true, category: 'Wallet transfer', channelId: aman.id, defaultInputMode: 'customer_pays', inputLabel: 'Transfer amount',
      inputModes: ['customer_pays'], name: 'Vodafone to Orange', operation: 'transfer', paymentAccountTypes: ['wallet'],
      pricingProfileId: profile.id, providerId: vodafone.id,
    });
    const draft = { accountId: source.id, operationKind: 'transfer', paymentMode: 'full', pricingServiceId: pricingService.id, providerCost: 100, toAccountId: destination.id, totalAmount: 100 } as const;

    const preview = db.quickEntry.previewPricing(draft);
    expect(preview?.totals).toMatchObject({ customerTotal: 106, netProfit: 10, providerFee: 0 });
    const first = db.quickEntry.submit(draft);
    expect(first.pricing).toMatchObject({ profileId: profile.id, serviceId: pricingService.id, profitMarkup: 5, providerCommission: 4 });
    db.quickEntry.submit(draft);
    const third = db.quickEntry.submit(draft);
    expect(third.pricing?.providerFee).toBe(2);
    expect(third.pricing?.snapshot.input.context).toMatchObject({ channel: 'Aman', destinationProvider: 'Orange', sameProvider: false, service: 'Vodafone to Orange', sourceProvider: 'Vodafone', transactionCount: 3 });
  });

  it('rejects invalid inputs atomically', () => {
    const db = service();
    expect(() =>
      db.quickEntry.submit({
        operationKind: 'sale',
        paymentMode: 'full',
        totalAmount: 0,
      }),
    ).toThrowError(ObjectDomainError);
  });
});

it('posts the previewed service cost and receipt and reverses both on undo', () => {
  const db=service();
  const source=db.accounts.createAccount({name:'Wallet',accountType:'wallet',initialBalance:1000,feeConfig:{feeType:'fixed',fixedAmount:99}});
  const destination=db.accounts.createAccount({name:'Cash',accountType:'cash',initialBalance:0});
  const profile=db.pricing.createProfile({active:true,name:'Transfer',currency:'EGP',inputMode:'customer_pays',components:[{id:'fee',label:'Fee',type:'customer_fee',chargedTo:'customer',base:'principal',conditions:[],order:1,priority:0,rounding:{mode:'nearest',precision:2},calculation:{kind:'fixed',fixedAmount:5}}]});
  const draft={accountId:source.id,toAccountId:destination.id,totalAmount:100,paymentMode:'full',operationKind:'transfer',pricingProfileId:profile.id,providerCost:102} as const;
  const quote=db.quickEntry.previewPricing(draft)!;
  const tx=db.quickEntry.submit(draft);
  expect(db.accounts.getAccount(source.id).balance).toBe(1000-quote.totals.shopNetCost);
  expect(db.accounts.getAccount(destination.id).balance).toBe(quote.totals.customerTotal);
  expect(tx.pricing?.netProfit).toBe(3);
  db.transactions.undoTransaction(tx.id);
  expect(db.accounts.getAccount(source.id).balance).toBe(1000);
  expect(db.accounts.getAccount(destination.id).balance).toBe(0);
  expect(db.transactions.getTransaction(tx.id)?.reversedAt).toBeTruthy();
  db.close();
});
it('calculates account transfer fees in the backend and rejects inactive pricing',()=>{
  const db=service();
  const source=db.accounts.createAccount({name:'Wallet',accountType:'wallet',initialBalance:1000,feeConfig:{feeType:'percentage',percentage:1}});
  const destination=db.accounts.createAccount({name:'Cash',accountType:'cash',initialBalance:0});
  const draft={accountId:source.id,toAccountId:destination.id,totalAmount:100,paymentMode:'full',operationKind:'transfer'} as const;
  db.quickEntry.submit(draft);
  expect(db.accounts.getAccount(source.id).balance).toBe(899);
  const profile=db.pricing.createProfile({active:false,name:'Old',currency:'EGP',inputMode:'customer_pays',components:[]});
  expect(()=>db.quickEntry.submit({...draft,pricingProfileId:profile.id})).toThrow('inactive');
  expect(db.accounts.getAccount(source.id).balance).toBe(899);
  db.close();
});
