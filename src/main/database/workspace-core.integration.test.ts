import { describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';
import { phoneShopBlueprint } from '../../shared/starter-blueprints';

describe('Max v0.2.0 Core Workspace Integration Tests', () => {
  function createTestDb(): DatabaseService {
    const db = new DatabaseService(':memory:');
    db.initialize();
    return db;
  }

  describe('Nodes & Hierarchy', () => {
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
        type: 'money',
      });
      expect(priceProp.type).toBe('money');

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
  });

  describe('Retail Workspace Template & Universal Search', () => {
    it('imports full Retail Template and queries records via Universal FTS5 Search', () => {
      const db = createTestDb();

      const template = db.workspaceTemplates.getRetailTemplate('en');
      const importResult = db.workspaceTemplates.importBlueprintV2(template);

      expect(importResult.databaseCount).toBeGreaterThan(3);
      expect(importResult.databases.some((d) => d.key === 'db_products')).toBe(true);

      // Create a product record
      const prodDb = importResult.databases.find((d) => d.key === 'db_products')!;
      const prodRec = db.records.createRecord({
        databaseId: prodDb.id,
        properties: {},
        title: 'MacBook Air M3 Midnight 16GB',
      });

      // Update Search Index
      const node = db.workspace.getNode(prodRec.id)!;
      db.workspaceSearch.indexNode(node, 'Midnight Edition 512GB SSD');

      // Universal FTS5 search query
      const searchResults = db.workspaceSearch.search('MacBook Air', 10);
      expect(searchResults.length).toBeGreaterThanOrEqual(1);
      expect(searchResults[0]!.displayTitle).toContain('MacBook');
    });
  });

  describe('v0.1.1 to v0.2.0 Data Migration Service', () => {
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
    });
  });
});
