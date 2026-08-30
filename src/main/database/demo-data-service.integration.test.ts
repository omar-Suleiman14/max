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
    expect(database.accounts.listAccounts()).toHaveLength(3);
    expect(database.objects.listRecords('item')).toHaveLength(3);
    expect(database.objects.listRecords('person')).toHaveLength(3);
    expect(database.transactions.listTransactions()).toHaveLength(7);
    expect(database.viewsPages.listPages().map((page) => page.name)).toEqual(['Daily operations', 'Sales & inventory']);
    expect(database.viewsPages.listViews()).toHaveLength(2);
    expect(database.search.query('opening cash count')[0]?.kind).toBe('transaction');
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

    expect(database.seedDemoData('ar')).toEqual({ accounts: 3, items: 3, pages: 2, people: 3, transactions: 7 });
    expect(database.accounts.listAccounts()).toHaveLength(4);
    expect(database.accounts.listAccounts().some((account) => account.name === 'حساب موجود')).toBe(true);
    expect(database.viewsPages.listPages().map((page) => page.name)).toEqual(['تشغيل اليوم', 'المبيعات والمخزون']);
    expect(database.seedDemoData('ar')).toEqual({ accounts: 0, items: 0, pages: 0, people: 0, transactions: 0 });
    database.close();
  });
});
