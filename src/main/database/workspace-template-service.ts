import type { TemplateImportResult, WorkspaceTemplateV2 } from '../../shared/template-v2-contract';
import type { DatabaseUnitOfWork } from './database-unit-of-work';
import type { DatabaseRepository } from './database-repository';
import type { PropertyRepository } from './property-repository';
import type { RelationRepository } from './relation-repository';

export class WorkspaceTemplateService {
  readonly #unitOfWork: DatabaseUnitOfWork;
  readonly #databaseRepo: DatabaseRepository;
  readonly #propertyRepo: PropertyRepository;
  readonly #relationRepo: RelationRepository;

  constructor(
    unitOfWork: DatabaseUnitOfWork,
    databaseRepo: DatabaseRepository,
    propertyRepo: PropertyRepository,
    relationRepo: RelationRepository,
  ) {
    this.#unitOfWork = unitOfWork;
    this.#databaseRepo = databaseRepo;
    this.#propertyRepo = propertyRepo;
    this.#relationRepo = relationRepo;
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
          key: 'rel_prod_inv',
          sourceCardinality: 'one',
          sourceDatabaseKey: 'db_products',
          sourcePropertyKey: 'prop_prod_inv_rel',
          targetCardinality: 'many',
          targetDatabaseKey: 'db_inventory_movements',
        },
        {
          key: 'rel_people_money',
          sourceCardinality: 'one',
          sourceDatabaseKey: 'db_people',
          sourcePropertyKey: 'prop_people_money_rel',
          targetCardinality: 'many',
          targetDatabaseKey: 'db_money_movements',
        },
        {
          key: 'rel_acc_money',
          sourceCardinality: 'one',
          sourceDatabaseKey: 'db_accounts',
          sourcePropertyKey: 'prop_acc_money_rel',
          targetCardinality: 'many',
          targetDatabaseKey: 'db_money_movements',
        },
        {
          key: 'rel_tx_person',
          sourceCardinality: 'many',
          sourceDatabaseKey: 'db_transactions',
          sourcePropertyKey: 'prop_tx_person_rel',
          targetCardinality: 'one',
          targetDatabaseKey: 'db_people',
        },
        {
          key: 'rel_tx_account',
          sourceCardinality: 'many',
          sourceDatabaseKey: 'db_transactions',
          sourcePropertyKey: 'prop_tx_acc_rel',
          targetCardinality: 'one',
          targetDatabaseKey: 'db_accounts',
        },
        {
          key: 'rel_tx_inv',
          sourceCardinality: 'one',
          sourceDatabaseKey: 'db_transactions',
          sourcePropertyKey: 'prop_inv_tx_rel',
          targetCardinality: 'many',
          targetDatabaseKey: 'db_inventory_movements',
        },
        {
          key: 'rel_tx_money',
          sourceCardinality: 'one',
          sourceDatabaseKey: 'db_transactions',
          sourcePropertyKey: 'prop_mm_tx_rel',
          targetCardinality: 'many',
          targetDatabaseKey: 'db_money_movements',
        },
      ],
      version: 2,
    };
  }

  importTemplate(template: WorkspaceTemplateV2): { databaseMap: Map<string, string>; propertyMap: Map<string, string> } {
    return this.#unitOfWork.run(() => {
      const databaseMap = new Map<string, string>();
      const propertyMap = new Map<string, string>();

      // 1. Create Databases & Properties
      for (const dbDraft of template.databases) {
        const createdDb = this.#databaseRepo.createDatabase({
          icon: dbDraft.icon,
          title: dbDraft.title,
          visibility: dbDraft.visibility,
        });
        databaseMap.set(dbDraft.key, createdDb.id);

        const schema = this.#databaseRepo.getSchema(createdDb.id);
        const titleProp = schema.properties.find((p) => p.type === 'title');
        if (titleProp) {
          const draftTitleProp = dbDraft.properties.find((p) => p.type === 'title');
          if (draftTitleProp) {
            propertyMap.set(draftTitleProp.key, titleProp.id);
            if (draftTitleProp.name !== titleProp.name) {
              this.#propertyRepo.updateProperty(titleProp.id, { name: draftTitleProp.name });
            }
          }
        }

        // Create other properties
        for (const propDraft of dbDraft.properties) {
          if (propDraft.type === 'title') continue;

          const createdProp = this.#propertyRepo.createProperty({
            config: propDraft.config,
            databaseId: createdDb.id,
            name: propDraft.name,
            options: propDraft.options?.map((o) => ({ label: o.label, style: o.style })),
            required: propDraft.required,
            type: propDraft.type,
            uniqueValue: propDraft.uniqueValue,
          });

          propertyMap.set(propDraft.key, createdProp.id);
        }
      }

      // 2. Create Relations
      if (template.relations) {
        for (const relDraft of template.relations) {
          const sourceDbId = databaseMap.get(relDraft.sourceDatabaseKey);
          const targetDbId = databaseMap.get(relDraft.targetDatabaseKey);
          const sourcePropId = propertyMap.get(relDraft.sourcePropertyKey);

          if (sourceDbId && targetDbId && sourcePropId) {
            this.#relationRepo.createRelation({
              sourceCardinality: relDraft.sourceCardinality,
              sourceDatabaseId: sourceDbId,
              sourcePropertyId: sourcePropId,
              targetCardinality: relDraft.targetCardinality,
              targetDatabaseId: targetDbId,
            });

            // Update Rollup configs with real property IDs if needed
            for (const dbDraft of template.databases) {
              for (const pDraft of dbDraft.properties) {
                if (pDraft.type === 'rollup' && pDraft.config && typeof pDraft.config === 'object') {
                  const roll = (pDraft.config as any).rollup;
                  if (roll) {
                    const realPropId = propertyMap.get(pDraft.key);
                    const realRelPropId = propertyMap.get(roll.relationPropertyId);
                    const realTargetPropId = propertyMap.get(roll.targetPropertyId);

                    if (realPropId && realRelPropId && realTargetPropId) {
                      this.#propertyRepo.updateProperty(realPropId, {
                        config: {
                          rollup: {
                            aggregation: roll.aggregation,
                            relationPropertyId: realRelPropId,
                            targetPropertyId: realTargetPropId,
                          },
                        },
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }

      return { databaseMap, propertyMap };
    });
  }

  importBlueprintV2(template: WorkspaceTemplateV2): TemplateImportResult {
    const res = this.importTemplate(template);
    const dbs: { id: string; key: string; title: string }[] = [];
    for (const dbDraft of template.databases) {
      const id = res.databaseMap.get(dbDraft.key);
      if (id) {
        dbs.push({ id, key: dbDraft.key, title: dbDraft.title });
      }
    }
    return {
      databaseCount: dbs.length,
      databases: dbs,
      pageCount: template.pages?.length ?? 0,
      pages: template.pages?.map((p) => ({ id: p.key, key: p.key, title: p.title })) ?? [],
      propertyCount: res.propertyMap.size,
      relationCount: template.relations?.length ?? 0,
      workflowCount: template.workflows?.length ?? 0,
    };
  }
}
