import { randomUUID } from 'node:crypto';

import type { TemplateImportResult, WorkspaceTemplateV2 } from '../../shared/template-v2-contract';
import type { RollupAggregation } from '../../shared/property-contract';
import type { FilterNode, SortRule } from '../../shared/query-contract';
import type { WorkflowInputSchema, WorkflowStep } from '../../shared/workflow-contract';
import type { DatabaseUnitOfWork } from './database-unit-of-work';
import type { DatabaseRepository } from './database-repository';
import type { PropertyRepository } from './property-repository';
import type { RelationRepository } from './relation-repository';
import type { ViewRepository } from './view-repository';
import type { WorkflowService } from './workflow-service';
import type { WorkspaceRepository } from './workspace-repository';

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
      Object.entries(value).map(([key, entry]) => [key, remapValue(entry, references)]),
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

  constructor(
    unitOfWork: DatabaseUnitOfWork,
    databaseRepo: DatabaseRepository,
    propertyRepo: PropertyRepository,
    relationRepo: RelationRepository,
    viewRepo: ViewRepository,
    workflowService: WorkflowService,
    workspaceRepo: WorkspaceRepository,
  ) {
    this.#unitOfWork = unitOfWork;
    this.#databaseRepo = databaseRepo;
    this.#propertyRepo = propertyRepo;
    this.#relationRepo = relationRepo;
    this.#viewRepo = viewRepo;
    this.#workflowService = workflowService;
    this.#workspaceRepo = workspaceRepo;
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
          views: [],
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
          views: [],
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
          views: [],
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
            { key: 'prop_tx_amount', name: isAr ? 'المبلغ الإجمالي' : 'Total Amount', type: 'money' },
            { key: 'prop_tx_fee', name: isAr ? 'الرسوم' : 'Total Fee', type: 'money' },
            { key: 'prop_tx_net', name: isAr ? 'الصافي' : 'Net Amount', type: 'money' },
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
          views: [],
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
          views: [],
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
          views: [],
          visibility: 'advanced',
        },
      ],
      description: isAr ? 'مساحة عمل جاهزة لإدارة المحلات التجارية والمخزون والحسابات' : 'Ready-to-use retail workspace template for shop operations, inventory, and accounts.',
      name: isAr ? 'قالب التجزئة المتكامل' : 'Retail Workspace Template',
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

    // 5. Pages keep their blocks as canonical JSON and remap linked IDs.
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

    // 6. Workflows are imported with all Database/Property/Relation IDs fixed.
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
