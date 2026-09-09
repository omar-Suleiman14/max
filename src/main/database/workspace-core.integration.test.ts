import { legacyRetailMigrationTemplate } from './legacy-retail-migration';
import { describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';
import { phoneShopBlueprint } from '../../shared/starter-blueprints';

describe('Max v0.2.0 Core Workspace Integration Tests', () => {
  it('persists page content and carries it into new pages through templates', () => {
    const db = new DatabaseService(':memory:');
    db.initialize();
    try {
      const database = db.databases.createDatabase({ title: 'Projects' });
      const page = db.records.createRecord({ databaseId: database.id, title: 'Brief' });
      const contentJson = JSON.stringify([{ id: 'note', type: 'text', content: 'Define acceptance criteria.' }]);
      db.records.updateRecord(page.id, { contentJson });
      const saved = db.records.getRecord(page.id)!;
      expect(saved.contentJson).toBe(contentJson);
      const template = db.recordTemplates.create({ databaseId: database.id, name: 'Brief template', contentJson: saved.contentJson! });
      const copy = db.records.createRecord({ databaseId: database.id, title: 'New brief', templateId: template.id });
      expect(copy.contentJson).toBe(contentJson);
      expect(db.records.getRecord(page.id)?.contentJson).toBe(contentJson);
    } finally { db.close(); }
  });
  function createTestDb(): DatabaseService {
    const db = new DatabaseService(':memory:');
    db.initialize();
    return db;
  }

  describe('Nodes & Hierarchy', () => {
    it('archives and restores an owned database subtree without restoring previously trashed pages or linked sources', () => {
      const db = createTestDb();
      try {
        const page = db.workspace.createNode({ kind: 'page', title: 'Research' });
        const owned = db.databases.createDatabase({ title: 'Observations', parentNodeId: page.id });
        const linked = db.databases.createDatabase({ title: 'Shared references' });
        const record = db.records.createRecord({ databaseId: owned.id, title: 'A finding' });
        const old = db.workspace.createNode({ kind: 'page', title: 'Earlier draft', parentNodeId: page.id });
        db.workspace.archiveNode(old.id);
        db.workspace.updateNode(page.id, { contentJson: JSON.stringify({ blocks: [{ type: 'database-view', databaseId: linked.id }] }) });
        db.workspace.archiveNode(page.id);
        expect(db.workspace.getNavigation().databases.map((item) => item.id)).toEqual([linked.id]);
        expect(db.records.getRecord(record.id)?.archivedAt).not.toBeNull();
        db.workspace.restoreNode(page.id);
        expect(db.workspace.getNode(page.id)?.archivedAt).toBeNull();
        expect(db.workspace.getNavigation().databases.map((item) => item.id)).toContain(owned.id);
        expect(db.records.getRecord(record.id)?.archivedAt).toBeNull();
        expect(db.workspace.getNode(old.id)?.archivedAt).not.toBeNull();
        expect(db.workspace.getNode(linked.id)?.archivedAt).toBeNull();
      } finally { db.close(); }
    });
    it('creates pages and databases with order keys and builds navigation', () => {
      const db = createTestDb();

      const page1 = db.workspace.createNode({ kind: 'page', title: 'Home Dashboard' });
      const page2 = db.workspace.createNode({ kind: 'page', title: 'Inventory Log' });
      const subpage = db.workspace.createNode({
        kind: 'page',
        parentNodeId: page1.id,
        title: 'Monthly Summary',
      });

      expect(page1.id).toBeDefined();
      expect(page2.id).toBeDefined();
      expect(subpage.parentNodeId).toBe(page1.id);

      const nav = db.workspace.getNavigation();
      expect(nav.pages.length).toBe(3);
      expect(nav.pages.find((p) => p.id === page1.id)?.title).toBe('Home Dashboard');
      expect(nav.pages.find((p) => p.id === page1.id)?.level).toBe(0);
      expect(nav.pages.find((p) => p.id === subpage.id)?.level).toBe(1);
    });

    it('archives, restores, and reorders nodes with fractional indexing', () => {
      const db = createTestDb();

      const n1 = db.workspace.createNode({ kind: 'page', title: 'Doc 1' });
      const n2 = db.workspace.createNode({ kind: 'page', title: 'Doc 2' });

      db.workspace.archiveNode(n1.id);
      expect(db.workspace.getNode(n1.id)?.archivedAt).not.toBeNull();

      db.workspace.restoreNode(n1.id);
      expect(db.workspace.getNode(n1.id)?.archivedAt).toBeNull();

      // Reorder n2 before n1
      const updatedN2 = db.workspace.reorderNode(n2.id, '00000000000000000000000000');
      expect(updatedN2.positionKey).toBe('00000000000000000000000000');
    });

    it('permanently deletes a database handle and its owned data without leaving an inverse relation field behind', () => {
      const db = createTestDb();
      try {
        const source = db.databases.createDatabase({ title: 'Source' });
        const target = db.databases.createDatabase({ title: 'Target' });
        const sourceRelation = db.properties.createProperty({ databaseId: source.id, name: 'Target', type: 'relation' });
        const targetRelation = db.properties.createProperty({ databaseId: target.id, name: 'Source', type: 'relation' });
        const relation = db.relations.createRelation({ sourceDatabaseId: source.id, targetDatabaseId: target.id, sourcePropertyId: sourceRelation.id, inversePropertyId: targetRelation.id });
        const sourceRecord = db.records.createRecord({ databaseId: source.id, title: 'Source row' });
        const targetRecord = db.records.createRecord({ databaseId: target.id, title: 'Target row' });
        db.relations.connect(relation.id, sourceRecord.id, targetRecord.id);

        db.databases.permanentlyDeleteDatabase(source.id);

        expect(db.databases.getDatabase(source.id)).toBeNull();
        expect(db.records.getRecord(sourceRecord.id)).toBeNull();
        expect(db.workspace.getNavigation().databases.map((item) => item.id)).not.toContain(source.id);
        expect(db.databases.getDatabase(target.id)?.title).toBe('Target');
        expect(db.databases.getSchema(target.id).properties.some((property) => property.id === targetRelation.id)).toBe(false);
      } finally { db.close(); }
    });
  });

  describe('Databases & Properties', () => {
    it('creates a database with title property, number, money, select, formula, and rollup', () => {
      const db = createTestDb();

      const createdDb = db.databases.createDatabase({
        title: 'Products Inventory',
        visibility: 'normal',
      });

      const schema = db.databases.getSchema(createdDb.id);
      expect(schema.database.id).toBe(createdDb.id);
      // Title property is auto-created
      const titleProp = schema.properties.find((p) => p.type === 'title');
      expect(titleProp).toBeDefined();

      // Add Price property
      const priceProp = db.properties.createProperty({
        databaseId: createdDb.id,
        name: 'Selling Price',
        type: 'number',
      });
      expect(priceProp.type).toBe('number');

      // Add Category Select property
      const categoryProp = db.properties.createProperty({
        databaseId: createdDb.id,
        name: 'Category',
        options: [
          { label: 'Electronics' },
          { label: 'Groceries' },
        ],
        type: 'select',
      });
      expect(categoryProp.options?.length).toBe(2);

      // Add Formula property (Price * 1.14 for VAT)
      const vatProp = db.properties.createProperty({
        config: { formula: `[${priceProp.id}] * 1.14` },
        databaseId: createdDb.id,
        name: 'Price with VAT',
        type: 'formula',
      });
      expect(vatProp.type).toBe('formula');

      const fullSchema = db.databases.getSchema(createdDb.id);
      expect(fullSchema.properties.length).toBe(4);
    });
  });

  describe('Records & Computed Properties (Formulas & Rollups)', () => {
    it('computes formulas and relations dynamically for records', () => {
      const db = createTestDb();

      // 1. Create Products DB
      const prodDb = db.databases.createDatabase({ title: 'Products' });

      const costProp = db.properties.createProperty({
        databaseId: prodDb.id,
        name: 'Cost',
        type: 'number',
      });
      const markupProp = db.properties.createProperty({
        databaseId: prodDb.id,
        name: 'Markup',
        type: 'number',
      });
      const priceFormulaProp = db.properties.createProperty({
        config: { formula: `[${costProp.id}] + [${markupProp.id}]` },
        databaseId: prodDb.id,
        name: 'Calculated Price',
        type: 'formula',
      });

      // 2. Create Record with values
      const rec = db.records.createRecord({
        databaseId: prodDb.id,
        properties: {
          [costProp.id]: 100,
          [markupProp.id]: 25,
        },
        title: 'iPhone 15 Case',
      });

      expect(rec.sequence).toBe(1);

      // 3. Query record and verify formula evaluation
      const queryRes = db.databaseQuery.query({
        databaseId: prodDb.id,
      });

      expect(queryRes.records.length).toBe(1);
      const item = queryRes.records[0]!;
      expect(item.title).toBe('iPhone 15 Case');
      expect(item.properties[costProp.id]).toBe(100);
      expect(item.properties[markupProp.id]).toBe(25);
      expect(item.properties[priceFormulaProp.id]).toBe(125);
    });

    it('evaluates Rollup sums over connected relations correctly', () => {
      const db = createTestDb();

      // DB 1: Items
      const itemsDb = db.databases.createDatabase({ title: 'Items' });
      // DB 2: Stock Movements
      const movementsDb = db.databases.createDatabase({ title: 'Movements' });

      const qtyProp = db.properties.createProperty({
        databaseId: movementsDb.id,
        name: 'Quantity Delta',
        type: 'number',
      });

      // Create relation Item <-> Movements (1-to-many)
      const relProp = db.properties.createProperty({
        databaseId: itemsDb.id,
        name: 'Movements',
        type: 'relation',
      });

      const rel = db.relations.createRelation({
        inversePropertyName: 'Item',
        sourceCardinality: 'one',
        sourceDatabaseId: itemsDb.id,
        sourcePropertyId: relProp.id,
        targetCardinality: 'many',
        targetDatabaseId: movementsDb.id,
      });

      // Add Rollup property to Items
      const stockRollupProp = db.properties.createProperty({
        config: {
          rollup: {
            aggregation: 'sum',
            relationPropertyId: relProp.id,
            targetPropertyId: qtyProp.id,
          },
        },
        databaseId: itemsDb.id,
        name: 'Total Stock',
        type: 'rollup',
      });

      // Create Item record
      const itemRec = db.records.createRecord({
        databaseId: itemsDb.id,
        properties: {},
        title: 'Laptop Pro 16',
      });

      // Create Movements
      const mov1 = db.records.createRecord({
        databaseId: movementsDb.id,
        properties: { [qtyProp.id]: 10 },
        title: 'Initial Stock',
      });
      const mov2 = db.records.createRecord({
        databaseId: movementsDb.id,
        properties: { [qtyProp.id]: -3 },
        title: 'Customer Sale',
      });

      // Connect movements to item
      db.relations.connect(rel.id, itemRec.id, mov1.id);
      db.relations.connect(rel.id, itemRec.id, mov2.id);

      // Query Items DB and check computed Stock
      const queryRes = db.databaseQuery.query({
        databaseId: itemsDb.id,
      });

      expect(queryRes.records.length).toBe(1);
      const product = queryRes.records[0]!;
      expect(product.properties[stockRollupProp.id]).toBe(7); // 10 - 3 = 7!
    });
  });

  describe('Database Query Service (Filters, Sorts, Aggregations)', () => {
    it('executes complex filter ASTs, sorts, and calculations accurately', () => {
      const db = createTestDb();

      const salesDb = db.databases.createDatabase({ title: 'Sales Ledger' });
      const amountProp = db.properties.createProperty({
        databaseId: salesDb.id,
        name: 'Amount',
        type: 'number',
      });
      const feeProp = db.properties.createProperty({
        databaseId: salesDb.id,
        name: 'Fee',
        type: 'number',
      });

      // Insert test records
      db.records.createRecord({
        databaseId: salesDb.id,
        properties: { [amountProp.id]: 500, [feeProp.id]: 10 },
        title: 'Sale #1',
      });
      db.records.createRecord({
        databaseId: salesDb.id,
        properties: { [amountProp.id]: 1200, [feeProp.id]: 25 },
        title: 'Sale #2',
      });
      db.records.createRecord({
        databaseId: salesDb.id,
        properties: { [amountProp.id]: 300, [feeProp.id]: 5 },
        title: 'Sale #3',
      });

      // Query with Filter (Amount >= 500), Sort (Amount DESC), Calculations (SUM Amount, AVG Fee)
      const res = db.databaseQuery.query({
        calculations: [
          { calculation: 'sum', propertyId: amountProp.id },
          { calculation: 'avg', propertyId: feeProp.id },
        ],
        databaseId: salesDb.id,
        filter: {
          kind: 'property',
          operator: 'greater_than_or_equal',
          propertyId: amountProp.id,
          value: 500,
        },
        sorts: [
          { direction: 'desc', propertyId: amountProp.id },
        ],
      });

      expect(res.totalCount).toBe(2);
      expect(res.records.length).toBe(2);
      expect(res.records[0]!.title).toBe('Sale #2'); // 1200
      expect(res.records[1]!.title).toBe('Sale #1'); // 500

      // Verify calculations
      const sumCalc = res.calculations.find((c) => c.propertyId === amountProp.id && c.calculation === 'sum');
      expect(sumCalc?.value).toBe(1700); // 1200 + 500

      const avgCalc = res.calculations.find((c) => c.propertyId === feeProp.id && c.calculation === 'avg');
      expect(avgCalc?.value).toBe(17.5); // (25 + 10) / 2
    });
  });

  describe('Workflows Execution Engine', () => {
    it('executes atomic multi-step workflow with variables and fee calculation', () => {
      const db = createTestDb();

      // Create target DB for workflow
      const ordersDb = db.databases.createDatabase({ title: 'Customer Orders' });
      const totalProp = db.properties.createProperty({
        databaseId: ordersDb.id,
        name: 'Total Paid',
        type: 'number',
      });

      // Create workflow
      const wf = db.workflows.createWorkflow({
        inputSchema: {
          fields: [
            { key: 'customerName', label: 'Customer Name', required: true, type: 'string' },
            { key: 'orderAmount', label: 'Order Amount', required: true, type: 'number' },
          ],
        },
        kind: 'custom',
        name: 'Process Retail Order',
        steps: [
          // Step 1: Validate input > 0
          {
            config: {
              condition: '[orderAmount] > 0',
              errorMessage: 'Order amount must be positive',
            },
            type: 'VALIDATE',
          },
          // Step 2: Compute fee markup
          {
            config: {
              assignments: {
                finalAmount: '[orderAmount] + 15',
              },
            },
            type: 'COMPUTE',
          },
          // Step 3: Create Order Record
          {
            config: {
              databaseId: ordersDb.id,
              properties: {
                [totalProp.id]: '$finalAmount',
              },
              title: '$customerName',
            },
            type: 'CREATE_RECORD',
          },
          // Step 4: Return result
          {
            config: {
              orderTotal: '$finalAmount',
              status: 'CONFIRMED',
            },
            type: 'RETURN_RESULT',
          },
        ],
      });

      expect(wf.id).toBeDefined();

      // Execute workflow
      const runResult = db.workflows.execute({
        actorId: 'cashier-1',
        inputs: {
          customerName: 'Ahmed Omar',
          orderAmount: 200,
        },
        workflowId: wf.id,
      });

      expect(runResult.status).toBe('completed');
      expect(runResult.result.status).toBe('CONFIRMED');
      expect(runResult.result.orderTotal).toBe(215);
      expect(runResult.createdRecordIds.length).toBe(1);

      // Verify the record was inserted in SQLite
      const createdRecord = db.records.getRecord(runResult.createdRecordIds[0]!);
      expect(createdRecord?.title).toBe('Ahmed Omar');
      expect(createdRecord?.properties[totalProp.id]).toBe(215);
    });

    it('rolls back test runs and failed multi-step workflows without partial records', () => {
      const db = createTestDb();
      const target = db.databases.createDatabase({ title: 'Atomic target' });
      const workflow = db.workflows.createWorkflow({
        inputSchema: { fields: [] },
        name: 'Atomic workflow',
        steps: [
          { config: { databaseId: target.id, title: "'Temporary'" }, type: 'CREATE_RECORD' },
          { config: { condition: 'false', errorMessage: 'Stop' }, type: 'VALIDATE' },
        ],
      });

      expect(() => db.workflows.execute({ inputs: {}, workflowId: workflow.id })).toThrow('Stop');
      expect(db.records.listRecords(target.id)).toHaveLength(0);

      const testWorkflow = db.workflows.createWorkflow({
        inputSchema: { fields: [] },
        name: 'Dry run',
        steps: [{ config: { databaseId: target.id, title: "'Dry run record'" }, type: 'CREATE_RECORD' }],
      });
      const result = db.workflows.execute({ inputs: {}, testMode: true, workflowId: testWorkflow.id });
      expect(result.status).toBe('rolled_back');
      expect(db.records.listRecords(target.id)).toHaveLength(0);
    });
  });

  describe('Retail Workspace Template & Universal Search', () => {
    it('imports full Retail Template and queries records via Universal FTS5 Search', () => {
      const db = createTestDb();

      const template = legacyRetailMigrationTemplate('en');
      const importResult = db.workspaceTemplates.importBlueprintV2(template);

      expect(importResult.databaseCount).toBeGreaterThan(3);
      expect(importResult.databases.some((d) => d.key === 'db_products')).toBe(true);

      const transactionDb = importResult.databases.find((database) => database.key === 'db_transactions')!;
      const transactionSchema = db.databases.getSchema(transactionDb.id);
      const todayView = transactionSchema.views.find(({ name }) => name === 'Today')!;
      expect(todayView.filterAst).toMatchObject({ operator: 'relative_date', relativePeriod: 'TODAY' });
      expect(todayView.group).toMatchObject({ dateGranularity: 'day' });
      expect(transactionSchema.views.map(({ name }) => name)).toEqual(expect.arrayContaining(['Today', 'This Week', 'This Month', 'All Transactions']));

      const quantity = transactionSchema.properties.find(({ name }) => name === 'Quantity')!;
      const unitPrice = transactionSchema.properties.find(({ name }) => name === 'Unit Price')!;
      const lineTotal = transactionSchema.properties.find(({ name }) => name === 'Quantity × Price')!;
      const date = transactionSchema.properties.find(({ name }) => name === 'Date')!;
      const amount = transactionSchema.properties.find(({ name }) => name === 'Total Amount')!;
      const today = new Date().toISOString().slice(0, 10);
      const yesterdayDate = new Date();
      yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
      db.records.createRecord({ databaseId: transactionDb.id, properties: { [amount.id]: 300, [date.id]: today, [quantity.id]: 2, [unitPrice.id]: 150 }, title: 'Today sale' });
      db.records.createRecord({ databaseId: transactionDb.id, properties: { [amount.id]: 99, [date.id]: yesterdayDate.toISOString().slice(0, 10) }, title: 'Yesterday sale' });
      const todayResult = db.databaseQuery.query({ calculations: [{ calculation: 'sum', propertyId: amount.id }], databaseId: transactionDb.id, filter: todayView.filterAst, group: todayView.group });
      expect(todayResult.records).toHaveLength(1);
      expect(todayResult.records[0]?.properties[lineTotal.id]).toBe(300);
      expect(todayResult.calculations[0]?.value).toBe(300);

      const deviceTemplate = db.recordTemplates.list(importResult.databases.find(({ key }) => key === 'db_products')!.id).find(({ name }) => name === 'Device')!;
      const templatedRecord = db.records.createRecord({ databaseId: deviceTemplate.databaseId, properties: {}, templateId: deviceTemplate.id, title: 'Pixel 10' });
      expect(templatedRecord.icon).toBe('📱');
      expect(templatedRecord.contentJson).toContain('Device details');

      expect(db.workflows.listWorkflows()).toEqual([]);

      // Create a product record
      const prodDb = importResult.databases.find((d) => d.key === 'db_products')!;
      const prodRec = db.records.createRecord({
        databaseId: prodDb.id,
        properties: {},
        title: 'MacBook Air M3 Midnight 16GB',
      });

      // Universal FTS5 search query
      const searchResults = db.workspaceSearch.search('MacBook Air', 10);
      expect(searchResults.length).toBeGreaterThanOrEqual(1);
      expect(searchResults[0]!.displayTitle).toContain('MacBook');

      db.records.updateRecord(prodRec.id, { title: 'MacBook Air M3 Midnight Edition 512GB SSD' });
      expect(db.workspaceSearch.search('Midnight Edition', 10)[0]?.entityId).toBe(prodRec.id);
    });

    it('imports real pages, views, workflows, and inverse relations from Blueprint v2', () => {
      const db = createTestDb();
      const result = db.workspaceTemplates.importBlueprintV2({
        databases: [
          {
            defaultViewKey: 'view_repairs',
            key: 'db_repairs',
            properties: [
              { key: 'prop_repair_title', name: 'Repair', type: 'title' },
              { key: 'prop_repair_customer', name: 'Customer', type: 'relation' },
            ],
            title: 'Repairs',
            views: [{ key: 'view_repairs', layout: 'table', name: 'All Repairs' }],
          },
          {
            key: 'db_people',
            properties: [
              { key: 'prop_person_title', name: 'Name', type: 'title' },
              { key: 'prop_person_repairs', name: 'Repairs', type: 'relation' },
            ],
            title: 'People',
            views: [],
          },
        ],
        name: 'Repair Shop',
        pages: [{ contentJson: '[]', key: 'page_home', title: 'Repair Dashboard' }],
        relations: [{
          inversePropertyKey: 'prop_person_repairs',
          key: 'rel_customer_repairs',
          sourceDatabaseKey: 'db_repairs',
          sourcePropertyKey: 'prop_repair_customer',
          targetDatabaseKey: 'db_people',
        }],
        version: 2,
        workflows: [{
          inputSchema: { fields: [] },
          key: 'workflow_new_repair',
          name: 'New Repair',
          steps: [{ config: { status: 'ready' }, id: 'return', type: 'RETURN_RESULT' }],
        }],
      });

      expect(result.pageCount).toBe(1);
      expect(result.workflowCount).toBe(1);
      expect(db.workspace.getNode(result.pages[0]!.id)?.title).toBe('Repair Dashboard');
      expect(db.workflows.listWorkflows().map((workflow) => workflow.name)).toContain('New Repair');

      const repairsId = result.databases.find((database) => database.key === 'db_repairs')!.id;
      const repairsSchema = db.databases.getSchema(repairsId);
      expect(repairsSchema.database.defaultViewId).toBe(
        repairsSchema.views.find((view) => view.name === 'All Repairs')?.id,
      );
      const relationProperty = repairsSchema.properties.find((property) => property.name === 'Customer')!;
      const relation = db.relations.getRelationByPropertyId(relationProperty.id)!;
      expect(relation.inversePropertyId).toBeTruthy();
    });

    it('queries property text, groups dates by month, and duplicates records with remapped options', () => {
      const db = createTestDb();
      const repairs = db.databases.createDatabase({ title: 'Repairs' });
      const note = db.properties.createProperty({ databaseId: repairs.id, name: 'Problem', type: 'text' });
      const date = db.properties.createProperty({ databaseId: repairs.id, name: 'Date', type: 'date' });
      const status = db.properties.createProperty({
        databaseId: repairs.id,
        name: 'Status',
        options: [{ label: 'Open' }, { label: 'Done' }],
        type: 'select',
      });
      const openOptionId = status.options![0]!.id;
      db.records.createRecord({
        databaseId: repairs.id,
        properties: { [date.id]: '2026-08-04', [note.id]: 'needle in charging port', [status.id]: openOptionId },
        title: 'Phone repair',
      });

      const query = db.databaseQuery.query({
        databaseId: repairs.id,
        group: { dateGranularity: 'month', propertyId: date.id },
        search: 'needle',
      });
      expect(query.records).toHaveLength(1);
      expect(query.groups?.[0]?.groupKey).toBe('2026-08');

      const duplicate = db.databases.duplicateDatabase(repairs.id, 'Repairs Copy', true);
      const duplicateSchema = db.databases.getSchema(duplicate.id);
      const duplicateStatus = duplicateSchema.properties.find((property) => property.name === 'Status')!;
      const duplicateRecord = db.records.listRecords(duplicate.id)[0]!;
      expect(duplicateRecord.title).toBe('Phone repair');
      expect(duplicateRecord.properties[duplicateStatus.id]).toBe(duplicateStatus.options![0]!.id);
      expect(duplicateRecord.properties[duplicateStatus.id]).not.toBe(openOptionId);
    });

    it('uses one canonical relation edge from either side and rejects copied relation values', () => {
      const db = createTestDb();
      const repairs = db.databases.createDatabase({ title: 'Repairs' });
      const people = db.databases.createDatabase({ title: 'People' });
      const customer = db.properties.createProperty({ databaseId: repairs.id, name: 'Customer', type: 'relation' });
      const inverse = db.properties.createProperty({ databaseId: people.id, name: 'Repairs', type: 'relation' });
      const relation = db.relations.createRelation({
        inversePropertyId: inverse.id,
        sourceDatabaseId: repairs.id,
        sourcePropertyId: customer.id,
        targetDatabaseId: people.id,
      });
      const repair = db.records.createRecord({ databaseId: repairs.id, title: 'Screen replacement' });
      const person = db.records.createRecord({ databaseId: people.id, title: 'Ahmed' });

      db.relations.linkRecords(relation.id, person.id, repair.id);
      expect(db.relations.getRelatedRecords(repair.id, relation.id)[0]?.title).toBe('Ahmed');
      expect(db.relations.getRelatedRecords(person.id, relation.id)[0]?.title).toBe('Screen replacement');
      expect(() => db.records.updateProperty(repair.id, customer.id, [person.id])).toThrow(/dedicated API/);

      db.relations.unlinkRecords(relation.id, person.id, repair.id);
      expect(db.relations.getRelatedRecords(repair.id, relation.id)).toHaveLength(0);
    });
  });

  describe('v0.1.1 to v0.2.0 Data Migration Service', () => {
    it('keeps the Blank onboarding template genuinely blank across migration checks', () => {
      const db = createTestDb();
      db.completeOnboarding({ backupSchedule: 'manual', includeDemoData: false, locale: 'en', shopName: 'Blank Max', templateId: 'blank' });
      expect(db.v020Migration.migrate('en')).toMatchObject({ parityCheckPassed: true, itemsMigrated: 0, transactionsMigrated: 0 });
      expect(db.workspace.getNavigation().databases).toHaveLength(0);
    });

    it('migrates legacy shop data to generic workspace with 100% financial and inventory parity', () => {
      const db = createTestDb();

      // Complete onboarding with starter blueprint & demo data
      db.completeOnboarding({
        backupSchedule: 'daily',
        blueprint: phoneShopBlueprint,
        includeDemoData: true,
        locale: 'en',
        shopName: 'Max Demo Shop',
      });

      expect(db.v020Migration.isMigrated()).toBe(false);

      // Perform Migration
      const summary = db.v020Migration.migrate('en');

      expect(summary.parityCheckPassed).toBe(true);
      expect(summary.itemsMigrated).toBeGreaterThan(0);
      expect(summary.peopleMigrated).toBeGreaterThan(0);
      expect(summary.accountsMigrated).toBeGreaterThan(0);
      expect(summary.transactionsMigrated).toBeGreaterThan(0);
      expect(db.v020Migration.isMigrated()).toBe(true);

      const transactionsDatabase = db.workspace.getNavigation().databases.find(({ title }) => title === 'Transactions')!;
      const transactionSchema = db.databases.getSchema(transactionsDatabase.id);
      const quantity = transactionSchema.properties.find(({ name }) => name === 'Quantity')!;
      const fee = transactionSchema.properties.find(({ name }) => name === 'Total Fee')!;
      const paymentMethod = transactionSchema.properties.find(({ name }) => name === 'Payment Method')!;
      const migratedTransactions = db.databaseQuery.query({ databaseId: transactionsDatabase.id, limit: 200 }).records;
      expect(migratedTransactions.some((record) => Number(record.properties[quantity.id]) > 0)).toBe(true);
      expect(migratedTransactions.some((record) => Number(record.properties[fee.id]) > 0)).toBe(true);
      expect(migratedTransactions.some((record) => typeof record.properties[paymentMethod.id] === 'string')).toBe(true);
    });
  });
});

it('validates workflow numeric input before writes and rejects archived workflows',()=>{
  const db=new DatabaseService(':memory:');db.initialize();
  const workflow=db.workflows.createWorkflow({name:'Numeric check',kind:'custom',inputSchema:{fields:[{key:'amount',label:'Amount',type:'number',required:true}]},steps:[{type:'VALIDATE',config:{condition:'amount >= 0',errorMessage:'Value must be non-negative.'}}]});
  expect(()=>db.workflows.execute({workflowId:workflow.id,inputs:{amount:''}})).toThrow('required');
  expect(()=>db.workflows.execute({workflowId:workflow.id,inputs:{amount:'abc'}})).toThrow('finite');
  expect(()=>db.workflows.execute({workflowId:workflow.id,inputs:{amount:-5}})).toThrow('non-negative');
  db.workflows.archiveWorkflow(workflow.id);
  expect(()=>db.workflows.execute({workflowId:workflow.id,inputs:{amount:10}})).toThrow('not found');
  db.close();
});
