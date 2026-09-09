import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseService } from './database-service';
import type { WorkflowValue, WorkspaceWorkflowDraft } from '../../shared/workflow-contract';

const opened: DatabaseService[] = [];
function workspace() { const db = new DatabaseService(':memory:'); db.initialize(); opened.push(db); return db; }
afterEach(() => opened.splice(0).forEach((db) => db.close()));
const literal = (value: unknown): WorkflowValue => ({ source: 'literal', value });
const variable = (key: string): WorkflowValue => ({ source: 'variable', key });
const property = (key: string, databaseId: string, propertyId: string): WorkflowValue => ({ source: 'property', record: variable(key), databaseId, propertyId });
const expression = (expression: string, bindings: Record<string, WorkflowValue>): WorkflowValue => ({ source: 'expression', expression, bindings });

/** Entire proof is ordinary configuration. No production names or handlers. */
function scenario(db: DatabaseService) {
  const nodes = db.databases.createDatabase({ title: 'Nodes' });
  const rules = db.databases.createDatabase({ title: 'Rules' });
  const events = db.databases.createDatabase({ title: 'Events' });
  const numeric = (databaseId: string, name: string) => db.properties.createProperty({ databaseId, name, type: 'number' });
  const label = db.properties.createProperty({ databaseId: nodes.id, name: 'Category', type: 'text' });
  const capacity = numeric(nodes.id, 'Capacity');
  const first = db.properties.createProperty({ databaseId: rules.id, name: 'First', type: 'text' });
  const second = db.properties.createProperty({ databaseId: rules.id, name: 'Second', type: 'text' });
  const factor = numeric(rules.id, 'Factor');
  const x = numeric(events.id, 'X'), y = numeric(events.id, 'Y'), z = numeric(events.id, 'Z');
  const edge = db.properties.createProperty({ databaseId: events.id, name: 'Nodes', type: 'relation' });
  const relation = db.relations.createRelation({ sourceDatabaseId: events.id, sourcePropertyId: edge.id, targetDatabaseId: nodes.id, sourceCardinality: 'many', targetCardinality: 'many', inversePropertyName: 'Events' });
  const a = db.records.createRecord({ databaseId: nodes.id, title: 'A', properties: { [label.id]: 'alpha', [capacity.id]: 100 } });
  const b = db.records.createRecord({ databaseId: nodes.id, title: 'B', properties: { [label.id]: 'beta', [capacity.id]: 20 } });
  db.records.createRecord({ databaseId: rules.id, title: 'Rule', properties: { [first.id]: 'alpha', [second.id]: 'beta', [factor.id]: 0.25 } });
  const draft: WorkspaceWorkflowDraft = {
    name: 'Record event', inputSchema: { fields: [
      { key: 'a', label: 'A', type: 'record', databaseId: nodes.id, required: true },
      { key: 'b', label: 'B', type: 'record', databaseId: nodes.id, required: true },
      { key: 'x', label: 'X', type: 'number', required: true },
    ] }, steps: [
      { id: 'find', type: 'FIND_RECORD', config: { databaseId: rules.id, outputVariable: 'rule', filter: { kind: 'group', operator: 'AND', conditions: [
        { kind: 'property', propertyId: first.id, operator: 'equals', value: property('a', nodes.id, label.id) },
        { kind: 'property', propertyId: second.id, operator: 'equals', value: property('b', nodes.id, label.id) },
      ] } } },
      { id: 'y', type: 'COMPUTE', config: { outputVariable: 'y', value: expression('x * rate', { x: variable('x'), rate: property('rule', rules.id, factor.id) }) } },
      { id: 'z', type: 'COMPUTE', config: { outputVariable: 'z', value: expression('x - y', { x: variable('x'), y: variable('y') }) } },
      { id: 'create', type: 'CREATE_RECORD', config: { databaseId: events.id, outputVariable: 'event', title: literal('Event'), properties: { [x.id]: variable('x'), [y.id]: variable('y'), [z.id]: variable('z'), [edge.id]: variable('a') } } },
      { id: 'decrease', type: 'UPDATE_RECORD', config: { databaseId: nodes.id, record: variable('a'), increments: { [capacity.id]: expression('-x', { x: variable('x') }) } } },
      { id: 'increase', type: 'UPDATE_RECORD', config: { databaseId: nodes.id, record: variable('b'), increments: { [capacity.id]: variable('z') } } },
      { id: 'relate', type: 'UPDATE_RECORD', config: { databaseId: nodes.id, record: variable('b'), properties: { [relation.inversePropertyId!]: variable('event') } } },
    ],
  };
  return { draft, a, b, nodes, rules, events, capacity, label, factor, x, y, z, edge, relation, inputs: { a: a.id, b: b.id, x: 12 } };
}

