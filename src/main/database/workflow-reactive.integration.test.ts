import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseService } from './database-service';
import { reactiveFixture } from './workflow-reactive.fixture';
import { parseWorkspaceTemplateV2, parseWorkspaceWorkflowDraft } from '../ipc/workspace-input-parsers';
import type { WorkflowValue } from '../../shared/workflow-contract';
const open: DatabaseService[] = [];
function database() { const db = new DatabaseService(':memory:'); db.initialize(); open.push(db); return db; }
afterEach(() => open.splice(0).forEach(db => db.close()));
describe('Reactive workflow forms', () => {
  it('calculates live, preserves and resets overrides, conditions, picker details and preview without writes', () => {
    const db = database(), f = reactiveFixture(db);
    const evaluate = (inputs: Record<string, unknown>, overrides?: string[]) => db.workflows.evaluateForm({ workflowId: f.workflow.id, inputs, overrides });
    const initial = evaluate({ record: f.alpha.id });
    expect(initial.values.calculated).toBe(10); expect(initial.summary.at(-1)?.value).toBe(15);
    expect(initial.fields['["record"]']?.options?.map(o => [o.title, o.secondary])).toEqual([['Alpha', '20'], ['Beta', '100']]);
    expect(initial.fields['["other"]']?.visible).toBe(false);
    const next = evaluate({ record: f.beta.id, amount: 8 }); expect(next.values.calculated).toBe(24);
    const overridden = evaluate({ record: f.beta.id, amount: 9, calculated: 7 }, ['["calculated"]']); expect(overridden.values.calculated).toBe(7);
    expect(evaluate({ ...overridden.values }, []).values.calculated).toBe(27);
    const conditional = evaluate({ record: f.alpha.id, amount: 11 }); expect(conditional.fields['["other"]']?.required).toBe(true); expect(conditional.fields['["other"]']?.error).toContain('required'); expect(conditional.fields['["note"]']?.disabled).toBe(true);
    expect(db.databaseQuery.query({ databaseId: f.b.id }).records).toHaveLength(0);
  });
  it('requires warning confirmation, enforces blocks and uses the exact confirmed override', () => {
    const db = database(), f = reactiveFixture(db);
    const request = { workflowId: f.workflow.id, inputs: { record: f.alpha.id, amount: 30, other: f.beta.id, calculated: 7 }, overrides: ['["calculated"]'] };
    const preview = db.workflows.evaluateForm(request); expect(preview.messages.some(m => m.severity === 'WARNING')).toBe(true);
    expect(() => db.workflows.execute(request)).toThrow('preview');
    expect(() => db.workflows.execute({ ...request, evaluationToken: preview.token })).toThrow('warnings');
    const result = db.workflows.execute({ ...request, evaluationToken: preview.token, confirmedWarnings: ['warning'] });
    expect(db.records.getRecord(result.createdRecordIds[0]!)?.properties[f.total.id]).toBe(7);
    const blocked = { ...request, inputs: { record: f.alpha.id, amount: -1 } }; const state = db.workflows.evaluateForm(blocked);
    expect(() => db.workflows.execute({ ...blocked, evaluationToken: state.token, confirmedWarnings: ['block', 'warning'] })).toThrow('negative');
  });
  it('rejects stale previews and invalid picker selection; validates definitions and cycles', () => {
    const db = database(), f = reactiveFixture(db), request = { workflowId: f.workflow.id, inputs: { record: f.alpha.id, amount: 5 } };
    const preview = db.workflows.evaluateForm(request); db.records.updateProperty(f.alpha.id, f.rate.id, 8);
    expect(() => db.workflows.execute({ ...request, evaluationToken: preview.token })).toThrow('updated');
    const invalid = db.workflows.evaluateForm({ ...request, inputs: { record: f.hidden.id } }); expect(invalid.messages.some(m => m.message.includes('picker'))).toBe(true);
    expect(() => parseWorkspaceWorkflowDraft({ ...f.draft, inputSchema: { fields: [{ key: 'x', label: 'X', type: 'number', derived: { value: { source: 'bogus' } } }] } })).toThrow();
    expect(() => db.workflows.createWorkflow({ ...f.draft, inputSchema: { fields: [{ key: 'x', label: 'X', type: 'number', derived: { value: { source: 'variable', key: 'x' } } }] } })).toThrow('cycle');
  });
  it('evaluates repeated row calculations, conditions, overrides and row guards', () => {
    const db = database(); const item = (field: string): WorkflowValue => ({ source: 'item', field });
    const workflow = db.workflows.createWorkflow({ name: 'Rows', inputSchema: { fields: [{ key: 'rows', label: 'Rows', type: 'collection', fields: [{ key: 'n', label: 'N', type: 'number' }, { key: 'twice', label: 'Twice', type: 'number', derived: { value: { source: 'expression', expression: 'n * 2', bindings: { n: item('n') } }, allowOverride: true } }, { key: 'note', label: 'Note', type: 'text', requiredWhen: { source: 'expression', expression: 'n > 3', bindings: { n: item('n') } } }] }], rules: [{ id: 'large', severity: 'WARNING', message: 'Large row', collection: { source: 'variable', key: 'rows' }, condition: { source: 'expression', expression: 'n > 3', bindings: { n: item('n') } } }] }, steps: [] });
    const result = db.workflows.evaluateForm({ workflowId: workflow.id, inputs: { rows: [{ n: 2 }, { n: 4, twice: 3, note: 'Yes' }] }, overrides: ['["rows",1,"twice"]'] });
    expect(result.values.rows).toEqual([{ n: 2, twice: 4, note: null }, { n: 4, twice: 3, note: 'Yes' }]); expect(result.messages.filter(m => m.severity === 'WARNING')).toHaveLength(1);
  });
  it('applies input-dependent picker filters and keeps clock expressions stable for confirmation', () => {
    const db = database(), f = reactiveFixture(db);
    const workflow = db.workflows.createWorkflow({ ...f.draft, inputSchema: { ...f.draft.inputSchema,
      fields: f.draft.inputSchema.fields.map(field => field.key === 'record' ? { ...field, pickerFilter: { kind: 'property' as const, propertyId: f.rate.id, operator: 'equals' as const, value: { source: 'variable' as const, key: 'amount' } } } : field),
      summary: [{ label: 'Time', value: { source: 'expression', expression: 'now()', bindings: {} } }],
    } });
    const request = { workflowId: workflow.id, inputs: { amount: 2, record: f.alpha.id } };
    const first = db.workflows.evaluateForm(request);
    expect(first.fields['["record"]']?.options?.map(o => o.title)).toEqual(['Alpha']);
    const second = db.workflows.evaluateForm({ ...request, evaluationToken: first.token });
    expect(second.token).toBe(first.token); expect(second.summary).toEqual(first.summary);
    expect(db.workflows.execute({ ...request, evaluationToken: first.token }).status).toBe('completed');
  });
  it('roundtrips all new configuration through blueprint v2', () => {
    const db = database(); reactiveFixture(db); const blueprint = parseWorkspaceTemplateV2(db.workspaceTemplates.exportTemplate());
    const target = database(); target.workspaceTemplates.importBlueprintV2(blueprint);
    const workflow = target.workflows.listWorkflows()[0]!; const source = workflow.inputSchema.fields[0]!;
    expect(source.allowCreate).toBe(true); expect(workflow.inputSchema.rules).toHaveLength(3); expect(workflow.inputSchema.summary).toHaveLength(4);
    const record = target.databaseQuery.query({ databaseId: source.databaseId! }).records.find(r => r.title === 'Alpha')!;
    const preview = target.workflows.evaluateForm({ workflowId: workflow.id, inputs: { record: record.id, amount: 4 } });
    expect(preview.values.calculated).toBe(8); expect(preview.fields['["record"]']?.options?.[0]?.secondary).toBe('20');
    expect(target.workflows.execute({ workflowId: workflow.id, inputs: { record: record.id, amount: 4 }, evaluationToken: preview.token }).status).toBe('completed');
  });
});
