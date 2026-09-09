import type { DatabaseService } from './database-service';
import type { WorkflowValue, WorkspaceWorkflowDraft } from '../../shared/workflow-contract';
const literal = (value: unknown): WorkflowValue => ({ source: 'literal', value });
const variable = (key: string): WorkflowValue => ({ source: 'variable', key });
const expression = (expression: string, bindings: Record<string, WorkflowValue>): WorkflowValue => ({ source: 'expression', expression, bindings });
export function reactiveFixture(db: DatabaseService) {
  const a = db.databases.createDatabase({ title: 'Sources' }), b = db.databases.createDatabase({ title: 'Results' });
  const available = db.properties.createProperty({ databaseId: a.id, name: 'Available', type: 'number' });
  const rate = db.properties.createProperty({ databaseId: a.id, name: 'Rate', type: 'number', required: true });
  const enabled = db.properties.createProperty({ databaseId: a.id, name: 'Enabled', type: 'checkbox' });
  const total = db.properties.createProperty({ databaseId: b.id, name: 'Total', type: 'number' });
  const alpha = db.records.createRecord({ databaseId: a.id, title: 'Alpha', properties: { [available.id]: 20, [rate.id]: 2, [enabled.id]: true } });
  const beta = db.records.createRecord({ databaseId: a.id, title: 'Beta', properties: { [available.id]: 100, [rate.id]: 3, [enabled.id]: true } });
  const hidden = db.records.createRecord({ databaseId: a.id, title: 'Hidden', properties: { [available.id]: 100, [rate.id]: 4, [enabled.id]: false } });
  const property = (propertyId: string): WorkflowValue => ({ source: 'property', record: variable('record'), databaseId: a.id, propertyId });
  const draft: WorkspaceWorkflowDraft = { name: 'Evaluate inputs', inputSchema: { fields: [
    { key: 'record', label: 'Source', type: 'record', databaseId: a.id, required: true, allowCreate: true, displayPropertyIds: [available.id], pickerFilter: { kind: 'property', propertyId: enabled.id, operator: 'equals', value: literal(true) } },
    { key: 'amount', label: 'Amount', type: 'number', defaultValue: 5, required: true },
    { key: 'calculated', label: 'Calculated', type: 'number', derived: { value: expression('a * r', { a: variable('amount'), r: property(rate.id) }), allowOverride: true } },
    { key: 'other', label: 'Another source', type: 'record', databaseId: a.id, visibleWhen: expression('a > 10', { a: variable('amount') }), requiredWhen: expression('a > 10', { a: variable('amount') }) },
    { key: 'note', label: 'Note', type: 'text', disabledWhen: expression('a > 10', { a: variable('amount') }) },
  ], rules: [
    { id: 'info', severity: 'INFO', message: 'Check the preview.', condition: literal(true) },
    { id: 'warning', severity: 'WARNING', message: 'Amount exceeds available.', condition: expression('a > b', { a: variable('amount'), b: property(available.id) }) },
    { id: 'block', severity: 'BLOCK', message: 'Amount cannot be negative.', condition: expression('a < 0', { a: variable('amount') }) },
  ], summary: [
    { label: 'Amount', value: variable('amount') }, { label: 'Calculated', value: variable('calculated') },
    { label: 'Available', value: property(available.id) },
    { label: 'Resulting available', value: expression('b - a', { b: property(available.id), a: variable('amount') }) },
  ] }, steps: [{ type: 'CREATE_RECORD', config: { databaseId: b.id, title: literal('Result'), properties: { [total.id]: variable('calculated') } } }] };
  const workflow = db.workflows.createWorkflow(draft);
  return { a, b, available, rate, enabled, total, alpha, beta, hidden, workflow, draft };
}
