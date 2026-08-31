import type { DatabaseSync } from 'node:sqlite';

import type { DemoSeedSummary } from '../../shared/ipc-contract';
import type { PropertyValue } from '../../shared/object-contract';
import type { AccountRepository } from './account-repository';
import type { ObjectRepository } from './object-repository';
import type { TemplateRepository } from './template-repository';
import type { TransactionRepository } from './transaction-repository';
import type { ViewsPagesRepository } from './views-pages-repository';

type DemoItem = readonly [label: string, brand: string, cost: number, price: number, stock: number, template: 'Accessory / Case' | 'New Phone' | 'Used Phone', condition?: string, imei?: string];

const demoItems: readonly DemoItem[] = [
  ['iPhone 15 Pro 256GB', 'Apple', 41_000, 48_000, 4, 'New Phone', 'Brand New', '356789012345678'],
  ['Samsung Galaxy S24 Ultra', 'Samsung', 34_500, 39_900, 5, 'New Phone', 'Brand New', '352345678901234'],
  ['iPhone 13 Pro 256GB', 'Apple', 25_000, 29_500, 2, 'Used Phone', 'Like New', '353001234567890'],
  ['Samsung Galaxy S22 128GB', 'Samsung', 15_500, 18_750, 3, 'Used Phone', 'Used - Good', '352001234567891'],
  ['Xiaomi Redmi Note 13 Pro', 'Xiaomi', 11_800, 14_250, 7, 'New Phone', 'Brand New', '867001234567892'],
  ['Oppo Reno 11F', 'Oppo', 13_200, 15_900, 4, 'New Phone', 'Brand New', '868001234567893'],
  ['Realme C67', 'Realme', 8_400, 10_250, 6, 'New Phone', 'Brand New', '869001234567894'],
  ['Nokia G21', 'Other', 2_300, 3_200, 2, 'Used Phone', 'Used - Good', '350001234567895'],
  ['Premium Screen Protector', 'Other', 90, 350, 38, 'Accessory / Case'],
  ['iPhone 15 Silicone Case', 'Apple', 220, 650, 16, 'Accessory / Case'],
  ['Galaxy S24 Clear Case', 'Samsung', 190, 550, 13, 'Accessory / Case'],
  ['USB-C 25W Charger', 'Other', 310, 750, 19, 'Accessory / Case'],
  ['Apple 20W USB-C Adapter', 'Apple', 540, 1_150, 9, 'Accessory / Case'],
  ['USB-C Braided Cable 1m', 'Other', 65, 220, 31, 'Accessory / Case'],
  ['Lightning Cable 1m', 'Other', 80, 275, 24, 'Accessory / Case'],
  ['Anker PowerCore 10000', 'Other', 1_150, 1_650, 8, 'Accessory / Case'],
  ['Oraimo FreePods 4', 'Other', 760, 1_150, 12, 'Accessory / Case'],
  ['Galaxy Buds FE', 'Samsung', 2_100, 2_850, 5, 'Accessory / Case'],
  ['Universal Car Holder', 'Other', 125, 390, 14, 'Accessory / Case'],
  ['Mobile Cleaning Kit', 'Other', 180, 480, 11, 'Accessory / Case'],
  ['Nano SIM Adapter Set', 'Other', 95, 250, 22, 'Accessory / Case'],
  ['Apple Pencil USB-C', 'Apple', 3_400, 4_150, 3, 'Accessory / Case'],
  ['Samsung SmartTag2', 'Samsung', 1_350, 1_850, 7, 'Accessory / Case'],
  ['Portable Bluetooth Speaker', 'Other', 490, 850, 10, 'Accessory / Case'],
];

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
    if (this.database.prepare("SELECT value FROM app_metadata WHERE key = 'demo.seed.version'").get()) {
      return { accounts: 0, items: 0, pages: 0, people: 0, transactions: 0 };
    }

    const itemProperties = new Map(this.objects.listProperties('item').map((property) => [property.name, property.id]));
    const personProperties = new Map(this.objects.listProperties('person').map((property) => [property.name, property.id]));
    const itemTemplates = new Map(this.templates.listTemplates('item').map((template) => [template.name, template.id]));
    const personTemplates = new Map(this.templates.listTemplates('person').map((template) => [template.name, template.id]));
    const values = (properties: ReadonlyMap<string, string>, source: Readonly<Record<string, PropertyValue>>) => Object.fromEntries(
      Object.entries(source).map(([name, value]) => [properties.get(name), value] as const)
        .filter((entry): entry is readonly [string, PropertyValue] => Boolean(entry[0])),
    );

    const cash = this.accounts.createAccount({ accountType: 'cash', initialBalance: 12_500, name: ar ? 'الخزينة الرئيسية' : 'Main Cash Drawer' });
    const wallet = this.accounts.createAccount({ accountType: 'wallet', feeConfig: { feeType: 'percentage', percentage: 1 }, initialBalance: 4_250, name: ar ? 'فودافون كاش' : 'Vodafone Cash' });
    const bank = this.accounts.createAccount({ accountType: 'bank', initialBalance: 125_000, name: ar ? 'حساب المتجر البنكي' : 'Business Bank' });
    const card = this.accounts.createAccount({ accountType: 'bank', feeConfig: { feeType: 'percentage', percentage: 1.5 }, initialBalance: 8_600, name: ar ? 'نقاط البيع' : 'Card Terminal' });
    const petty = this.accounts.createAccount({ accountType: 'cash', initialBalance: 1_200, name: ar ? 'العهدة النثرية' : 'Petty Cash' });

    const items = demoItems.map(([label, brand, cost, price, stock, template, condition, imei]) => this.objects.createRecord({
      label,
      objectKind: 'item',
      templateId: itemTemplates.get(template),
      values: values(itemProperties, { Brand: brand, Condition: condition ?? 'Brand New', 'Cost Price': cost, IMEI: imei ?? '', Model: label, 'Selling Price': price, Stock: stock }),
    }));

    const peopleSource = [
      ['Ahmed Ibrahim', '01012345678', 'Customer', 'Repeat customer · Downtown'],
      ['Sara Mohamed', '01198765432', 'Customer', 'Prefers WhatsApp receipts'],
      ['Mariam Adel', '01234567890', 'Customer', 'University student'],
      ['Youssef Hassan', '01077774444', 'Customer', 'Business customer'],
      ['Nour Ali', '01555556666', 'Customer', 'Accessory orders'],
      ['Cairo Mobile Supply', '0223456789', 'Supplier', 'Weekly accessories delivery'],
      ['Delta Phones Distribution', '0234567890', 'Supplier', 'New phones distributor'],
      ['Mahmoud Salah', '01022223333', 'Technician', 'Store technician'],
    ] as const;
    const people = peopleSource.map(([label, phone, type, note]) => this.objects.createRecord({
      label,
      objectKind: 'person',
      templateId: personTemplates.get(type === 'Supplier' ? 'Supplier' : 'Customer'),
      values: values(personProperties, { Notes: note, 'Phone Number': phone, Type: type }),
    }));

    const create = (draft: Parameters<TransactionRepository['createTransaction']>[0]) => this.transactions.createTransaction(draft);
    create({ itemId: items[8]?.id, movements: [{ accountId: cash.id, amount: 700, movementType: 'inflow' }], note: ar ? 'لاصقتا شاشة مع التركيب' : 'Two screen protectors with fitting', paidAmount: 700, personId: people[1]?.id, quantity: 2, totalAmount: 700, transactionType: 'sale' });
    create({ itemId: items[0]?.id, movements: [{ accountId: bank.id, amount: 30_000, movementType: 'inflow' }], note: ar ? 'دفعة جزئية والباقي آجل' : 'Partial payment; balance due next week', paidAmount: 30_000, personId: people[0]?.id, quantity: 1, totalAmount: 48_000, transactionType: 'sale' });
    create({ itemId: items[4]?.id, movements: [{ accountId: card.id, amount: 14_250, movementType: 'inflow' }], paidAmount: 14_250, personId: people[2]?.id, providerFee: 213.75, quantity: 1, totalAmount: 14_250, transactionType: 'sale' });
    create({ itemId: items[13]?.id, movements: [{ accountId: wallet.id, amount: 440, movementType: 'inflow' }], paidAmount: 440, personId: people[4]?.id, providerFee: 4.4, quantity: 2, totalAmount: 440, transactionType: 'sale' });
    create({ itemId: items[15]?.id, movements: [{ accountId: cash.id, amount: 1_650, movementType: 'inflow' }], paidAmount: 1_650, personId: people[3]?.id, quantity: 1, totalAmount: 1_650, transactionType: 'sale' });
    create({ itemId: items[1]?.id, movements: [{ accountId: bank.id, amount: 69_000, movementType: 'outflow' }], note: ar ? 'توريد هاتفين' : 'Two-phone stock delivery', paidAmount: 69_000, personId: people[6]?.id, quantity: 2, totalAmount: 69_000, transactionType: 'purchase' });
    create({ itemId: items[11]?.id, movements: [{ accountId: bank.id, amount: 6_200, movementType: 'outflow' }], paidAmount: 6_200, personId: people[5]?.id, quantity: 20, totalAmount: 6_200, transactionType: 'purchase' });
    create({ movements: [{ accountId: cash.id, amount: 8_500, movementType: 'outflow' }], note: ar ? 'إيجار المتجر الشهري' : 'Monthly shop rent', paidAmount: 8_500, totalAmount: 8_500, transactionType: 'expense' });
    create({ movements: [{ accountId: petty.id, amount: 780, movementType: 'outflow' }], note: ar ? 'أدوات تغليف وتنظيف' : 'Packaging and cleaning supplies', paidAmount: 780, totalAmount: 780, transactionType: 'expense' });
    create({ movements: [{ accountId: wallet.id, amount: 900, movementType: 'inflow' }], note: ar ? 'خدمة إعداد ونقل بيانات' : 'Phone setup and data transfer', paidAmount: 900, serviceFee: 900, totalAmount: 900, transactionType: 'income' });
    create({ movements: [{ accountId: cash.id, amount: 450, movementType: 'inflow' }], note: ar ? 'تركيب شاشة وحماية' : 'Screen fitting service', paidAmount: 450, serviceFee: 450, totalAmount: 450, transactionType: 'income' });
    this.transactions.createTransfer({ amount: 5_000, fromAccountId: bank.id, note: ar ? 'تغذية الخزينة' : 'Top up cash drawer', toAccountId: cash.id });
    this.transactions.createTransfer({ amount: 2_000, fromAccountId: wallet.id, note: ar ? 'تحويل حصيلة المحفظة' : 'Wallet settlement', providerFee: 20, toAccountId: bank.id });
    create({ movements: [{ accountId: cash.id, amount: 120, movementType: 'inflow' }], note: ar ? 'تصحيح جرد الخزينة' : 'Cash count correction', paidAmount: 120, totalAmount: 120, transactionType: 'adjustment' });
    create({ movements: [{ accountId: petty.id, amount: 35, movementType: 'outflow' }], note: ar ? 'تصحيح عهدة' : 'Petty cash correction', paidAmount: 35, totalAmount: 35, transactionType: 'adjustment' });

    this.viewsPages.createView({ name: ar ? 'المبيعات الأخيرة' : 'Recent sales', position: 0, sortRules: [{ direction: 'desc', field: 'createdAt' }], targetKind: 'transaction' });
    this.viewsPages.createView({ filterRules: [{ field: 'Condition', operator: 'equals', value: 'Brand New' }], name: ar ? 'هواتف جديدة' : 'New phones', position: 0, targetKind: 'item' });
    this.viewsPages.createView({ filterRules: [{ field: 'Stock', operator: 'less-than', value: 6 }], name: ar ? 'مخزون منخفض' : 'Low stock', position: 1, targetKind: 'item' });

    const pages = [
      ['lucide:ClipboardCheck', ar ? 'تشغيل اليوم' : 'Daily operations', ar ? 'راجع المبيعات والمصروفات والحسابات قبل الإغلاق.' : 'Review sales, expenses, and accounts before closing.', 'transactions', true],
      ['lucide:Boxes', ar ? 'المخزون' : 'Inventory', ar ? 'تابع الكميات والأسعار والأصناف التي تحتاج إعادة طلب.' : 'Track quantities, prices, and products that need reordering.', 'items', true],
      ['lucide:Users', ar ? 'العملاء والموردون' : 'Customers & suppliers', ar ? 'دليل العملاء والموردين وبيانات التواصل.' : 'Customer and supplier directory with contact details.', 'people', false],
      ['lucide:Landmark', ar ? 'المالية' : 'Finance', ar ? 'أرصدة الخزينة والبنك والمحافظ في مكان واحد.' : 'Cash, bank, wallet, and terminal balances in one place.', 'accounts', false],
    ] as const;
    pages.forEach(([icon, name, note, databaseKind, favorite], position) => this.viewsPages.createPage({
      icon,
      layoutJson: JSON.stringify({ blocks: [{ content: note, id: `demo_${position}_note`, type: 'callout' }, { content: '', databaseKind, id: `demo_${position}_database`, type: 'database-view' }], favorite, wiki: false }),
      name,
      position,
    }));

    this.database.prepare("INSERT INTO app_metadata (key, value, updated_at) VALUES ('demo.seed.version', '2', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(new Date().toISOString());
    return { accounts: 5, items: items.length, pages: pages.length, people: people.length, transactions: 15 };
  }
}
