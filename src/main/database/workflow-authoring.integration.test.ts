import { afterEach, describe, expect, it } from 'vitest';

import type { WorkflowValue, WorkspaceWorkflowDraft } from '../../shared/workflow-contract';
import { DatabaseService } from './database-service';

const opened: DatabaseService[] = [];
function workspace() { const db = new DatabaseService(':memory:'); db.initialize(); opened.push(db); return db; }
afterEach(() => opened.splice(0).forEach((db) => db.close()));

const literal = (value: unknown): WorkflowValue => ({ source: 'literal', value });
const variable = (key: string): WorkflowValue => ({ source: 'variable', key });
const expression = (text: string, bindings: Record<string, WorkflowValue>): WorkflowValue => ({ source: 'expression', expression: text, bindings });

/** The shape the editor saves: value references everywhere, no formula strings. */
function authored(db: DatabaseService) {
  const orders = db.databases.createDatabase({ title: 'Orders' });
  const stock = db.databases.createDatabase({ title: 'Stock' });
  const total = db.properties.createProperty({ databaseId: orders.id, name: 'Total', type: 'number' });
  const sku = db.properties.createProperty({ databaseId: stock.id, name: 'SKU', type: 'text' });
  const level = db.properties.createProperty({ databaseId: stock.id, name: 'Level', type: 'number' });
  const item = db.records.createRecord({ databaseId: stock.id, properties: { [level.id]: 10, [sku.id]: 'A-1' }, title: 'Widget' });
  const draft: WorkspaceWorkflowDraft = {
    inputSchema: { fields: [
      { fields: [{ key: 'qty', label: 'Quantity', type: 'number' }, { key: 'price', label: 'Price', type: 'number' }], key: 'rows', label: 'Rows', maxItems: 5, minItems: 1, type: 'collection' },
      { key: 'code', label: 'Code', type: 'text' },
    ] },
    name: 'Place order',
    steps: [
      { config: { databaseId: stock.id, filter: { conditions: [{ kind: 'property', operator: 'equals', propertyId: sku.id, value: variable('code') }], kind: 'group', operator: 'AND' }, outputVariable: 'found' }, id: 'find', type: 'FIND_RECORD' },
      { config: { collection: variable('rows'), outputVariable: 'lines', steps: [
        { config: { outputVariable: 'line', value: expression('q * p', { p: { field: 'price', source: 'item' }, q: { field: 'qty', source: 'item' } }) }, id: 'line', type: 'COMPUTE' },
      ], yield: variable('line') }, id: 'each', type: 'FOR_EACH' },
      { config: { collection: variable('rows'), outputVariable: 'units', value: { field: 'qty', source: 'item' } }, id: 'sum', type: 'SUM' },
      { config: { collection: variable('rows'), outputVariable: 'subtotal', value: expression('q * p', { p: { field: 'price', source: 'item' }, q: { field: 'qty', source: 'item' } }) }, id: 'subtotal', type: 'SUM' },
      { config: { outputVariable: 'total', value: expression('s + 0', { s: variable('subtotal') }) }, id: 'total', type: 'COMPUTE' },
      { config: { condition: expression('u <= 10', { u: variable('units') }), errorMessage: 'Not enough stock' }, id: 'check', type: 'VALIDATE' },
      { config: { databaseId: orders.id, outputVariable: 'order', properties: { [total.id]: variable('total') }, title: literal('Order') }, id: 'create', type: 'CREATE_RECORD' },
      { config: { databaseId: stock.id, increments: { [level.id]: expression('-u', { u: variable('units') }) }, record: variable('found') }, id: 'update', type: 'UPDATE_RECORD' },
      { config: { outputs: [{ label: 'Total', value: variable('total') }, { label: 'Units', value: variable('units') }, { label: 'Lines', value: variable('lines') }] }, id: 'result', type: 'RETURN_RESULT' },
    ],
  };
  return { draft, item, level, orders, total };
}

describe('workflows authored in the editor', () => {
  it('saves and runs all eight step types, returning the named results', () => {
    const db = workspace();
    const s = authored(db);
    const action = db.workflows.createWorkflow(JSON.parse(JSON.stringify(s.draft)) as WorkspaceWorkflowDraft);
    expect(new Set(action.steps.map((step) => step.type)).size).toBe(8);
    const run = db.workflows.execute({ inputs: { code: 'A-1', rows: [{ price: 5, qty: 2 }, { price: 3, qty: 4 }] }, workflowId: action.id });
    expect(run.status).toBe('completed');
    expect(run.result).toEqual({ Lines: [10, 12], Total: 22, Units: 6 });
    expect(db.records.getRecord(s.item.id)?.properties[s.level.id]).toBe(4);
  });

  it('stops at a failed check with the author\'s message and writes nothing', () => {
    const db = workspace();
    const s = authored(db);
    const action = db.workflows.createWorkflow(s.draft);
    expect(() => db.workflows.execute({ inputs: { code: 'A-1', rows: [{ price: 1, qty: 11 }] }, workflowId: action.id })).toThrow('Not enough stock');
    expect(db.records.getRecord(s.item.id)?.properties[s.level.id]).toBe(10);
  });

  it('refuses a result without a name', () => {
    const db = workspace();
    expect(() => db.workflows.createWorkflow({ inputSchema: { fields: [] }, name: 'Nameless', steps: [{ config: { outputs: [{ label: ' ', value: literal(1) }] }, type: 'RETURN_RESULT' }] })).toThrow('every result needs a name');
  });

  it('still loads and runs a Max 1.x action with formula checks and $ results', () => {
    const db = workspace();
    const action = db.workflows.createWorkflow({
      inputSchema: { fields: [{ key: 'x', label: 'X', type: 'number' }] },
      name: 'Legacy',
      steps: [
        { config: { expression: 'x * 2', outputVariable: 'y' }, type: 'COMPUTE' },
        { config: { condition: 'y > 0', errorMessage: 'Must be positive' }, type: 'VALIDATE' },
        { config: { doubled: '$y', note: 'fixed' }, type: 'RETURN_RESULT' },
      ],
    });
    expect(db.workflows.execute({ inputs: { x: 4 }, workflowId: action.id }).result).toEqual({ doubled: 8, note: 'fixed' });
    expect(() => db.workflows.execute({ inputs: { x: -1 }, workflowId: action.id })).toThrow('Must be positive');
    const edited = db.workflows.updateWorkflow(action.id, { steps: action.steps.map((step) =>
      step.type === 'VALIDATE' ? { ...step, config: { ...step.config, condition: 'y > 10' } } : step,
    ) });
    expect(edited.steps[1]?.config.condition).toBe('y > 10');
    expect(() => db.workflows.execute({ inputs: { x: -1 }, workflowId: action.id })).toThrow('Must be positive');
    expect(() => db.workflows.execute({ inputs: { x: 4 }, workflowId: action.id })).toThrow('Must be positive');
    expect(db.workflows.execute({ inputs: { x: 6 }, workflowId: action.id }).status).toBe('completed');
  });
});
