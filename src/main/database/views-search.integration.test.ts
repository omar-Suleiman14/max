import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';
import { normalizeSearchText } from './search-service';

function service(): DatabaseService {
  const db = new DatabaseService(':memory:');
  db.initialize();
  return db;
}

describe('ViewsPagesRepository & SearchService', () => {
  it('creates, lists, updates, and archives saved views with audit trail', () => {
    const db = service();

    const view = db.viewsPages.createView({
      filterRules: [{ field: 'label', operator: 'contains', value: 'Pro' }],
      name: 'Pro Items',
      sortRules: [{ direction: 'asc', field: 'label' }],
      targetKind: 'item',
    });

    expect(view.name).toBe('Pro Items');
    expect(view.targetKind).toBe('item');
    expect(view.filterRules).toHaveLength(1);

    const list = db.viewsPages.listViews('item');
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(view.id);

    const updated = db.viewsPages.updateView(view.id, {
      name: 'Pro & Max Items',
      targetKind: 'item',
    });
    expect(updated.name).toBe('Pro & Max Items');

    db.viewsPages.archiveView(view.id);
    expect(db.viewsPages.listViews('item')).toHaveLength(0);

    const audit = db.objects.listAudit(view.id);
    expect(audit.length).toBeGreaterThanOrEqual(3);
  });

  it('creates, lists, and manages custom pages', () => {
    const db = service();

    const page = db.viewsPages.createPage({
      icon: 'dashboard',
      layoutJson: JSON.stringify({ widgets: ['sales-summary', 'recent-debts'] }),
      name: 'Daily Executive Dashboard',
    });

    expect(page.name).toBe('Daily Executive Dashboard');
    expect(db.viewsPages.listPages()).toHaveLength(1);

    db.viewsPages.updatePage(page.id, {
      layoutJson: JSON.stringify({ widgets: ['sales-summary'] }),
      name: 'Updated Dashboard',
    });

    expect(db.viewsPages.getPage(page.id).name).toBe('Updated Dashboard');

    db.viewsPages.archivePage(page.id);
    expect(db.viewsPages.listPages()).toHaveLength(0);
    expect(db.viewsPages.listArchivedPages()[0]?.id).toBe(page.id);
    expect(db.viewsPages.restorePage(page.id).id).toBe(page.id);
    expect(db.viewsPages.listPages()[0]?.name).toBe('Updated Dashboard');

    db.viewsPages.archivePage(page.id);
    db.viewsPages.emptyPageTrash();
    expect(db.viewsPages.listArchivedPages()).toEqual([]);
  });

  it('normalizes Arabic and English search terms ignoring diacritics and letter variants', () => {
    expect(normalizeSearchText('أَحْمَدُ')).toBe('احمد');
    expect(normalizeSearchText('شَاشَةٌ')).toBe('شاشه');
    expect(normalizeSearchText('مُصْطَفَى')).toBe('مصطفي');
    expect(normalizeSearchText('  iPhone 15 Pro Max  ')).toBe('iphone 15 pro max');
  });

  it('performs universal search across items, people, accounts, and transactions with normalized matches', () => {
    const db = service();

    // Create item with Arabic diacritics
    db.objects.createRecord({
      label: 'شَاشَةُ حِمَايَةٍ 6.7',
      objectKind: 'item',
      values: {},
    });

    // Create customer
    const customer = db.objects.createRecord({
      label: 'أَحْمَدُ إِبْرَاهِيم',
      objectKind: 'person',
      values: {},
    });

    // Create account
    const bank = db.accounts.createAccount({
      accountType: 'bank',
      initialBalance: 5000,
      name: 'CIB Corporate',
    });

    // Create transaction
    db.transactions.createTransaction({
      movements: [{ accountId: bank.id, amount: 850, movementType: 'inflow' }],
      note: 'Samsung S24 Ultra Glass repair',
      paidAmount: 850,
      personId: customer.id,
      totalAmount: 850,
      transactionType: 'sale',
    });

    // 1. Search Arabic item without diacritics
    const r1 = db.search.query('شاشه');
    expect(r1.length).toBeGreaterThanOrEqual(1);
    expect(r1[0]?.kind).toBe('item');

    // 2. Search Arabic person with plain alif
    const r2 = db.search.query('احمد ابراهيم');
    expect(r2.length).toBeGreaterThanOrEqual(1);
    expect(r2[0]?.kind).toBe('person');

    // 3. Search account
    const r3 = db.search.query('cib');
    expect(r3.length).toBeGreaterThanOrEqual(1);
    expect(r3[0]?.kind).toBe('account');

    // 4. Search transaction note
    const r4 = db.search.query('s24 ultra');
    expect(r4.length).toBeGreaterThanOrEqual(1);
    expect(r4[0]?.kind).toBe('transaction');
  });

  it('updates the persistent index incrementally when configurable values change or records are archived', () => {
    const db = service();
    const sku = db.objects.createProperty({
      name: 'SKU',
      objectKind: 'item',
      rules: { choices: [], digitsOnly: false, required: false, unique: true },
      type: 'text',
    });
    const item = db.objects.createRecord({ label: 'Travel Charger', objectKind: 'item', values: { [sku.id]: 'FAST-CHARGE-65W' } });

    expect(db.search.query('fast-charge')[0]?.id).toBe(item.id);
    db.objects.updateRecord(item.id, { label: 'Travel Charger', objectKind: 'item', values: { [sku.id]: 'GAN-CHARGE-90W' } });
    expect(db.search.query('fast-charge')).toEqual([]);
    expect(db.search.query('gan-charge')[0]?.id).toBe(item.id);

    db.objects.archiveRecord(item.id);
    expect(db.search.query('gan-charge')).toEqual([]);
  });

  it('keeps indexed documents searchable across database restarts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'max-search-index-'));
    const filename = join(directory, 'max.sqlite');
    try {
      const first = new DatabaseService(filename);
      first.initialize();
      const account = first.accounts.createAccount({ accountType: 'wallet', initialBalance: 100, name: 'Persistent Wallet' });
      expect(first.search.query('persistent')[0]?.id).toBe(account.id);
      first.close();

      const second = new DatabaseService(filename);
      second.initialize();
      expect(second.search.query('persistent')[0]?.id).toBe(account.id);
      second.close();
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('keeps a restored page and its original identity across database restarts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'max-page-trash-'));
    const filename = join(directory, 'max.sqlite');
    try {
      const first = new DatabaseService(filename);
      first.initialize();
      const page = first.viewsPages.createPage({ layoutJson: '{"blocks":[]}', name: 'Client checklist' });
      first.viewsPages.archivePage(page.id);
      first.close();

      const second = new DatabaseService(filename);
      second.initialize();
      expect(second.viewsPages.listArchivedPages()[0]?.id).toBe(page.id);
      expect(second.viewsPages.restorePage(page.id).id).toBe(page.id);
      second.close();

      const third = new DatabaseService(filename);
      third.initialize();
      expect(third.viewsPages.listPages()[0]?.id).toBe(page.id);
      expect(third.viewsPages.listPages()[0]?.name).toBe('Client checklist');
      third.close();
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
