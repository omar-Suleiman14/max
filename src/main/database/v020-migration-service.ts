import type { DatabaseSync } from 'node:sqlite';

import type { PropertyType } from '../../shared/property-contract';
import type { FilterNode, SortRule } from '../../shared/query-contract';
import type { ViewFilterRule, ViewSortRule, ViewTargetKind } from '../../shared/views-search-contract';
import { WorkspaceDomainError } from '../../shared/workspace-contract';
import type { BackupService } from './backup-service';
import type { DatabaseUnitOfWork } from './database-unit-of-work';
import type { PropertyRepository } from './property-repository';
import type { WorkspaceTemplateService } from './workspace-template-service';
import type { RecordRepository } from './record-repository';
import type { RelationRepository } from './relation-repository';
import type { ViewRepository } from './view-repository';
import type { WorkspaceRepository } from './workspace-repository';

type LegacyPropertyRow = Readonly<{
  id: string;
  name: string;
  object_kind: 'item' | 'person';
  property_type: PropertyType;
  rules_json: string;
  semantic_role: 'DISPLAY_NAME' | 'PRICE' | 'QUANTITY' | null;
}>;

type LegacyPropertyRules = Readonly<{
  choices?: readonly string[];
  relationTarget?: 'item' | 'person';
  required?: boolean;
  unique?: boolean;
}>;

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function remapLegacyPageContent(raw: string, databaseIds: Readonly<Record<string, string>>): string {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;

    const source = value as Readonly<Record<string, unknown>>;
    const remapped = Object.fromEntries(
      Object.entries(source)
        .filter(([key]) => key !== 'databaseKind')
        .map(([key, child]) => [key, visit(child)]),
    ) as Record<string, unknown>;
    if (source.type === 'database-view') {
      const legacyKind = typeof source.databaseKind === 'string'
        ? source.databaseKind
        : typeof source.content === 'string'
          ? source.content
          : '';
      const databaseId = databaseIds[legacyKind];
      if (databaseId) {
        remapped.content = '';
        remapped.databaseId = databaseId;
      }
    }
    return remapped;
  };

  return JSON.stringify(visit(parseJson<unknown>(raw, [])));
}

export type MigrationSummary = Readonly<{
  accountsMigrated: number;
  inventoryMovementsMigrated: number;
  itemsMigrated: number;
  moneyMovementsMigrated: number;
  pagesMigrated: number;
  parityCheckPassed: boolean;
  peopleMigrated: number;
  transactionsMigrated: number;
  viewsMigrated: number;
}>;

export class V020MigrationService {
  readonly #database: DatabaseSync;
  readonly #unitOfWork: DatabaseUnitOfWork;
  readonly #templateService: WorkspaceTemplateService;
  readonly #recordRepo: RecordRepository;
  readonly #relationRepo: RelationRepository;
  readonly #workspaceRepo: WorkspaceRepository;
  readonly #propertyRepo: PropertyRepository;
  readonly #viewRepo: ViewRepository;
  readonly #backupService: BackupService;
  readonly #persistent: boolean;

  constructor(
    database: DatabaseSync,
    unitOfWork: DatabaseUnitOfWork,
    templateService: WorkspaceTemplateService,
    recordRepo: RecordRepository,
    relationRepo: RelationRepository,
    workspaceRepo: WorkspaceRepository,
    propertyRepo: PropertyRepository,
    viewRepo: ViewRepository,
    backupService: BackupService,
    persistent: boolean,
  ) {
    this.#database = database;
    this.#unitOfWork = unitOfWork;
    this.#templateService = templateService;
    this.#recordRepo = recordRepo;
    this.#relationRepo = relationRepo;
    this.#workspaceRepo = workspaceRepo;
    this.#propertyRepo = propertyRepo;
    this.#viewRepo = viewRepo;
    this.#backupService = backupService;
    this.#persistent = persistent;
  }

