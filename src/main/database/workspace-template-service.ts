import { randomUUID } from 'node:crypto';

import type { TemplateImportResult, WorkspaceTemplateV2 } from '../../shared/template-v2-contract';
import type { RollupAggregation } from '../../shared/property-contract';
import type { FilterNode, GroupRule, SortRule } from '../../shared/query-contract';
import type { WorkflowInputSchema, WorkflowStep } from '../../shared/workflow-contract';
import type { DatabaseUnitOfWork } from './database-unit-of-work';
import type { DatabaseRepository } from './database-repository';
import type { PropertyRepository } from './property-repository';
import type { RelationRepository } from './relation-repository';
import type { ViewRepository } from './view-repository';
import type { WorkflowService } from './workflow-service';
import type { WorkspaceRepository } from './workspace-repository';
import type { RecordTemplateRepository } from './record-template-repository';

type ImportMaps = Readonly<{
  databaseMap: Map<string, string>;
  pageMap: Map<string, string>;
  propertyMap: Map<string, string>;
  relationMap: Map<string, string>;
  viewMap: Map<string, string>;
  workflowMap: Map<string, string>;
}>;

const ROLLUP_AGGREGATIONS: readonly RollupAggregation[] = [
  'sum', 'avg', 'min', 'max', 'count', 'count_values', 'count_empty',
  'count_unique', 'earliest', 'latest',
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRollupConfig(value: unknown): value is Readonly<{
  aggregation: RollupAggregation;
  relationPropertyId: string;
  targetPropertyId: string;
}> {
  return isObject(value)
    && typeof value.aggregation === 'string'
    && ROLLUP_AGGREGATIONS.some((aggregation) => aggregation === value.aggregation)
    && typeof value.relationPropertyId === 'string'
    && typeof value.targetPropertyId === 'string';
}

function remapText(value: string, references: ReadonlyMap<string, string>): string {
  let mapped = value;
  for (const [key, id] of references) mapped = mapped.replaceAll(key, id);
  return mapped;
}

function remapValue(value: unknown, references: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') return remapText(value, references);
  if (Array.isArray(value)) return value.map((entry) => remapValue(entry, references));
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [references.get(key) ?? key, remapValue(entry, references)]),
    );
  }
  return value;
}

export class WorkspaceTemplateService {
  readonly #unitOfWork: DatabaseUnitOfWork;
  readonly #databaseRepo: DatabaseRepository;
  readonly #propertyRepo: PropertyRepository;
  readonly #relationRepo: RelationRepository;
  readonly #viewRepo: ViewRepository;
  readonly #workflowService: WorkflowService;
  readonly #workspaceRepo: WorkspaceRepository;
  readonly #recordTemplateRepo: RecordTemplateRepository;

  constructor(
    unitOfWork: DatabaseUnitOfWork,
    databaseRepo: DatabaseRepository,
    propertyRepo: PropertyRepository,
    relationRepo: RelationRepository,
    viewRepo: ViewRepository,
    workflowService: WorkflowService,
    workspaceRepo: WorkspaceRepository,
    recordTemplateRepo: RecordTemplateRepository,
  ) {
    this.#unitOfWork = unitOfWork;
    this.#databaseRepo = databaseRepo;
    this.#propertyRepo = propertyRepo;
    this.#relationRepo = relationRepo;
    this.#viewRepo = viewRepo;
    this.#workflowService = workflowService;
    this.#workspaceRepo = workspaceRepo;
    this.#recordTemplateRepo = recordTemplateRepo;
  }