describe('Generic workspace actions', () => {
  it('starts empty and persists serializable definitions without defaults', () => {
    const db = workspace();
    expect(db.workflows.listWorkflows()).toEqual([]);
    const s = scenario(db);
    const action = db.workflows.createWorkflow(JSON.parse(JSON.stringify(s.draft)) as WorkspaceWorkflowDraft);
    expect(db.workflows.getWorkflow(action.id)?.steps).toEqual(action.steps);
    expect(db.workflows.updateWorkflow(action.id, { enabled: false }).enabled).toBe(false);
    expect(() => db.workflows.execute({ workflowId: action.id, inputs: s.inputs })).toThrow('disabled');
  });

  it('runs the complete generic proof with lookup, expressions, ordinary records, increments and both relation directions', () => {
    const db = workspace(), s = scenario(db);
    const action = db.workflows.createWorkflow(s.draft);
    const result = db.workflows.execute({ workflowId: action.id, inputs: s.inputs });
    expect(result.status).toBe('completed');
    const created = db.records.getRecord(result.createdRecordIds[0]!)!;
    expect(created.properties).toMatchObject({ [s.x.id]: 12, [s.y.id]: 3, [s.z.id]: 9 });
    expect(db.records.getRecord(s.a.id)?.properties[s.capacity.id]).toBe(88);
    expect(db.records.getRecord(s.b.id)?.properties[s.capacity.id]).toBe(29);
    expect(db.relations.getRelatedRecords(created.id, s.relation.id).map((r) => r.id).sort()).toEqual([s.a.id, s.b.id].sort());
    const formula = db.properties.createProperty({ databaseId: s.events.id, name: 'Computed', type: 'formula', config: { formula: { expression: `[${s.x.id}] + [${s.y.id}]` } } });
    expect(db.databaseQuery.query({ databaseId: s.events.id }).records[0]?.properties[formula.id]).toBe(15);
    expect(db.workspaceSearch.search('Event').some((r) => r.entityId === created.id)).toBe(true);
  });

  it('rolls back every write, relation and search entry when the last step fails', () => {
    const db = workspace(), s = scenario(db);
    const action = db.workflows.createWorkflow({ ...s.draft, steps: [...s.draft.steps, { type: 'VALIDATE', config: { condition: 'false', errorMessage: 'Forced failure' } }] });
    expect(() => db.workflows.execute({ workflowId: action.id, inputs: s.inputs })).toThrow('Forced failure');
    expect(db.records.listRecords(s.events.id)).toHaveLength(0);
    expect(db.records.getRecord(s.a.id)?.properties[s.capacity.id]).toBe(100);
    expect(db.records.getRecord(s.b.id)?.properties[s.capacity.id]).toBe(20);
    expect(db.relations.getRelatedRecords(s.a.id, s.relation.id)).toEqual([]);
    expect(db.workspaceSearch.search('Event').filter((r) => r.entityKind === 'record')).toEqual([]);
  });

  it('isolates definitions, inputs, lookups and updates from other workspace files', () => {
    const db = workspace(), other = workspace(), s = scenario(db), foreign = scenario(other);
    expect(() => db.workflows.createWorkflow({ ...s.draft, inputSchema: foreign.draft.inputSchema })).toThrow('workspace');
    expect(() => db.workflows.createWorkflow({ name: 'Read', inputSchema: { fields: [] }, steps: [{ type: 'FIND_RECORD', config: { databaseId: foreign.nodes.id, outputVariable: 'r' } }] })).toThrow('workspace');
    const action = db.workflows.createWorkflow(s.draft);
    expect(() => db.workflows.execute({ workflowId: action.id, inputs: { ...s.inputs, a: foreign.a.id } })).toThrow('unavailable');
    expect(() => other.workflows.execute({ workflowId: action.id, inputs: s.inputs })).toThrow('not found');
    expect(other.records.getRecord(foreign.a.id)?.properties[foreign.capacity.id]).toBe(100);
  });

  it('rejects broken properties during editing and revalidates after deletion', () => {
    const db = workspace(), s = scenario(db);
    const action = db.workflows.createWorkflow(s.draft);
    db.properties.archiveProperty(s.factor.id);
    expect(() => db.workflows.execute({ workflowId: action.id, inputs: s.inputs })).toThrow('deleted');
    expect(() => db.workflows.updateWorkflow(action.id, { name: 'Renamed' })).toThrow('deleted');
    expect(db.records.listRecords(s.events.id)).toEqual([]);
  });

  it('rejects missing matches, invalid input, expressions and unsupported increments clearly', () => {
    const db = workspace(), s = scenario(db);
    const action = db.workflows.createWorkflow(s.draft);
    expect(() => db.workflows.execute({ workflowId: action.id, inputs: { ...s.inputs, x: '12' } })).toThrow('finite');
    expect(() => db.workflows.execute({ workflowId: action.id, inputs: { ...s.inputs, b: s.a.id } })).toThrow('no record');
    expect(() => db.workflows.createWorkflow({ ...s.draft, steps: [{ type: 'COMPUTE', config: { outputVariable: 'v', expression: '1 +' } }] })).toThrow('invalid');
    expect(() => db.workflows.createWorkflow({ ...s.draft, steps: [{ type: 'UPDATE_RECORD', config: { databaseId: s.nodes.id, record: variable('a'), increments: { [s.label.id]: literal(1) } } }] })).toThrow('numeric');
  });

  it('accepts text, boolean, dates and select inputs with defaults', () => {
    const db = workspace();
    const action = db.workflows.createWorkflow({ name: 'Inputs', inputSchema: { fields: [
      { key: 'text', label: 'Text', type: 'text', defaultValue: 'Default' },
      { key: 'yes', label: 'Boolean', type: 'boolean', required: true },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'option', label: 'Option', type: 'select', options: [{ label: 'One', value: 'one' }] },
    ] }, steps: [{ type: 'RETURN_RESULT', config: { text: '$text', yes: '$yes', date: '$date', option: '$option' } }] });
    const inputs = { yes: false, date: '2026-09-07', option: 'one' };
    expect(db.workflows.execute({ workflowId: action.id, inputs }).result).toEqual({ ...inputs, text: 'Default' });
    expect(() => db.workflows.execute({ workflowId: action.id, inputs: { ...inputs, option: 'missing' } })).toThrow('allowed option');
  });
});