  isMigrated(): boolean {
    const row = this.#database
      .prepare('SELECT COUNT(*) AS c FROM workspace_migration_map')
      .get() as { c: number } | undefined;

    return Boolean(row && row.c > 0);
  }

  migrate(locale: 'ar' | 'en' = 'en'): MigrationSummary {
    if (this.isMigrated()) return this.#migrationSummary(true);
    const templateSelection = this.#database.prepare("SELECT value FROM app_metadata WHERE key = 'workspace.template.id'").get() as { value: string } | undefined;
    if (templateSelection?.value === 'blank') {
      return { accountsMigrated: 0, inventoryMovementsMigrated: 0, itemsMigrated: 0, moneyMovementsMigrated: 0, pagesMigrated: 0, parityCheckPassed: true, peopleMigrated: 0, transactionsMigrated: 0, viewsMigrated: 0 };
    }
    if (this.#persistent) this.#backupService.createBackup('pre-migration');
    return this.#unitOfWork.run(() => {
      // 1. Install Retail Template structure if databases not already created
      const template = this.#templateService.getRetailTemplate(locale);
      const { databaseMap, propertyMap } = this.#templateService.importTemplate(template);

      const productsDbId = databaseMap.get('db_products')!;
      const peopleDbId = databaseMap.get('db_people')!;
      const accountsDbId = databaseMap.get('db_accounts')!;
      const txDbId = databaseMap.get('db_transactions')!;
      const invDbId = databaseMap.get('db_inventory_movements')!;
      const mmDbId = databaseMap.get('db_money_movements')!;

      const legacyPropertyMap = new Map<string, string>();
      const legacyRelationMap = new Map<string, string>();
      const legacyOptionMap = new Map<string, Map<string, string>>();
      const databaseForKind = (kind: 'item' | 'person') => kind === 'item' ? productsDbId : peopleDbId;

      // Preserve every configurable v0.1.1 Property. Semantic display/price
      // fields map to stable template Properties; quantity remains derived from
      // Inventory Movements and is intentionally not copied.
      const legacyProperties = this.#database.prepare(`
        SELECT id, object_kind, name, property_type, rules_json, semantic_role
        FROM object_properties
        WHERE archived_at IS NULL
        ORDER BY object_kind, position, id
      `).all() as LegacyPropertyRow[];

      for (const property of legacyProperties) {
        if (property.semantic_role === 'DISPLAY_NAME') {
          const titleId = propertyMap.get(property.object_kind === 'item' ? 'prop_prod_name' : 'prop_people_name');
          if (titleId) legacyPropertyMap.set(property.id, titleId);
          continue;
        }
        if (property.semantic_role === 'PRICE' && property.object_kind === 'item') {
          const priceId = propertyMap.get('prop_prod_price');
          if (priceId) legacyPropertyMap.set(property.id, priceId);
          continue;
        }
        if (property.semantic_role === 'QUANTITY') continue;

        const rules = parseJson<LegacyPropertyRules>(property.rules_json, {});
        const databaseId = databaseForKind(property.object_kind);
        const existing = this.#propertyRepo.listProperties(databaseId).find(
          (candidate) => candidate.name.localeCompare(property.name, undefined, { sensitivity: 'accent' }) === 0,
        );
        let created = existing?.type === property.property_type
          ? existing
          : this.#propertyRepo.createProperty({
              databaseId,
              name: existing ? `${property.name} (Legacy)` : property.name,
              options: ['select', 'status'].includes(property.property_type)
                ? (rules.choices ?? []).map((label) => ({ label }))
                : undefined,
              required: rules.required,
              type: property.property_type,
              uniqueValue: rules.unique,
            });
        if (existing && ['select', 'status'].includes(property.property_type)) {
          const optionLabels = new Set((created.options ?? []).map((option) => option.label));
          for (const label of rules.choices ?? []) {
            if (!optionLabels.has(label)) {
              this.#propertyRepo.createOption(created.id, { label });
              optionLabels.add(label);
            }
          }
          created = this.#propertyRepo.getProperty(created.id)!;
        }
        legacyPropertyMap.set(property.id, created.id);
        if (created.options) {
          legacyOptionMap.set(
            property.id,
            new Map(created.options.map((option) => [option.label, option.id])),
          );
        }
      }

      // Convert legacy relation Properties to canonical one-edge Relations.
      for (const property of legacyProperties.filter((candidate) => candidate.property_type === 'relation')) {
        const sourcePropertyId = legacyPropertyMap.get(property.id);
        if (!sourcePropertyId) continue;
        const rules = parseJson<LegacyPropertyRules>(property.rules_json, {});
        const targetKind = rules.relationTarget ?? (property.object_kind === 'item' ? 'person' : 'item');
        const relation = this.#relationRepo.createRelation({
          inversePropertyName: `${property.name} (related)`,
          sourceDatabaseId: databaseForKind(property.object_kind),
          sourcePropertyId,
          targetDatabaseId: databaseForKind(targetKind),
        });
        legacyRelationMap.set(property.id, relation.id);
      }

      const legacyValues = this.#database.prepare(`
        SELECT record_id, property_id, value_json
        FROM object_property_values
        WHERE active = 1
      `).all() as { property_id: string; record_id: string; value_json: string }[];
      const valuesByRecord = new Map<string, Record<string, unknown>>();
      for (const valueRow of legacyValues) {
        if (legacyRelationMap.has(valueRow.property_id)) continue;
        const targetPropertyId = legacyPropertyMap.get(valueRow.property_id);
        if (!targetPropertyId) continue;
        let value = parseJson<unknown>(valueRow.value_json, null);
        if (typeof value === 'string') {
          value = legacyOptionMap.get(valueRow.property_id)?.get(value) ?? value;
        }
        const recordValues = valuesByRecord.get(valueRow.record_id) ?? {};
        recordValues[targetPropertyId] = value;
        valuesByRecord.set(valueRow.record_id, recordValues);
      }

      const now = new Date().toISOString();
      const insertMap = this.#database.prepare(`
        INSERT OR IGNORE INTO workspace_migration_map (legacy_entity_type, legacy_id, workspace_entity_type, workspace_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const [key, id] of databaseMap) insertMap.run('template_database', key, 'database', id, now);
      for (const [key, id] of propertyMap) insertMap.run('template_property', key, 'property', id, now);
      for (const [legacyId, id] of legacyPropertyMap) {
        insertMap.run('legacy_property', legacyId, 'property', id, now);
      }

      // 2. Migrate Custom Pages
      let pagesMigrated = 0;
      const legacyPages = this.#database
        .prepare('SELECT * FROM shop_custom_pages WHERE archived_at IS NULL')
        .all() as { archived_at: string | null; created_at: string; icon: string | null; id: string; layout_json: string; name: string; updated_at: string }[];

      for (const p of legacyPages) {
        const node = this.#workspaceRepo.createNode({
          contentJson: remapLegacyPageContent(p.layout_json, {
            accounts: accountsDbId,
            items: productsDbId,
            people: peopleDbId,
            transactions: txDbId,
          }),
          icon: p.icon,
          id: p.id,
          kind: 'page',
          title: p.name,
        });
        insertMap.run('page', p.id, 'node', node.id, now);
        pagesMigrated++;
      }