  getRetailTemplate(locale: 'ar' | 'en' = 'en'): WorkspaceTemplateV2 {
    const isAr = locale === 'ar';

    return {
      author: 'Max OS',
      databases: [
        {
          key: 'db_products',
          properties: [
            { key: 'prop_prod_name', name: isAr ? 'اسم المنتج' : 'Name', required: true, type: 'title' },
            { key: 'prop_prod_sku', name: isAr ? 'الباركود / SKU' : 'SKU', type: 'text', uniqueValue: true },
            { key: 'prop_prod_brand', name: isAr ? 'الماركة' : 'Brand', type: 'text' },
            { key: 'prop_prod_model', name: isAr ? 'الموديل' : 'Model', type: 'text' },
            { key: 'prop_prod_imei', name: isAr ? 'IMEI / الرقم التسلسلي' : 'IMEI / Serial', type: 'text', uniqueValue: true },
            {
              key: 'prop_prod_condition',
              name: isAr ? 'الحالة' : 'Condition',
              options: [{ label: isAr ? 'جديد' : 'New' }, { label: isAr ? 'مستعمل' : 'Used' }, { label: isAr ? 'مجدّد' : 'Refurbished' }],
              type: 'select',
            },
            {
              key: 'prop_prod_category',
              name: isAr ? 'التصنيف' : 'Category',
              options: [
                { label: isAr ? 'هواتف' : 'Phones' },
                { label: isAr ? 'إكسسوارات' : 'Accessories' },
                { label: isAr ? 'صيانة' : 'Repairs' },
              ],
              type: 'select',
            },
            { key: 'prop_prod_cost', name: isAr ? 'سعر التكلفة' : 'Cost Price', type: 'money' },
            { key: 'prop_prod_price', name: isAr ? 'سعر البيع' : 'Selling Price', type: 'money' },
            {
              config: {
                rollup: {
                  aggregation: 'sum',
                  relationPropertyId: 'prop_prod_inv_rel',
                  targetPropertyId: 'prop_inv_delta',
                },
              },
              key: 'prop_prod_stock',
              name: isAr ? 'المخزون المتوفر' : 'Stock',
              type: 'rollup',
            },
            {
              config: { relationId: 'rel_prod_inv' },
              key: 'prop_prod_inv_rel',
              name: isAr ? 'حركات المخزون' : 'Inventory Movements',
              type: 'relation',
            },
            { key: 'prop_prod_active', name: isAr ? 'نشط' : 'Active', type: 'checkbox' },
          ],
          title: isAr ? 'المنتجات' : 'Products',
          views: [
            { key: 'view_products_all', layout: 'table', name: isAr ? 'كل الأصناف' : 'All Items', propertyKeys: ['prop_prod_name', 'prop_prod_brand', 'prop_prod_model', 'prop_prod_imei', 'prop_prod_cost', 'prop_prod_price', 'prop_prod_stock'], sorts: [{ direction: 'asc', propertyId: 'prop_prod_name' }] },
          ],
          visibility: 'normal',
        },
        {
          key: 'db_people',
          properties: [
            { key: 'prop_people_name', name: isAr ? 'الاسم' : 'Name', required: true, type: 'title' },
            {
              key: 'prop_people_type',
              name: isAr ? 'النوع' : 'Type',
              options: [
                { label: isAr ? 'عميل' : 'Customer' },
                { label: isAr ? 'مورد' : 'Supplier' },
              ],
              type: 'select',
            },
            { key: 'prop_people_phone', name: isAr ? 'الهاتف' : 'Phone', type: 'phone' },
            {
              config: {
                rollup: {
                  aggregation: 'sum',
                  relationPropertyId: 'prop_people_money_rel',
                  targetPropertyId: 'prop_mm_amount',
                },
              },
              key: 'prop_people_balance',
              name: isAr ? 'الرصيد' : 'Balance',
              type: 'rollup',
            },
            {
              config: { relationId: 'rel_people_money' },
              key: 'prop_people_money_rel',
              name: isAr ? 'حركات الأموال' : 'Money Movements',
              type: 'relation',
            },
          ],
          title: isAr ? 'جهات التعامل' : 'People',
          views: [{ key: 'view_people_all', layout: 'table', name: isAr ? 'العملاء والموردون' : 'Customers & Suppliers', propertyKeys: ['prop_people_name', 'prop_people_type', 'prop_people_phone', 'prop_people_balance'], sorts: [{ direction: 'asc', propertyId: 'prop_people_name' }] }],
          visibility: 'normal',
        },
        {
          key: 'db_accounts',
          properties: [
            { key: 'prop_acc_name', name: isAr ? 'اسم الحساب' : 'Name', required: true, type: 'title' },
            {
              key: 'prop_acc_type',
              name: isAr ? 'النوع' : 'Type',
              options: [
                { label: isAr ? 'خزينة نقدية' : 'Cash' },
                { label: isAr ? 'حساب بنكي' : 'Bank' },
                { label: isAr ? 'محفظة إلكترونية' : 'Digital Wallet' },
              ],
              type: 'select',
            },
            {
              config: {
                rollup: {
                  aggregation: 'sum',
                  relationPropertyId: 'prop_acc_money_rel',
                  targetPropertyId: 'prop_mm_amount',
                },
              },
              key: 'prop_acc_balance',
              name: isAr ? 'الرصيد' : 'Balance',
              type: 'rollup',
            },
            {
              config: { relationId: 'rel_acc_money' },
              key: 'prop_acc_money_rel',
              name: isAr ? 'حركات الأموال' : 'Money Movements',
              type: 'relation',
            },
          ],
          title: isAr ? 'الحسابات والخزائن' : 'Accounts',
          views: [{ key: 'view_accounts_all', layout: 'table', name: isAr ? 'كل الحسابات' : 'All Accounts', propertyKeys: ['prop_acc_name', 'prop_acc_type', 'prop_acc_balance'], sorts: [{ direction: 'asc', propertyId: 'prop_acc_name' }] }],
          visibility: 'normal',
        },
        {
          key: 'db_transactions',
          properties: [
            { key: 'prop_tx_no', name: isAr ? 'رقم المعاملة' : 'Transaction #', required: true, type: 'title' },
            {
              key: 'prop_tx_type',
              name: isAr ? 'النوع' : 'Type',
              options: [
                { label: isAr ? 'بيع' : 'Sale' },
                { label: isAr ? 'شراء' : 'Purchase' },
                { label: isAr ? 'مصروف' : 'Expense' },
                { label: isAr ? 'تحويل' : 'Transfer' },
                { label: isAr ? 'دخل' : 'Income' },
                { label: isAr ? 'تسوية' : 'Adjustment' },
                { label: isAr ? 'عكس' : 'Reversal' },
              ],
              type: 'select',
            },
            { key: 'prop_tx_date', name: isAr ? 'التاريخ' : 'Date', type: 'date' },
            { key: 'prop_tx_quantity', name: isAr ? 'الكمية' : 'Quantity', type: 'number' },
            { key: 'prop_tx_unit_price', name: isAr ? 'سعر الوحدة' : 'Unit Price', type: 'money' },
            {
              config: { formula: { expression: '[prop_tx_quantity] * [prop_tx_unit_price]' } },
              key: 'prop_tx_line_total',
              name: isAr ? 'إجمالي الكمية × السعر' : 'Quantity × Price',
              type: 'formula',
            },
            { key: 'prop_tx_amount', name: isAr ? 'المبلغ الإجمالي' : 'Total Amount', type: 'money' },
            { key: 'prop_tx_fee', name: isAr ? 'الرسوم' : 'Total Fee', type: 'money' },
            { key: 'prop_tx_net', name: isAr ? 'الصافي' : 'Net Amount', type: 'money' },
            {
              key: 'prop_tx_payment_method',
              name: isAr ? 'طريقة الدفع' : 'Payment Method',
              options: [
                { label: isAr ? 'نقدي' : 'Cash' }, { label: 'Vodafone Cash' }, { label: 'e& Cash' },
                { label: 'Aman' }, { label: 'InstaPay' }, { label: isAr ? 'بطاقة' : 'Card' },
                { label: isAr ? 'تحويل بنكي' : 'Bank Transfer' }, { label: isAr ? 'آجل' : 'Credit' },
              ],
              type: 'select',
            },
            { config: { relationId: 'rel_tx_product' }, key: 'prop_tx_product_rel', name: isAr ? 'الصنف' : 'Item', type: 'relation' },
            {
              config: { relationId: 'rel_tx_person' },
              key: 'prop_tx_person_rel',
              name: isAr ? 'العميل / المورد' : 'Person',
              type: 'relation',
            },
            {
              config: { relationId: 'rel_tx_account' },
              key: 'prop_tx_acc_rel',
              name: isAr ? 'الحساب' : 'Account',
              type: 'relation',
            },
          ],
          title: isAr ? 'المعاملات والفواتير' : 'Transactions',
          defaultViewKey: 'view_tx_today',
          views: [
            {
              filterAst: { kind: 'property', operator: 'relative_date', propertyId: 'prop_tx_date', relativePeriod: 'TODAY' },
              group: { dateGranularity: 'day', propertyId: 'prop_tx_date' },
              key: 'view_tx_today', layout: 'table',
              layoutConfig: { calculations: [{ calculation: 'sum', propertyId: 'prop_tx_amount' }, { calculation: 'sum', propertyId: 'prop_tx_fee' }, { calculation: 'sum', propertyId: 'prop_tx_net' }] },
              name: isAr ? 'اليوم' : 'Today',
              propertyKeys: ['prop_tx_no', 'prop_tx_date', 'prop_tx_product_rel', 'prop_tx_quantity', 'prop_tx_unit_price', 'prop_tx_amount', 'prop_tx_payment_method', 'prop_tx_fee', 'prop_tx_net'],
              sorts: [{ direction: 'desc', propertyId: 'prop_tx_date' }],
            },
            {
              filterAst: { kind: 'property', operator: 'relative_date', propertyId: 'prop_tx_date', relativePeriod: 'THIS_WEEK' },
              group: { dateGranularity: 'day', propertyId: 'prop_tx_date' }, key: 'view_tx_week', layout: 'table',
              layoutConfig: { calculations: [{ calculation: 'sum', propertyId: 'prop_tx_amount' }, { calculation: 'sum', propertyId: 'prop_tx_fee' }, { calculation: 'sum', propertyId: 'prop_tx_net' }] },
              name: isAr ? 'هذا الأسبوع' : 'This Week', sorts: [{ direction: 'desc', propertyId: 'prop_tx_date' }],
            },
            {
              filterAst: { kind: 'property', operator: 'relative_date', propertyId: 'prop_tx_date', relativePeriod: 'THIS_MONTH' },
              group: { dateGranularity: 'week', propertyId: 'prop_tx_date' }, key: 'view_tx_month', layout: 'table',
              layoutConfig: { calculations: [{ calculation: 'sum', propertyId: 'prop_tx_amount' }, { calculation: 'sum', propertyId: 'prop_tx_fee' }, { calculation: 'sum', propertyId: 'prop_tx_net' }] },
              name: isAr ? 'هذا الشهر' : 'This Month', sorts: [{ direction: 'desc', propertyId: 'prop_tx_date' }],
            },
            { group: { dateGranularity: 'month', propertyId: 'prop_tx_date' }, key: 'view_tx_all', layout: 'table', name: isAr ? 'كل المعاملات' : 'All Transactions', sorts: [{ direction: 'desc', propertyId: 'prop_tx_date' }] },
          ],
          visibility: 'normal',
        },
        {
          key: 'db_inventory_movements',
          properties: [
            { key: 'prop_inv_title', name: isAr ? 'الوصف' : 'Description', required: true, type: 'title' },
            { key: 'prop_inv_date', name: isAr ? 'التاريخ' : 'Date', type: 'date' },
            { key: 'prop_inv_delta', name: isAr ? 'فرق الكمية' : 'Quantity Delta', type: 'number' },
            {
              config: { relationId: 'rel_prod_inv' },
              key: 'prop_inv_prod_rel',
              name: isAr ? 'المنتج' : 'Product',
              type: 'relation',
            },
            {
              config: { relationId: 'rel_tx_inv' },
              key: 'prop_inv_tx_rel',
              name: isAr ? 'المعاملة' : 'Transaction',
              type: 'relation',
            },
          ],
          title: isAr ? 'حركات المخزون التفصيلية' : 'Inventory Movements',
          views: [{ group: { dateGranularity: 'day', propertyId: 'prop_inv_date' }, key: 'view_inv_all', layout: 'table', name: isAr ? 'كل حركات المخزون' : 'All Inventory Movements', sorts: [{ direction: 'desc', propertyId: 'prop_inv_date' }] }],
          visibility: 'advanced',
        },
        {
          key: 'db_money_movements',
          properties: [
            { key: 'prop_mm_title', name: isAr ? 'الوصف' : 'Description', required: true, type: 'title' },
            { key: 'prop_mm_date', name: isAr ? 'التاريخ' : 'Date', type: 'date' },
            { key: 'prop_mm_amount', name: isAr ? 'المبلغ' : 'Amount', type: 'money' },
            {
              config: { relationId: 'rel_acc_money' },
              key: 'prop_mm_acc_rel',
              name: isAr ? 'الحساب' : 'Account',
              type: 'relation',
            },
            {
              config: { relationId: 'rel_people_money' },
              key: 'prop_mm_person_rel',
              name: isAr ? 'جهة التعامل' : 'Person',
              type: 'relation',
            },
            {
              config: { relationId: 'rel_tx_money' },
              key: 'prop_mm_tx_rel',
              name: isAr ? 'المعاملة' : 'Transaction',
              type: 'relation',
            },
          ],
          title: isAr ? 'حركات الأموال التفصيلية' : 'Money Movements',
          views: [{ group: { dateGranularity: 'day', propertyId: 'prop_mm_date' }, key: 'view_money_all', layout: 'table', layoutConfig: { calculations: [{ calculation: 'sum', propertyId: 'prop_mm_amount' }] }, name: isAr ? 'كل حركات الأموال' : 'All Money Movements', sorts: [{ direction: 'desc', propertyId: 'prop_mm_date' }] }],
          visibility: 'advanced',
        },
      ],
      description: isAr ? 'مساحة عمل جاهزة لإدارة المحلات التجارية والمخزون والحسابات' : 'Ready-to-use retail workspace template for shop operations, inventory, and accounts.',
      name: isAr ? 'متجر الهواتف' : 'Phone Shop',
      pages: [
        { contentJson: JSON.stringify([{ calloutIcon: '📅', content: isAr ? 'المبيعات والرسوم وصافي اليوم محسوبة من قاعدة البيانات.' : 'Today’s sales, fees, and net totals are calculated from the database.', id: 'phone_daily_note', type: 'callout' }, { content: '', databaseId: 'db_transactions', id: 'phone_daily_db', type: 'database-view', viewId: 'view_tx_today' }]), icon: 'lucide:ClipboardCheck', key: 'page_daily', title: isAr ? 'تشغيل اليوم' : 'Daily Operations' },
        { contentJson: JSON.stringify([{ content: '', databaseId: 'db_products', id: 'phone_inventory_db', type: 'database-view', viewId: 'view_products_all' }]), icon: 'lucide:Boxes', key: 'page_inventory', title: isAr ? 'المخزون' : 'Inventory' },
        { contentJson: JSON.stringify([{ content: '', databaseId: 'db_people', id: 'phone_people_db', type: 'database-view', viewId: 'view_people_all' }]), icon: 'lucide:Users', key: 'page_people', title: isAr ? 'الأشخاص والحسابات' : 'People & Accounts' },
      ],
      recordTemplates: [
        { contentJson: JSON.stringify([{ content: isAr ? 'بيانات الجهاز والضمان والملحقات.' : 'Device details, warranty, and included accessories.', id: 'device_notes', type: 'callout' }]), databaseKey: 'db_products', defaults: { prop_prod_active: true }, icon: '📱', key: 'record_device', name: isAr ? 'جهاز' : 'Device' },
        { databaseKey: 'db_products', defaults: { prop_prod_active: true }, icon: '🎧', key: 'record_accessory', name: isAr ? 'إكسسوار' : 'Accessory' },
        { databaseKey: 'db_people', icon: '👤', key: 'record_customer', name: isAr ? 'عميل' : 'Customer' },
        { databaseKey: 'db_people', icon: '🚚', key: 'record_supplier', name: isAr ? 'مورد' : 'Supplier' },
        { databaseKey: 'db_accounts', icon: '💵', key: 'record_cash_account', name: isAr ? 'حساب نقدي' : 'Cash Account' },
        { databaseKey: 'db_accounts', icon: '📲', key: 'record_wallet_account', name: isAr ? 'محفظة رقمية' : 'Digital Wallet' },
        { databaseKey: 'db_transactions', icon: '🧾', key: 'record_sale', name: isAr ? 'عملية بيع' : 'Sale' },
      ],
      relations: [
        {
          inversePropertyKey: 'prop_inv_prod_rel',
          key: 'rel_prod_inv',
          sourceCardinality: 'one',
          sourceDatabaseKey: 'db_products',
          sourcePropertyKey: 'prop_prod_inv_rel',
          targetCardinality: 'many',
          targetDatabaseKey: 'db_inventory_movements',
        },
        {
          inversePropertyKey: 'prop_mm_person_rel',
          key: 'rel_people_money',
          sourceCardinality: 'one',
          sourceDatabaseKey: 'db_people',
          sourcePropertyKey: 'prop_people_money_rel',
          targetCardinality: 'many',
          targetDatabaseKey: 'db_money_movements',
        },
        {
          inversePropertyKey: 'prop_mm_acc_rel',
          key: 'rel_acc_money',
          sourceCardinality: 'one',
          sourceDatabaseKey: 'db_accounts',
          sourcePropertyKey: 'prop_acc_money_rel',
          targetCardinality: 'many',
          targetDatabaseKey: 'db_money_movements',
        },
        {
          inversePropertyName: isAr ? 'المعاملات' : 'Transactions',
          key: 'rel_tx_person',
          sourceCardinality: 'many',
          sourceDatabaseKey: 'db_transactions',
          sourcePropertyKey: 'prop_tx_person_rel',
          targetCardinality: 'one',
          targetDatabaseKey: 'db_people',
        },
        {
          inversePropertyName: isAr ? 'المعاملات' : 'Transactions',
          key: 'rel_tx_account',
          sourceCardinality: 'many',
          sourceDatabaseKey: 'db_transactions',
          sourcePropertyKey: 'prop_tx_acc_rel',
          targetCardinality: 'one',
          targetDatabaseKey: 'db_accounts',
        },
        {
          inversePropertyName: isAr ? 'المبيعات' : 'Sales', key: 'rel_tx_product', sourceCardinality: 'many',
          sourceDatabaseKey: 'db_transactions', sourcePropertyKey: 'prop_tx_product_rel', targetCardinality: 'one', targetDatabaseKey: 'db_products',
        },
        {
          inversePropertyName: isAr ? 'حركات المخزون' : 'Inventory Movements',
          key: 'rel_tx_inv',
          sourceCardinality: 'many',
          sourceDatabaseKey: 'db_inventory_movements',
          sourcePropertyKey: 'prop_inv_tx_rel',
          targetCardinality: 'one',
          targetDatabaseKey: 'db_transactions',
        },
        {
          inversePropertyName: isAr ? 'حركات الأموال' : 'Money Movements',
          key: 'rel_tx_money',
          sourceCardinality: 'many',
          sourceDatabaseKey: 'db_money_movements',
          sourcePropertyKey: 'prop_mm_tx_rel',
          targetCardinality: 'one',
          targetDatabaseKey: 'db_transactions',
        },
      ],
      version: 2,
      workflows: [{
        icon: 'lucide:ShoppingCart',
        inputSchema: { fields: [
          { databaseId: 'db_products', key: 'product', label: isAr ? 'الصنف' : 'Item', required: true, type: 'record' },
          { databaseId: 'db_people', key: 'person', label: isAr ? 'العميل' : 'Customer', type: 'record' },
          { databaseId: 'db_accounts', key: 'account', label: isAr ? 'الحساب' : 'Payment account', required: true, type: 'record' },
          { defaultValue: 1, key: 'quantity', label: isAr ? 'الكمية' : 'Quantity', required: true, type: 'number' },
          { key: 'unitPrice', label: isAr ? 'سعر الوحدة' : 'Unit price', required: true, type: 'money' },
          { defaultValue: 0, key: 'fee', label: isAr ? 'الرسوم' : 'Fee', type: 'money' },
          { key: 'date', label: isAr ? 'التاريخ' : 'Date', required: true, type: 'date' },
          { key: 'reference', label: isAr ? 'رقم العملية' : 'Reference', required: true, type: 'text' },
        ] },
        key: 'workflow_quick_sale', name: isAr ? 'بيع سريع' : 'Quick Sale',
        steps: [
          { config: { condition: 'quantity > 0 and unitPrice >= 0', errorMessage: isAr ? 'أدخل كمية وسعر صحيحين.' : 'Enter a valid quantity and unit price.' }, id: 'validate_sale', type: 'VALIDATE' },
          { config: { assignments: { inventoryDelta: '-quantity', net: 'quantity * unitPrice - fee', total: 'quantity * unitPrice' } }, id: 'calculate_sale', type: 'COMPUTE' },
          { config: { databaseId: 'db_transactions', outputVariable: 'transaction', properties: { prop_tx_amount: '$total', prop_tx_date: '$date', prop_tx_fee: '$fee', prop_tx_net: '$net', prop_tx_quantity: '$quantity', prop_tx_unit_price: '$unitPrice' }, title: '$reference' }, id: 'create_transaction', type: 'CREATE_RECORD' },
          { config: { databaseId: 'db_inventory_movements', outputVariable: 'inventoryMovement', properties: { prop_inv_date: '$date', prop_inv_delta: '$inventoryDelta' }, title: '$reference' }, id: 'create_inventory', type: 'CREATE_RECORD' },
          { config: { databaseId: 'db_money_movements', outputVariable: 'moneyMovement', properties: { prop_mm_amount: '$net', prop_mm_date: '$date' }, title: '$reference' }, id: 'create_money', type: 'CREATE_RECORD' },
          { config: { relationId: 'rel_tx_product', sourceRecordVariable: 'transaction', targetRecordVariable: 'product' }, id: 'link_product', type: 'CREATE_RELATION' },
          { config: { relationId: 'rel_tx_person', sourceRecordVariable: 'transaction', targetRecordVariable: 'person' }, id: 'link_person', type: 'CREATE_RELATION' },
          { config: { relationId: 'rel_tx_account', sourceRecordVariable: 'transaction', targetRecordVariable: 'account' }, id: 'link_account', type: 'CREATE_RELATION' },
          { config: { relationId: 'rel_prod_inv', sourceRecordVariable: 'product', targetRecordVariable: 'inventoryMovement' }, id: 'link_inventory_product', type: 'CREATE_RELATION' },
          { config: { relationId: 'rel_tx_inv', sourceRecordVariable: 'inventoryMovement', targetRecordVariable: 'transaction' }, id: 'link_inventory_transaction', type: 'CREATE_RELATION' },
          { config: { relationId: 'rel_acc_money', sourceRecordVariable: 'account', targetRecordVariable: 'moneyMovement' }, id: 'link_money_account', type: 'CREATE_RELATION' },
          { config: { relationId: 'rel_tx_money', sourceRecordVariable: 'moneyMovement', targetRecordVariable: 'transaction' }, id: 'link_money_transaction', type: 'CREATE_RELATION' },
          { config: { amount: '$total', fee: '$fee', net: '$net', transactionId: '$transaction' }, id: 'return_sale', type: 'RETURN_RESULT' },
        ],
      }],
    };
  }

