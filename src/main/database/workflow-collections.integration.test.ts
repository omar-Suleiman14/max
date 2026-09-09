import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseService } from './database-service';
import type { WorkflowValue, WorkspaceWorkflowDraft } from '../../shared/workflow-contract';
import { parseWorkspaceTemplateV2 } from '../ipc/workspace-input-parsers';
const opened: DatabaseService[] = [];
const workspace = () => { const db = new DatabaseService(':memory:'); db.initialize(); opened.push(db); return db; };
afterEach(() => opened.splice(0).forEach(db => db.close()));
const literal = (value: unknown): WorkflowValue => ({ source: 'literal', value });
const variable = (key: string): WorkflowValue => ({ source: 'variable', key });
const item = (field?: string): WorkflowValue => (field ? { source: 'item', field } : { source: 'item' });
const product: WorkflowValue = { source: 'expression', expression: 'q * r', bindings: { q: item('quantity'), r: item('rate') } };
function fixture(db: DatabaseService) {
  const nodes = db.databases.createDatabase({ title: 'Nodes' }), entries = db.databases.createDatabase({ title: 'Entries' }), summaries = db.databases.createDatabase({ title: 'Summaries' });
  const factor = db.properties.createProperty({ databaseId: nodes.id, name: 'Factor', type: 'number' });
  const total = db.properties.createProperty({ databaseId: entries.id, name: 'Total', type: 'number' });
  const grand = db.properties.createProperty({ databaseId: summaries.id, name: 'Total', type: 'number' });
  const nodeLink = db.properties.createProperty({ databaseId: entries.id, name: 'Node', type: 'relation' });
  db.relations.createRelation({ sourceDatabaseId: entries.id, sourcePropertyId: nodeLink.id, targetDatabaseId: nodes.id, sourceCardinality: 'one', targetCardinality: 'many', inversePropertyName: 'Entries' });
  const entryLink = db.properties.createProperty({ databaseId: summaries.id, name: 'Entries', type: 'relation' });
  const relation = db.relations.createRelation({ sourceDatabaseId: summaries.id, sourcePropertyId: entryLink.id, targetDatabaseId: entries.id, sourceCardinality: 'many', targetCardinality: 'many', inversePropertyName: 'Summaries' });
  const a = db.records.createRecord({ databaseId: nodes.id, title: 'Alpha', properties: { [factor.id]: 3 } }), b = db.records.createRecord({ databaseId: nodes.id, title: 'Beta', properties: { [factor.id]: 5 } });
  const draft: WorkspaceWorkflowDraft = { name: 'Batch entries', inputSchema: { fields: [
    { key: 'label', label: 'Label', type: 'text', defaultValue: 'Batch' },
    { key: 'rows', label: 'Rows', type: 'collection', minItems: 1, maxItems: 100, fields: [
      { key: 'record', label: 'Record', type: 'record', databaseId: nodes.id, required: true },
      { key: 'quantity', label: 'Quantity', type: 'number', defaultValue: 1, required: true },
      { key: 'rate', label: 'Rate', type: 'number', required: true, prefill: { inputKey: 'record', databaseId: nodes.id, propertyId: factor.id } },
    ] },
  ] }, steps: [
    { id: 'iterate', type: 'FOR_EACH', config: { collection: variable('rows'), outputVariable: 'created', yield: variable('entry'), steps: [
      { id: 'compute', type: 'COMPUTE', config: { value: product, outputVariable: 'total' } },
      { id: 'check', type: 'VALIDATE', config: { condition: 'total > 0', errorMessage: 'Row total must be positive.' } },
      { id: 'entry', type: 'CREATE_RECORD', config: { databaseId: entries.id, title: variable('label'), properties: { [total.id]: variable('total'), [nodeLink.id]: item('record') }, outputVariable: 'entry' } },
    ] } },
    { id: 'sum', type: 'SUM', config: { collection: variable('rows'), value: product, outputVariable: 'grandTotal' } },
    { id: 'summary', type: 'CREATE_RECORD', config: { databaseId: summaries.id, title: variable('label'), properties: { [grand.id]: variable('grandTotal'), [entryLink.id]: variable('created') }, outputVariable: 'summary' } },
    { id: 'return', type: 'RETURN_RESULT', config: { total: '$grandTotal', summary: '$summary' } },
  ] };
  return { draft, nodes, entries, summaries, total, grand, factor, a, b, relation };
}
describe('Repeated generic actions', () => {
  it.each([1, 3])('executes %i rows with defaults, record inputs, row expressions, collected relations and sum', count => {
    const db = workspace(), f = fixture(db); const action = db.workflows.createWorkflow(f.draft);
    const result = db.workflows.execute({ workflowId: action.id, inputs: { rows: Array.from({ length: count }, (_, i) => ({ record: i % 2 ? f.b.id : f.a.id, quantity: i + 1 })) } });
    const expected = Array.from({ length: count }, (_, i) => (i + 1) * (i % 2 ? 5 : 3));
    expect(result.createdRecordIds).toHaveLength(count + 1); expect(result.result.total).toBe(expected.reduce((a, b) => a + b, 0));
    expect(result.createdRecordIds.slice(0, count).map(id => db.records.getRecord(id)?.properties[f.total.id])).toEqual(expected);
    expect(db.relations.getRelatedRecords(String(result.result.summary), f.relation.id)).toHaveLength(count);
  });
  it('sums yielded results and allows lookup and update in each row', () => {
    const db = workspace(), f = fixture(db);
    const action = db.workflows.createWorkflow({ ...f.draft, steps: [
      { id: 'loop', type: 'FOR_EACH', config: { collection: variable('rows'), outputVariable: 'totals', yield: variable('lineTotal'), steps: [
        { id: 'find', type: 'FIND_RECORD', config: { databaseId: f.nodes.id, outputVariable: 'found', required: true } },
        { id: 'compute', type: 'COMPUTE', config: { value: product, outputVariable: 'lineTotal' } },
        { id: 'update', type: 'UPDATE_RECORD', config: { databaseId: f.nodes.id, record: item('record'), properties: { [f.factor.id]: variable('lineTotal') } } },
      ] } },
      { id: 'sum', type: 'SUM', config: { collection: variable('totals'), value: item(), outputVariable: 'total' } },
      { id: 'return', type: 'RETURN_RESULT', config: { total: '$total' } },
    ] });
    const result = db.workflows.execute({ workflowId: action.id, inputs: { rows: [{ record: f.a.id, quantity: 2 }, { record: f.b.id, quantity: 3 }] } });
    expect(result.result.total).toBe(21);
    expect(db.records.getRecord(f.b.id)?.properties[f.factor.id]).toBe(15);
    expect(() => db.workflows.execute({ workflowId: action.id, inputs: { rows: [{ record: f.a.id, quantity: 'wrong' }] } })).toThrow('finite number');
  });
  it('rolls back earlier iterations when a later row fails', () => {
    const db = workspace(), f = fixture(db); const action = db.workflows.createWorkflow(f.draft);
    expect(() => db.workflows.execute({ workflowId: action.id, inputs: { rows: [{ record: f.a.id, quantity: 2 }, { record: f.b.id, quantity: 0 }] } })).toThrow('positive');
    expect(db.databaseQuery.query({ databaseId: f.entries.id }).records).toHaveLength(0);
    expect(db.databaseQuery.query({ databaseId: f.summaries.id }).records).toHaveLength(0);
  });
  it.each([null, {}, [null], [{}], [{ record: 'missing' }], [{ record: 'missing', quantity: '2' }], Array.from({ length: 101 }, () => ({}))])('rejects invalid row shapes and required values', rows => {
    const db = workspace(), f = fixture(db), action = db.workflows.createWorkflow(f.draft);
    expect(() => db.workflows.execute({ workflowId: action.id, inputs: { rows } })).toThrow();
    expect(db.databaseQuery.query({ databaseId: f.entries.id }).records).toHaveLength(0);
  });
  it('rejects escaped scope and deleted nested properties', () => {
    const db = workspace(), f = fixture(db);
    expect(() => db.workflows.createWorkflow({ ...f.draft, steps: [...f.draft.steps, { type: 'COMPUTE', config: { outputVariable: 'escape', value: variable('entry') } }] })).toThrow('unavailable');
    const action = db.workflows.createWorkflow(f.draft); db.properties.archiveProperty(f.total.id);
    expect(() => db.workflows.execute({ workflowId: action.id, inputs: { rows: [{ record: f.a.id }] } })).toThrow('deleted');
  });
  it('preserves child defaults, prefill and nested references through a blueprint roundtrip', () => {
    const db = workspace(), f = fixture(db); db.workflows.createWorkflow(f.draft);
    const blueprint = parseWorkspaceTemplateV2(db.workspaceTemplates.exportTemplate());
    const next = workspace(); next.workspaceTemplates.validateTemplate(blueprint); next.workspaceTemplates.importBlueprintV2(blueprint);
    const action = next.workflows.listWorkflows()[0]!; const fields = action.inputSchema.fields[1]!.fields!;
    const nodeId = next.databaseQuery.query({ databaseId: fields[0]!.databaseId! }).records.find(r => r.title === 'Alpha')!.id;
    const result = next.workflows.execute({ workflowId: action.id, inputs: { rows: [{ record: nodeId, quantity: 4 }] } });
    expect(result.result.total).toBe(12); expect(result.createdRecordIds).toHaveLength(2);
  });
  it('bounds executed work and rejects non-collections', () => {
    const db = workspace(), f = fixture(db);
    const action = db.workflows.createWorkflow({ ...f.draft, steps: [{ type: 'FOR_EACH', config: { collection: literal(Array.from({ length: 100 }, () => 1)), steps: Array.from({ length: 11 }, (_, i) => ({ id: 's' + i, type: 'CREATE_RECORD', config: { databaseId: f.entries.id, title: literal('Bounded') } })) } }] });
    expect(() => db.workflows.execute({ workflowId: action.id, inputs: { rows: [{ record: f.a.id }] } })).toThrow('1,000');
    expect(db.databaseQuery.query({ databaseId: f.entries.id }).records).toHaveLength(0);
    const invalid = db.workflows.createWorkflow({ name: 'Invalid collection', inputSchema: { fields: [] }, steps: [{ type: 'SUM', config: { collection: literal(2), value: item(), outputVariable: 'sum' } }] });
    expect(() => db.workflows.execute({ workflowId: invalid.id, inputs: {} })).toThrow('collection');
  });
});
