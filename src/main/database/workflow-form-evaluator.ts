import type { WorkflowExecutionInput, WorkflowFormEvaluation, WorkflowFieldState, WorkflowInputField, WorkflowInputSchema, WorkflowValue } from '../../shared/workflow-contract';
import { WorkspaceDomainError } from '../../shared/workspace-contract';
import { FormulaParser } from './formula/parser';
import { extractFormulaDependencies } from './formula/dependency-extractor';

export const fieldPath = (path: readonly (string | number)[]) => JSON.stringify(path);
const keyOf = (f: WorkflowInputField, i: number) => f.key ?? f.id ?? `input_${i + 1}`;
export function valueDependencies(value: WorkflowValue): { variables: string[]; items: string[] } {
  const variables: string[] = [], items: string[] = [];
  const walk = (v: WorkflowValue) => {
    if (v.source === 'variable') variables.push(v.key);
    if (v.source === 'item' && v.field) items.push(v.field);
    if (v.source === 'property') walk(v.record);
    if (v.source === 'expression') {
      Object.values(v.bindings).forEach(walk);
      variables.push(...extractFormulaDependencies(new FormulaParser().parse(v.expression)).filter(k => !Object.hasOwn(v.bindings, k)));
    }
  }; walk(value); return { variables, items };
}
export function assertDerivedOrder(fields: readonly WorkflowInputField[], child = false): void {
  const visiting = new Set<string>(), done = new Set<string>();
  const walk = (key: string) => {
    if (visiting.has(key)) throw new WorkspaceDomainError('invalid-input', 'Calculated fields contain a dependency cycle.');
    if (done.has(key)) return;
    visiting.add(key); const f = fields.find((f, i) => keyOf(f, i) === key);
    if (f?.derived) (child ? valueDependencies(f.derived.value).items : valueDependencies(f.derived.value).variables).forEach(walk);
    visiting.delete(key); done.add(key);
  }; fields.forEach((f, i) => { walk(keyOf(f, i)); if (f.fields) assertDerivedOrder(f.fields, true); });
}
type Services = {
  resolve: (value: WorkflowValue, scope: Record<string, unknown>) => unknown;
  check: (field: WorkflowInputField, value: unknown) => void;
  options: (field: WorkflowInputField, scope: Record<string, unknown>) => NonNullable<WorkflowFieldState['options']>;
};
export function evaluateWorkflowForm(schema: WorkflowInputSchema, input: WorkflowExecutionInput, services: Services): Omit<WorkflowFormEvaluation, 'token'> {
  const states: Record<string, WorkflowFieldState> = {}, values: Record<string, unknown> = {};
  const messages: { id: string; severity: 'INFO' | 'WARNING' | 'BLOCK'; message: string }[] = [];
  const overrideSet = new Set(input.overrides ?? []);
  const fail = (id: string, message: string) => messages.push({ id, severity: 'BLOCK', message });
  const evaluateFields = (fields: readonly WorkflowInputField[], raw: Record<string, unknown>, target: Record<string, unknown>, path: (string | number)[], rowIndex?: number, parentVisible = true) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { fail(fieldPath(path), 'A repeated row must be an object.'); return; }
    const keys = fields.map(keyOf);
    if (path.length && Object.keys(raw).some(k => !keys.includes(k))) fail(fieldPath(path), 'Unknown repeated row field.');
    fields.forEach((f, i) => { target[keys[i]!] = raw[keys[i]!] ?? f.defaultValue ?? (f.type === 'collection' ? [] : null); });
    const scope = () => ({ ...values, ...(path.length ? { __item: target, __index: rowIndex } : {}) });
    const done = new Set<string>();
    const calculate = (f: WorkflowInputField, i: number) => {
      const key = keys[i]!; if (done.has(key)) return; done.add(key);
      const address = fieldPath([...path, key]); let calculated: unknown;
      if (f.derived) {
        const deps = valueDependencies(f.derived.value);
        (path.length ? deps.items : deps.variables).forEach(dep => { const index = keys.indexOf(dep); if (index >= 0) calculate(fields[index]!, index); });
        try { calculated = services.resolve(f.derived.value, scope()); if (!(f.derived.allowOverride && overrideSet.has(address))) target[key] = calculated; }
        catch (e) { fail(address, `${f.label}: ${e instanceof Error ? e.message : 'Calculation failed.'}`); }
      } else if (f.prefill && (target[key] === null || target[key] === '')) {
        const record = target[f.prefill.inputKey];
        if (record) try { target[key] = services.resolve({ source: 'property', record: { source: 'literal', value: record }, databaseId: f.prefill.databaseId, propertyId: f.prefill.propertyId }, scope()); } catch (e) { fail(address, String(e)); }
      }
      states[address] = { visible: true, required: !!f.required, disabled: false, overridden: !!f.derived?.allowOverride && overrideSet.has(address), ...(calculated !== undefined ? { calculated } : {}) };
    };
    fields.forEach(calculate);
    fields.forEach((f, i) => {
      const key = keys[i]!, address = fieldPath([...path, key]);
      let state = states[address]!;
      try {
        const condition = (value: WorkflowValue | undefined, fallback: boolean) => { if (!value) return fallback; const result = services.resolve(value, scope()); if (typeof result !== 'boolean') throw new Error('Conditions must return true or false.'); return result; };
        state = { ...state, visible: parentVisible && condition(f.visibleWhen, true), required: !!f.required || condition(f.requiredWhen, false), disabled: condition(f.disabledWhen, false) || (!!f.derived && !f.derived.allowOverride) };
        states[address] = state;
        const value = target[key];
        if (f.type === 'collection') {
          if (!Array.isArray(value) || value.length > (f.maxItems ?? 100) || (state.visible && value.length < Math.max(f.minItems ?? 0, state.required ? 1 : 0))) throw new Error('Invalid number of rows (maximum 100).');
          const rows = value.map((row, j) => { const resolved = {}; evaluateFields(f.fields ?? [], row as Record<string, unknown>, resolved, [...path, key, j], j, state.visible); return resolved; }); target[key] = rows;
        } else if (state.visible) {
          if (f.type === 'record') {
            const options = services.options(f, scope()); states[address] = { ...state, options };
            if (value && !options.some(o => o.id === value)) throw new Error('Selected record no longer matches this picker.');
          }
          services.check({ ...f, required: state.required }, value);
        }
      } catch (e) { const message = `${f.label}: ${e instanceof Error ? e.message : 'Invalid value.'}`; states[address] = { ...(states[address] ?? state), error: message }; fail(address, message); }
    });
  };
  evaluateFields(schema.fields, input.inputs, values, []);
  for (const rule of schema.rules ?? []) {
    try {
      const items = rule.collection ? services.resolve(rule.collection, values) : [null];
      if (!Array.isArray(items) || items.length > 100) throw new Error('Rule collection must contain at most 100 items.');
      items.forEach((item, i) => { const active = services.resolve(rule.condition, rule.collection ? { ...values, __item: item, __index: i } : values); if (typeof active !== 'boolean') throw new Error('Rule conditions must return true or false.'); if (active) messages.push({ id: rule.collection ? fieldPath([rule.id, i]) : rule.id, severity: rule.severity, message: rule.collection ? `${i + 1} · ${rule.message}` : rule.message }); });
    } catch (e) { fail(rule.id, `${rule.message}: ${e instanceof Error ? e.message : 'Rule evaluation failed.'}`); }
  }
  const summary = (schema.summary ?? []).map(s => { try { return { label: s.label, value: services.resolve(s.value, values) }; } catch (e) { fail('summary:' + s.label, `${s.label}: ${e instanceof Error ? e.message : 'Preview failed.'}`); return { label: s.label, value: null }; } });
  return { values, fields: states, messages, summary };
}
