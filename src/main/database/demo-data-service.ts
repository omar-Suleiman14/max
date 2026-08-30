import type { DatabaseSync } from 'node:sqlite';

import type { DemoSeedSummary } from '../../shared/ipc-contract';
import type { PropertyValue } from '../../shared/object-contract';
import type { AccountRepository } from './account-repository';
import type { ObjectRepository } from './object-repository';
import type { TemplateRepository } from './template-repository';
import type { TransactionRepository } from './transaction-repository';
import type { ViewsPagesRepository } from './views-pages-repository';

export class DemoDataService {
  constructor(
    private readonly database: DatabaseSync,
    private readonly accounts: AccountRepository,
    private readonly objects: ObjectRepository,
    private readonly templates: TemplateRepository,
    private readonly transactions: TransactionRepository,
    private readonly viewsPages: ViewsPagesRepository,
  ) {}

  seed(locale: 'ar' | 'en' = 'en'): DemoSeedSummary {
    const ar = locale === 'ar';
    const existingSeed = this.database
      .prepare("SELECT value FROM app_metadata WHERE key = 'demo.seed.version'")
      .get();
    if (existingSeed) {
      return { accounts: 0, items: 0, pages: 0, people: 0, transactions: 0 };
    }

    const itemProperties = new Map(this.objects.listProperties('item').map((property) => [property.name, property.id]));
    const personProperties = new Map(this.objects.listProperties('person').map((property) => [property.name, property.id]));
    const itemTemplates = this.templates.listTemplates('item');
    const personTemplates = this.templates.listTemplates('person');
    const values = (properties: ReadonlyMap<string, string>, source: Readonly<Record<string, PropertyValue>>) =>
      Object.fromEntries(
        Object.entries(source)
          .map(([name, value]) => [properties.get(name), value] as const)
          .filter((entry): entry is readonly [string, PropertyValue] => Boolean(entry[0])),
      );

    const cash = this.accounts.createAccount({ accountType: 'cash', initialBalance: 2_500, name: ar ? 'الخزينة الرئيسية' : 'Main Cash Drawer' });
    const wallet = this.accounts.createAccount({ accountType: 'wallet', initialBalance: 1_250, name: ar ? 'فودافون كاش' : 'Vodafone Cash' });
    const bank = this.accounts.createAccount({ accountType: 'bank', initialBalance: 50_000, name: ar ? 'حساب المتجر البنكي' : 'Business Bank' });

    const iphone = this.objects.createRecord({
      label: 'iPhone 15 Pro 256GB', objectKind: 'item',
      templateId: itemTemplates.find((template) => template.name === 'New Phone')?.id,
      values: values(itemProperties, { Brand: 'Apple', Condition: 'Brand New', 'Cost Price': 41_000, IMEI: '356789012345678', Model: 'iPhone 15 Pro 256GB', 'Selling Price': 48_000 }),
    });
    const samsung = this.objects.createRecord({
      label: 'Samsung Galaxy S24 Ultra', objectKind: 'item',
      templateId: itemTemplates.find((template) => template.name === 'New Phone')?.id,
      values: values(itemProperties, { Brand: 'Samsung', Condition: 'Brand New', 'Cost Price': 34_500, IMEI: '352345678901234', Model: 'Galaxy S24 Ultra', 'Selling Price': 39_900 }),
    });
    const protector = this.objects.createRecord({
      label: 'Premium Screen Protector', objectKind: 'item',
      templateId: itemTemplates.find((template) => template.name === 'Accessory / Case')?.id,
      values: values(itemProperties, { Brand: 'Other', 'Cost Price': 90, Model: '6.7 inch glass', 'Selling Price': 350 }),
    });

    const ahmed = this.objects.createRecord({
      label: 'Ahmed Ibrahim', objectKind: 'person',
      templateId: personTemplates.find((template) => template.name === 'Customer')?.id,
      values: values(personProperties, { Notes: 'Repeat customer · Downtown branch', 'Phone Number': '01012345678', Type: 'Customer' }),
    });
    const sara = this.objects.createRecord({
      label: 'Sara Mohamed', objectKind: 'person',
      templateId: personTemplates.find((template) => template.name === 'Customer')?.id,
      values: values(personProperties, { Notes: 'Prefers WhatsApp receipts', 'Phone Number': '01198765432', Type: 'Customer' }),
    });
    const supplier = this.objects.createRecord({
      label: 'Cairo Mobile Supply', objectKind: 'person',
      templateId: personTemplates.find((template) => template.name === 'Supplier')?.id,
      values: values(personProperties, { Notes: 'Weekly accessories delivery', 'Phone Number': '0223456789', Type: 'Supplier' }),
    });

    this.transactions.createTransaction({ itemId: protector.id, movements: [{ accountId: cash.id, amount: 350, movementType: 'inflow' }], note: ar ? 'لاصقة شاشة مع التركيب' : 'Screen protector + fitting', paidAmount: 350, personId: sara.id, totalAmount: 350, transactionType: 'sale' });
    this.transactions.createTransaction({ itemId: iphone.id, movements: [{ accountId: bank.id, amount: 30_000, movementType: 'inflow' }], note: ar ? 'بيع iPhone 15 Pro · المتبقي الأسبوع القادم' : 'iPhone 15 Pro sale · remaining due next week', paidAmount: 30_000, personId: ahmed.id, totalAmount: 48_000, transactionType: 'sale' });
    this.transactions.createTransaction({ itemId: samsung.id, movements: [{ accountId: bank.id, amount: 34_500, movementType: 'outflow' }], note: ar ? 'شراء مخزون Samsung S24 Ultra' : 'Samsung S24 Ultra stock purchase', paidAmount: 34_500, personId: supplier.id, totalAmount: 34_500, transactionType: 'purchase' });
    this.transactions.createTransaction({ movements: [{ accountId: cash.id, amount: 2_500, movementType: 'outflow' }], note: ar ? 'إيجار المتجر الشهري' : 'Monthly shop rent', paidAmount: 2_500, totalAmount: 2_500, transactionType: 'expense' });
    this.transactions.createTransaction({ movements: [{ accountId: wallet.id, amount: 900, movementType: 'inflow' }], note: ar ? 'خدمة إعداد هاتف' : 'Phone setup service', paidAmount: 900, totalAmount: 900, transactionType: 'income' });
    this.transactions.createTransfer({ amount: 1_000, fromAccountId: bank.id, note: ar ? 'تغذية الخزينة' : 'Top up the cash drawer', toAccountId: cash.id });
    this.transactions.createTransaction({ movements: [{ accountId: cash.id, amount: 100, movementType: 'inflow' }], note: ar ? 'تصحيح رصيد افتتاح الخزينة' : 'Opening cash count correction', paidAmount: 100, totalAmount: 100, transactionType: 'adjustment' });

    this.viewsPages.createView({ name: 'Recent sales', position: 0, sortRules: [{ direction: 'desc', field: 'createdAt' }], targetKind: 'transaction' });
    this.viewsPages.createView({ filterRules: [{ field: 'Condition', operator: 'equals', value: 'Brand New' }], name: 'New phones', position: 0, targetKind: 'item' });

    const pageLayouts = [
      { icon: 'lucide:ClipboardCheck', name: ar ? 'تشغيل اليوم' : 'Daily operations', blocks: [
        { content: ar ? 'تشغيل اليوم' : 'Daily operations', id: 'demo_daily_heading', type: 'h1' },
        { content: ar ? 'راجِع الخزينة والمبيعات الآجلة وأولويات اليوم قبل الإغلاق.' : 'Review cash, unpaid sales, and today’s priorities before closing.', id: 'demo_daily_note', type: 'callout' },
        { content: '', databaseKind: 'transactions', id: 'demo_daily_transactions', type: 'database-view' },
      ] },
      { icon: 'lucide:Boxes', name: ar ? 'المبيعات والمخزون' : 'Sales & inventory', blocks: [
        { content: ar ? 'المبيعات والمخزون' : 'Sales & inventory', id: 'demo_stock_heading', type: 'h1' },
        { content: ar ? 'جدول مباشر للأصناف وأرصدة حسابات المتجر التجريبي.' : 'Live catalog and account balances for the demo shop.', id: 'demo_stock_note', type: 'callout' },
        { content: '', databaseKind: 'items', id: 'demo_stock_items', type: 'database-view' },
      ] },
    ] as const;
    pageLayouts.forEach((page, position) => this.viewsPages.createPage({
      icon: page.icon,
      layoutJson: JSON.stringify({ blocks: page.blocks, favorite: position === 0, wiki: false }),
      name: page.name,
      position,
    }));

    this.database.prepare(`
      INSERT INTO app_metadata (key, value, updated_at)
      VALUES ('demo.seed.version', '1', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(new Date().toISOString());

    return { accounts: 3, items: 3, pages: 2, people: 3, transactions: 7 };
  }
}