  importTemplate(template: WorkspaceTemplateV2): { databaseMap: Map<string, string>; propertyMap: Map<string, string> } {
    const maps = this.#unitOfWork.run(() => this.#importCore(template));
    return { databaseMap: maps.databaseMap, propertyMap: maps.propertyMap };
  }

  importBlueprintV2(template: WorkspaceTemplateV2): TemplateImportResult {
    return this.#unitOfWork.run(() => {
      const maps = this.#importCore(template);
      const databases = template.databases.flatMap((database) => {
        const id = maps.databaseMap.get(database.key);
        return id ? [{ id, key: database.key, title: database.title }] : [];
      });
      const pages = (template.pages ?? []).flatMap((page) => {
        const id = maps.pageMap.get(page.key);
        return id ? [{ id, key: page.key, title: page.title }] : [];
      });
      return {
        databaseCount: databases.length,
        databases,
        pageCount: pages.length,
        pages,
        propertyCount: maps.propertyMap.size,
        relationCount: maps.relationMap.size,
        workflowCount: maps.workflowMap.size,
      };
    });
  }

  #importCore(template: WorkspaceTemplateV2): ImportMaps {
    const databaseMap = new Map<string, string>();
    const pageMap = new Map<string, string>();
    const propertyMap = new Map<string, string>();
    const relationMap = new Map<string, string>();
    const viewMap = new Map<string, string>();
    const workflowMap = new Map<string, string>();

    for (const relation of template.relations) relationMap.set(relation.key, randomUUID());
    for (const database of template.databases) {
      for (const view of database.views) viewMap.set(view.key, randomUUID());
    }
    for (const workflow of template.workflows ?? []) workflowMap.set(workflow.key, randomUUID());

    // 1. Databases and their Properties.
    for (const databaseDraft of template.databases) {
      const createdDatabase = this.#databaseRepo.createDatabase({
        icon: databaseDraft.icon,
        title: databaseDraft.title,
        visibility: databaseDraft.visibility,
      });
      databaseMap.set(databaseDraft.key, createdDatabase.id);

      const titleProperty = this.#databaseRepo
        .getSchema(createdDatabase.id)
        .properties.find((property) => property.type === 'title');
      const titleDraft = databaseDraft.properties.find((property) => property.type === 'title');
      if (titleProperty && titleDraft) {
        propertyMap.set(titleDraft.key, titleProperty.id);
        if (titleDraft.name !== titleProperty.name) {
          this.#propertyRepo.updateProperty(titleProperty.id, { name: titleDraft.name });
        }
      }

      for (const propertyDraft of databaseDraft.properties) {
        if (propertyDraft.type === 'title') continue;
        const createdProperty = this.#propertyRepo.createProperty({
          config: propertyDraft.config,
          databaseId: createdDatabase.id,
          defaultValueJson: propertyDraft.defaultValue === undefined
            ? undefined
            : JSON.stringify(propertyDraft.defaultValue),
          name: propertyDraft.name,
          options: propertyDraft.options?.map((option) => ({ label: option.label, style: option.style })),
          required: propertyDraft.required,
          type: propertyDraft.type,
          uniqueValue: propertyDraft.uniqueValue,
        });
        propertyMap.set(propertyDraft.key, createdProperty.id);
      }
    }

    const references = new Map<string, string>([
      ...databaseMap,
      ...propertyMap,
      ...relationMap,
      ...viewMap,
      ...workflowMap,
    ]);

    // 2. Relations, including a predeclared inverse Property when supplied.
    for (const relationDraft of template.relations) {
      const sourceDatabaseId = databaseMap.get(relationDraft.sourceDatabaseKey);
      const targetDatabaseId = databaseMap.get(relationDraft.targetDatabaseKey);
      const sourcePropertyId = propertyMap.get(relationDraft.sourcePropertyKey);
      const relationId = relationMap.get(relationDraft.key);
      if (!sourceDatabaseId || !targetDatabaseId || !sourcePropertyId || !relationId) continue;

      this.#relationRepo.createRelation({
        id: relationId,
        inversePropertyId: relationDraft.inversePropertyKey
          ? propertyMap.get(relationDraft.inversePropertyKey) ?? null
          : null,
        inversePropertyName: relationDraft.inversePropertyKey ? null : relationDraft.inversePropertyName,
        sourceCardinality: relationDraft.sourceCardinality,
        sourceDatabaseId,
        sourcePropertyId,
        targetCardinality: relationDraft.targetCardinality,
        targetDatabaseId,
      });
    }

    // 3. Resolve every config after all stable IDs exist. This covers Formula,
    // Rollup, Relation and Button/Workflow references without name lookups.
    for (const databaseDraft of template.databases) {
      for (const propertyDraft of databaseDraft.properties) {
        const propertyId = propertyMap.get(propertyDraft.key);
        if (!propertyId || !propertyDraft.config) continue;
        const remapped = remapValue(propertyDraft.config, references);
        if (!isObject(remapped)) continue;

        const rollup = remapped.rollup;
        if (propertyDraft.type === 'rollup' && !isRollupConfig(rollup)) continue;
        this.#propertyRepo.updateProperty(propertyId, { config: remapped });
      }
    }

    // 4. Saved Views and default View selection.
    for (const databaseDraft of template.databases) {
      const databaseId = databaseMap.get(databaseDraft.key);
      if (!databaseId || databaseDraft.views.length === 0) continue;
      const generatedDefaultViewId = this.#databaseRepo.getDatabase(databaseId)?.defaultViewId;

      for (const viewDraft of databaseDraft.views) {
        const viewId = viewMap.get(viewDraft.key);
        if (!viewId) continue;
        const remappedFilter = remapValue(viewDraft.filterAst, references) as FilterNode | null | undefined;
        const remappedSorts = remapValue(viewDraft.sorts, references) as readonly SortRule[] | undefined;
        const remappedLayout = remapValue(viewDraft.layoutConfig ?? {}, references);
        this.#viewRepo.createView({
          databaseId,
          filterAst: remappedFilter,
          group: remapValue(viewDraft.group, references) as GroupRule | null | undefined,
          id: viewId,
          layout: viewDraft.layout,
          layoutConfig: isObject(remappedLayout) ? remappedLayout : {},
          name: viewDraft.name,
          propertyState: {
            columns: (viewDraft.propertyKeys ?? []).flatMap((key) => {
              const propertyId = propertyMap.get(key);
              return propertyId ? [{ propertyId }] : [];
            }),
          },
          sorts: remappedSorts,
        });
      }

      const defaultViewId = databaseDraft.defaultViewKey
        ? viewMap.get(databaseDraft.defaultViewKey)
        : viewMap.get(databaseDraft.views[0]?.key ?? '');
      if (defaultViewId) this.#databaseRepo.updateDatabase(databaseId, { defaultViewId });
      if (generatedDefaultViewId) this.#viewRepo.archiveView(generatedDefaultViewId);
    }

    // 5. Reusable record templates apply defaults and starter page content.
    for (const templateDraft of template.recordTemplates ?? []) {
      const databaseId = databaseMap.get(templateDraft.databaseKey);
      if (!databaseId) continue;
      const defaults = remapValue(templateDraft.defaults ?? {}, references);
      this.#recordTemplateRepo.create({
        contentJson: remapText(templateDraft.contentJson ?? '[]', references),
        databaseId,
        defaults: isObject(defaults) ? defaults : {},
        icon: templateDraft.icon,
        name: templateDraft.name,
      });
    }

    // 6. Pages keep their blocks as canonical JSON and remap linked IDs.
    for (const pageDraft of template.pages ?? []) {
      const id = randomUUID();
      const contentJson = remapText(pageDraft.contentJson, references);
      const page = this.#workspaceRepo.createNode({
        contentJson,
        icon: pageDraft.icon,
        id,
        kind: 'page',
        title: pageDraft.title,
      });
      pageMap.set(pageDraft.key, page.id);
    }

    // 7. Workflows are imported with all Database/Property/Relation IDs fixed.
    for (const workflowDraft of template.workflows ?? []) {
      const id = workflowMap.get(workflowDraft.key);
      if (!id) continue;
      const inputSchema = remapValue(workflowDraft.inputSchema, references) as WorkflowInputSchema;
      const steps = remapValue(workflowDraft.steps, references) as readonly WorkflowStep[];
      this.#workflowService.createWorkflow({
        icon: workflowDraft.icon,
        id,
        inputSchema,
        name: workflowDraft.name,
        steps,
      });
    }

    return { databaseMap, pageMap, propertyMap, relationMap, viewMap, workflowMap };
  }
}
