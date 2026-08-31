import { describe, expect, it } from 'vitest';

import { phoneShopBlueprint } from '../../shared/starter-blueprints';
import { DatabaseService } from './database-service';

describe('DemoDataService', () => {
  it('atomically prefills a new starter workspace with coherent demo data and pages', () => {
    const database = new DatabaseService(':memory:');
    database.initialize();

    const metadata = database.completeOnboarding({
      backupSchedule: 'daily',
      blueprint: phoneShopBlueprint,
      includeDemoData: true,
      locale: 'en',
      shopName: 'Max Demo',
    });

    expect(metadata.onboardingCompleted).toBe(true);
    expect(database.accounts.listAccounts()).toHaveLength(5);
    expect(database.objects.listRecords('item')).toHaveLength(24);
    expect(database.objects.listRecords('item').every((item) => typeof item.currentQuantity === 'number')).toBe(true);
    expect(database.objects.listRecords('person')).toHaveLength(8);
    expect(database.transactions.listTransactions()).toHaveLength(15);
    expect(database.viewsPages.listPages().map((page) => page.name)).toEqual(['Daily operations', 'Inventory', 'Customers & suppliers', 'Finance']);
    expect(database.viewsPages.listViews()).toHaveLength(3);
    expect(database.search.query('cash count correction')[0]?.kind).toBe('transaction');
    expect(database.search.query('daily operations')[0]?.kind).toBe('page');

    expect(database.seedDemoData('en')).toEqual({ accounts: 0, items: 0, pages: 0, people: 0, transactions: 0 });
    database.close();
  });

  it('adds the demo set once without deleting an existing workspace', () => {
    const database = new DatabaseService(':memory:');
    database.initialize();
    database.completeOnboarding({
      backupSchedule: 'manual',
      blueprint: phoneShopBlueprint,
      includeDemoData: false,
      locale: 'ar',
      shopName: 'متجر العميل',
    });
    database.accounts.createAccount({ accountType: 'cash', initialBalance: 50, name: 'حساب موجود' });

    expect(database.seedDemoData('ar')).toEqual({ accounts: 5, items: 24, pages: 4, people: 8, transactions: 15 });
    expect(database.accounts.listAccounts()).toHaveLength(6);
    expect(database.accounts.listAccounts().some((account) => account.name === 'حساب موجود')).toBe(true);
    expect(database.viewsPages.listPages().map((page) => page.name)).toEqual(['تشغيل اليوم', 'المخزون', 'العملاء والموردون', 'المالية']);
    expect(database.seedDemoData('ar')).toEqual({ accounts: 0, items: 0, pages: 0, people: 0, transactions: 0 });
    database.close();
  });

  it('replaces test junk with the same deterministic demo workspace on every reset', () => {
    const database = new DatabaseService(':memory:');
    database.initialize();
    database.objects.createRecord({ label: 'dddddddd', objectKind: 'item', values: {} });

    expect(database.resetDemoWorkspace('en')).toEqual({ accounts: 5, items: 24, pages: 4, people: 8, transactions: 15 });
    expect(database.search.query('dddddddd')).toEqual([]);
    expect(database.shopMetadata.getMetadata().shopName).toBe('Max Demo Mobile Store');
    expect(database.resetDemoWorkspace('en')).toEqual({ accounts: 5, items: 24, pages: 4, people: 8, transactions: 15 });
    expect(database.objects.listRecords('item')).toHaveLength(24);
    expect(database.transactions.listTransactions()).toHaveLength(15);
    database.close();
  });
});