      // 3. Migrate Items -> Products
      let itemsMigrated = 0;
      const legacyItems = this.#database
        .prepare("SELECT * FROM object_records WHERE object_kind = 'item' AND archived_at IS NULL")
        .all() as { archived_at: string | null; created_at: string; id: string; label: string; updated_at: string }[];

      const prodActivePropId = propertyMap.get('prop_prod_active');

      for (const item of legacyItems) {
        const itemRecord = this.#recordRepo.createRecord({
          databaseId: productsDbId,
          id: item.id,
          properties: {
            ...(valuesByRecord.get(item.id) ?? {}),
            [prodActivePropId!]: true,
          },
          title: item.label,
        });
        insertMap.run('item', item.id, 'record', itemRecord.id, now);
        itemsMigrated++;
      }

      // 4. Migrate People -> People
      let peopleMigrated = 0;
      const legacyPeople = this.#database
        .prepare("SELECT * FROM object_records WHERE object_kind = 'person' AND archived_at IS NULL")
        .all() as { archived_at: string | null; created_at: string; id: string; label: string; updated_at: string }[];

      for (const person of legacyPeople) {
        const personRecord = this.#recordRepo.createRecord({
          databaseId: peopleDbId,
          id: person.id,
          properties: valuesByRecord.get(person.id) ?? {},
          title: person.label,
        });
        insertMap.run('person', person.id, 'record', personRecord.id, now);
        peopleMigrated++;
      }

      for (const valueRow of legacyValues) {
        const relationId = legacyRelationMap.get(valueRow.property_id);
        const targetId = parseJson<unknown>(valueRow.value_json, null);
        if (relationId && typeof targetId === 'string') {
          this.#relationRepo.linkRecords(relationId, valueRow.record_id, targetId);
        }
      }

      // 5. Migrate Accounts -> Accounts
      let accountsMigrated = 0;
      const accountTypeProperty = this.#propertyRepo.getProperty(propertyMap.get('prop_acc_type')!);
      const mmDatePropId = propertyMap.get('prop_mm_date')!;
      const mmAmountPropId = propertyMap.get('prop_mm_amount')!;
      const relAccMm = this.#relationRepo.getRelationByPropertyId(propertyMap.get('prop_acc_money_rel')!);
      const relPersonMm = this.#relationRepo.getRelationByPropertyId(propertyMap.get('prop_people_money_rel')!);
      const relMmTx = this.#relationRepo.getRelationByPropertyId(propertyMap.get('prop_mm_tx_rel')!);
      const legacyAccounts = this.#database
        .prepare('SELECT * FROM shop_accounts WHERE archived_at IS NULL')
        .all() as {
          account_type: string;
          created_at: string;
          id: string;
          initial_balance: number;
          name: string;
        }[];

      for (const acc of legacyAccounts) {
        const accountTypeOptionId = accountTypeProperty?.options?.[
          ['cash', 'bank', 'wallet', 'other'].indexOf(acc.account_type)
        ]?.id;
        const accRecord = this.#recordRepo.createRecord({
          databaseId: accountsDbId,
          id: acc.id,
          properties: accountTypeOptionId ? { [accountTypeProperty.id]: accountTypeOptionId } : {},
          title: acc.name,
        });
        insertMap.run('account', acc.id, 'record', accRecord.id, now);
        if (acc.initial_balance !== 0) {
          const opening = this.#recordRepo.createRecord({
            databaseId: mmDbId,
            properties: {
              [mmAmountPropId]: acc.initial_balance,
              [mmDatePropId]: acc.created_at,
            },
            title: `Opening balance ${acc.initial_balance >= 0 ? '+' : ''}${acc.initial_balance.toFixed(2)}`,
          });
          if (relAccMm) this.#relationRepo.connect(relAccMm.id, acc.id, opening.id);
          insertMap.run('account_opening_balance', acc.id, 'record', opening.id, now);
        }
        accountsMigrated++;
      }

      // 6. Migrate Transactions -> Transactions
      let transactionsMigrated = 0;
      const legacyTx = this.#database
        .prepare('SELECT * FROM shop_transactions')
        .all() as {
          archived_at: string | null;
          customer_fee: number;
          customer_total: number;
          created_at: string;
          id: string;
          item_id: string | null;
          net_profit: number;
          note: string | null;
          person_id: string | null;
          provider_fee: number;
          quantity: number | null;
          service_fee: number;
          shop_net_cost: number;
          total_amount: number;
          transaction_type: string;
        }[];

      const txDatePropId = propertyMap.get('prop_tx_date');
      const txAmountPropId = propertyMap.get('prop_tx_amount');
      const txFeePropId = propertyMap.get('prop_tx_fee');
      const txNetPropId = propertyMap.get('prop_tx_net');
      const txQuantityPropId = propertyMap.get('prop_tx_quantity');
      const txUnitPricePropId = propertyMap.get('prop_tx_unit_price');
      const txPaymentMethodProperty = this.#propertyRepo.getProperty(propertyMap.get('prop_tx_payment_method')!);
      const txTypeProperty = this.#propertyRepo.getProperty(propertyMap.get('prop_tx_type')!);
      const relTxPerson = this.#relationRepo.getRelationByPropertyId(propertyMap.get('prop_tx_person_rel')!);
      const relTxAccount = this.#relationRepo.getRelationByPropertyId(propertyMap.get('prop_tx_acc_rel')!);
      const relTxProduct = this.#relationRepo.getRelationByPropertyId(propertyMap.get('prop_tx_product_rel')!);
      const txAccountRows = this.#database.prepare(`
        SELECT m.transaction_id, m.account_id, a.name, a.account_type
        FROM shop_money_movements m JOIN shop_accounts a ON a.id = m.account_id
        WHERE m.archived_at IS NULL ORDER BY m.id
      `).all() as { account_id: string; account_type: string; name: string; transaction_id: string }[];
      const accountByTransaction = new Map<string, (typeof txAccountRows)[number]>();
      for (const row of txAccountRows) if (!accountByTransaction.has(row.transaction_id)) accountByTransaction.set(row.transaction_id, row);

      for (const tx of legacyTx) {
        const typeOptionId = txTypeProperty?.options?.[
          ['sale', 'purchase', 'expense', 'transfer', 'income', 'adjustment', 'reversal'].indexOf(tx.transaction_type)
        ]?.id;
        const paymentAccount = accountByTransaction.get(tx.id);
        const paymentLabel = paymentAccount?.name.includes('Vodafone') ? 'Vodafone Cash'
          : paymentAccount?.name.includes('e&') ? 'e& Cash'
            : paymentAccount?.name.includes('Aman') ? 'Aman'
              : paymentAccount?.name.includes('InstaPay') ? 'InstaPay'
                : paymentAccount?.name.includes('Card') || paymentAccount?.name.includes('نقاط') ? (locale === 'ar' ? 'بطاقة' : 'Card')
                  : paymentAccount?.account_type === 'cash' ? (locale === 'ar' ? 'نقدي' : 'Cash')
                    : paymentAccount?.account_type === 'bank' ? (locale === 'ar' ? 'تحويل بنكي' : 'Bank Transfer')
                      : undefined;
        const paymentOptionId = txPaymentMethodProperty?.options?.find(({ label }) => label === paymentLabel)?.id;
        const quantity = tx.quantity && tx.quantity > 0 ? tx.quantity : undefined;
        const totalFee = tx.provider_fee + tx.customer_fee + tx.service_fee;
        const netAmount = (tx.customer_total || tx.total_amount) - tx.provider_fee;
        const txRecord = this.#recordRepo.createRecord({
          databaseId: txDbId,
          id: tx.id,
          properties: {
            ...(typeOptionId ? { [txTypeProperty.id]: typeOptionId } : {}),
            ...(paymentOptionId && txPaymentMethodProperty ? { [txPaymentMethodProperty.id]: paymentOptionId } : {}),
            [txAmountPropId!]: tx.total_amount,
            [txDatePropId!]: tx.created_at,
            [txFeePropId!]: totalFee,
            [txNetPropId!]: netAmount,
            ...(quantity && txQuantityPropId ? { [txQuantityPropId]: quantity } : {}),
            ...(quantity && txUnitPricePropId ? { [txUnitPricePropId]: tx.total_amount / quantity } : {}),
          },
          title: tx.note?.trim() || `TX-${tx.id.slice(0, 8)}`,
        });
        if (relTxPerson && tx.person_id) this.#relationRepo.connect(relTxPerson.id, txRecord.id, tx.person_id);
        if (relTxProduct && tx.item_id) this.#relationRepo.connect(relTxProduct.id, txRecord.id, tx.item_id);
        if (relTxAccount && paymentAccount) this.#relationRepo.connect(relTxAccount.id, txRecord.id, paymentAccount.account_id);
        if (tx.archived_at) this.#recordRepo.archiveRecord(txRecord.id);
        insertMap.run('transaction', tx.id, 'record', txRecord.id, now);
        transactionsMigrated++;
      }

      // 7. Migrate Inventory Movements
      let inventoryMovementsMigrated = 0;
      const legacyInv = this.#database
        .prepare('SELECT * FROM inventory_movements')
        .all() as {
          created_at: string;
          id: number;
          item_id: string;
          operation_id: string | null;
          quantity_delta: number;
        }[];

      const invDatePropId = propertyMap.get('prop_inv_date');
      const invDeltaPropId = propertyMap.get('prop_inv_delta');
      const relProdInv = this.#relationRepo.getRelationByPropertyId(propertyMap.get('prop_prod_inv_rel')!);
      const relInvTx = this.#relationRepo.getRelationByPropertyId(propertyMap.get('prop_inv_tx_rel')!);

      for (const inv of legacyInv) {
        const invRecord = this.#recordRepo.createRecord({
          databaseId: invDbId,
          properties: {
            [invDatePropId!]: inv.created_at,
            [invDeltaPropId!]: inv.quantity_delta,
          },
          title: `Movement ${inv.quantity_delta > 0 ? '+' : ''}${inv.quantity_delta}`,
        });

        if (relProdInv && inv.item_id) {
          this.#relationRepo.connect(relProdInv.id, inv.item_id, invRecord.id);
        }
        if (relInvTx && inv.operation_id) this.#relationRepo.connect(relInvTx.id, invRecord.id, inv.operation_id);

        insertMap.run('inventory_movement', String(inv.id), 'record', invRecord.id, now);
        inventoryMovementsMigrated++;
      }

      // 8. Migrate Money Movements
      let moneyMovementsMigrated = 0;
      const legacyMm = this.#database
        .prepare('SELECT * FROM shop_money_movements')
        .all() as {
          account_id: string;
          amount: number;
          created_at: string;
          id: number;
          movement_type: 'inflow' | 'outflow';
          transaction_id: string;
        }[];

      for (const mm of legacyMm) {
        const signedAmount = mm.movement_type === 'inflow' ? mm.amount : -mm.amount;
        const mmRecord = this.#recordRepo.createRecord({
          databaseId: mmDbId,
          properties: {
            [mmAmountPropId]: signedAmount,
            [mmDatePropId]: mm.created_at,
          },
          title: `Money ${signedAmount >= 0 ? '+' : ''}${signedAmount.toFixed(2)}`,
        });

        if (relAccMm && mm.account_id) {
          this.#relationRepo.connect(relAccMm.id, mm.account_id, mmRecord.id);
        }

        if (relMmTx) this.#relationRepo.connect(relMmTx.id, mmRecord.id, mm.transaction_id);
        const transaction = legacyTx.find((candidate) => candidate.id === mm.transaction_id);
        if (relPersonMm && transaction?.person_id) {
          this.#relationRepo.connect(relPersonMm.id, transaction.person_id, mmRecord.id);
        }

        insertMap.run('money_movement', String(mm.id), 'record', mmRecord.id, now);
        moneyMovementsMigrated++;
      }

      // 9. Migrate compatible legacy saved Views to stable Property IDs.
      let viewsMigrated = 0;
      const legacyViews = this.#database.prepare(`
        SELECT id, name, target_kind, filter_json, sort_json, group_by_property_id
        FROM shop_saved_views
        WHERE archived_at IS NULL
        ORDER BY position, id
      `).all() as {
        filter_json: string;
        group_by_property_id: string | null;
        id: string;
        name: string;
        sort_json: string;
        target_kind: ViewTargetKind;
      }[];
      const targetDatabase = new Map<ViewTargetKind, string>([
        ['item', productsDbId],
        ['person', peopleDbId],
        ['account', accountsDbId],
        ['transaction', txDbId],
      ]);
      const builtInFields = new Map<string, string>([
        ['account:account_type', propertyMap.get('prop_acc_type')!],
        ['account:name', propertyMap.get('prop_acc_name')!],
        ['item:label', propertyMap.get('prop_prod_name')!],
        ['person:label', propertyMap.get('prop_people_name')!],
        ['transaction:created_at', propertyMap.get('prop_tx_date')!],
        ['transaction:total_amount', propertyMap.get('prop_tx_amount')!],
        ['transaction:transaction_type', propertyMap.get('prop_tx_type')!],
      ]);
      const resolveField = (target: ViewTargetKind, field: string): string | undefined =>
        legacyPropertyMap.get(field) ?? builtInFields.get(`${target}:${field}`);

      for (const legacyView of legacyViews) {
        const databaseId = targetDatabase.get(legacyView.target_kind);
        if (!databaseId) continue;
        const filterRules = parseJson<readonly ViewFilterRule[]>(legacyView.filter_json, []);
        const conditions = filterRules.flatMap((rule): FilterNode[] => {
          const propertyId = resolveField(legacyView.target_kind, rule.field);
          if (!propertyId) return [];
          const operator = rule.operator === 'greater-than'
            ? 'greater_than'
            : rule.operator === 'less-than'
              ? 'less_than'
              : rule.operator.replaceAll('-', '_');
          return [{
            kind: 'property',
            operator: operator as Extract<FilterNode, { kind: 'property' }>['operator'],
            propertyId,
            value: rule.value,
          }];
        });
        const sortRules = parseJson<readonly ViewSortRule[]>(legacyView.sort_json, []);
        const sorts = sortRules.flatMap((rule): SortRule[] => {
          const propertyId = resolveField(legacyView.target_kind, rule.field);
          return propertyId ? [{ direction: rule.direction, propertyId }] : [];
        });
        const view = this.#viewRepo.createView({
          databaseId,
          filterAst: conditions.length > 0 ? { conditions, kind: 'group', operator: 'AND' } : null,
          id: legacyView.id,
          name: legacyView.name,
          group: legacyView.group_by_property_id
            ? { propertyId: resolveField(legacyView.target_kind, legacyView.group_by_property_id) ?? legacyView.group_by_property_id }
            : null,
          sorts,
        });
        insertMap.run('view', legacyView.id, 'view', view.id, now);
        viewsMigrated++;
      }

      // 10. Real parity checks. A mismatch aborts the transaction, leaving the
      // pre-migration backup and all v0.1.1 tables untouched.
      const parityCheckPassed = this.#verifyParity();
      if (!parityCheckPassed) {
        throw new WorkspaceDomainError('constraint-violation', 'v0.2.0 migration parity verification failed.');
      }

      return {
        accountsMigrated,
        inventoryMovementsMigrated,
        itemsMigrated,
        moneyMovementsMigrated,
        pagesMigrated,
        parityCheckPassed,
        peopleMigrated,
        transactionsMigrated,
        viewsMigrated,
      };
    });
  }

  #migrationSummary(parityCheckPassed: boolean): MigrationSummary {
    const count = (entityType: string): number => {
      const row = this.#database.prepare(`
        SELECT COUNT(*) AS count FROM workspace_migration_map WHERE legacy_entity_type = ?
      `).get(entityType) as { count: number };
      return row.count;
    };
    return {
      accountsMigrated: count('account'),
      inventoryMovementsMigrated: count('inventory_movement'),
      itemsMigrated: count('item'),
      moneyMovementsMigrated: count('money_movement'),
      pagesMigrated: count('page'),
      parityCheckPassed,
      peopleMigrated: count('person'),
      transactionsMigrated: count('transaction'),
      viewsMigrated: count('view'),
    };
  }

  #verifyParity(): boolean {
    const scalar = (sql: string, ...params: (number | string)[]): number => {
      const row = this.#database.prepare(sql).get(...params) as { value: number | null } | undefined;
      return Number(row?.value ?? 0);
    };
    const mappedCount = (type: string) => scalar(
      'SELECT COUNT(*) AS value FROM workspace_migration_map WHERE legacy_entity_type = ?',
      type,
    );
    const checks = [
      mappedCount('page') === scalar('SELECT COUNT(*) AS value FROM shop_custom_pages WHERE archived_at IS NULL'),
      mappedCount('item') === scalar("SELECT COUNT(*) AS value FROM object_records WHERE object_kind = 'item' AND archived_at IS NULL"),
      mappedCount('person') === scalar("SELECT COUNT(*) AS value FROM object_records WHERE object_kind = 'person' AND archived_at IS NULL"),
      mappedCount('account') === scalar('SELECT COUNT(*) AS value FROM shop_accounts WHERE archived_at IS NULL'),
      mappedCount('transaction') === scalar('SELECT COUNT(*) AS value FROM shop_transactions'),
      mappedCount('inventory_movement') === scalar('SELECT COUNT(*) AS value FROM inventory_movements'),
      mappedCount('money_movement') === scalar('SELECT COUNT(*) AS value FROM shop_money_movements'),
      mappedCount('view') === scalar('SELECT COUNT(*) AS value FROM shop_saved_views WHERE archived_at IS NULL'),
    ];

    const propertyId = (key: string): string | undefined => {
      const row = this.#database.prepare(`
        SELECT workspace_id FROM workspace_migration_map
        WHERE legacy_entity_type = 'template_property' AND legacy_id = ?
      `).get(key) as { workspace_id: string } | undefined;
      return row?.workspace_id;
    };
    const inventoryDeltaId = propertyId('prop_inv_delta');
    const moneyAmountId = propertyId('prop_mm_amount');
    const transactionAmountId = propertyId('prop_tx_amount');
    if (!inventoryDeltaId || !moneyAmountId || !transactionAmountId) return false;

    const legacyInventory = scalar('SELECT COALESCE(SUM(quantity_delta), 0) AS value FROM inventory_movements');
    const migratedInventory = scalar(`
      SELECT COALESCE(SUM(value.number_value), 0) AS value
      FROM workspace_migration_map map
      JOIN workspace_property_values value ON value.record_id = map.workspace_id
      WHERE map.legacy_entity_type = 'inventory_movement' AND value.property_id = ?
    `, inventoryDeltaId);
    const legacyMoney = scalar(`
      SELECT COALESCE((SELECT SUM(initial_balance) FROM shop_accounts WHERE archived_at IS NULL), 0) +
        COALESCE((SELECT SUM(CASE movement_type WHEN 'inflow' THEN amount ELSE -amount END) FROM shop_money_movements), 0)
        AS value
    `);
    const migratedMoney = scalar(`
      SELECT COALESCE(SUM(value.money_minor_value), 0) / 100.0 AS value
      FROM workspace_records record
      JOIN workspace_property_values value ON value.record_id = record.id
      WHERE record.database_id = (
        SELECT workspace_id FROM workspace_migration_map
        WHERE legacy_entity_type = 'template_database' AND legacy_id = 'db_money_movements'
      ) AND value.property_id = ?
    `, moneyAmountId);
    const legacyTransactions = scalar('SELECT COALESCE(SUM(total_amount), 0) AS value FROM shop_transactions');
    const migratedTransactions = scalar(`
      SELECT COALESCE(SUM(value.money_minor_value), 0) / 100.0 AS value
      FROM workspace_migration_map map
      JOIN workspace_property_values value ON value.record_id = map.workspace_id
      WHERE map.legacy_entity_type = 'transaction' AND value.property_id = ?
    `, transactionAmountId);

    return checks.every(Boolean)
      && Math.abs(legacyInventory - migratedInventory) < 0.0001
      && Math.abs(legacyMoney - migratedMoney) < 0.0001
      && Math.abs(legacyTransactions - migratedTransactions) < 0.0001;
  }
}
