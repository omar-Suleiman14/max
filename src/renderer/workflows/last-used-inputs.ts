import { inputDefaults, inputKey } from './input-defaults';
import type { WorkflowInputField } from '../../shared/workflow-contract';

const valuesKey = (workflowId: string) => `max:quick-action:last-used:${workflowId}`;
const selectionKey = 'max:quick-action:last-selected';

/** Values worth carrying over: anything the person actually typed or picked. */
function isReusable(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/**
 * Merge the previous run's answers over the schema defaults. Only keys the
 * schema still declares survive, so editing an action cannot resurrect inputs
 * it no longer has. Collections keep their shape from the defaults and take
 * remembered rows only when the row still matches the declared sub-fields.
 */
function merge(fields: readonly WorkflowInputField[], remembered: unknown): Record<string, unknown> {
  const defaults = inputDefaults(fields);
  if (!remembered || typeof remembered !== 'object') return defaults;
  const saved = remembered as Record<string, unknown>;

  for (const [index, field] of fields.entries()) {
    const key = inputKey(field, index);
    const value = saved[key];
    if (field.type === 'collection') {
      if (!Array.isArray(value)) continue;
      const rows = value.map((row) => merge(field.fields ?? [], row));
      const minimum = Math.max(field.minItems ?? 0, field.required ? 1 : 0);
      if (rows.length >= minimum) defaults[key] = rows.slice(0, field.maxItems ?? 100);
      continue;
    }
    if (isReusable(value)) defaults[key] = value;
  }
  return defaults;
}

/** Schema defaults, with the previous run's answers layered on top. */
export function lastUsedInputs(workflowId: string, fields: readonly WorkflowInputField[]): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(valuesKey(workflowId));
    return merge(fields, raw ? JSON.parse(raw) : undefined);
  } catch {
    return inputDefaults(fields);
  }
}

/** Remember a successful run so the next one starts from it. */
export function rememberInputs(workflowId: string, values: Record<string, unknown>): void {
  try {
    window.localStorage.setItem(valuesKey(workflowId), JSON.stringify(values));
  } catch {
    // Remembering inputs is a convenience; storage limits must not break a run.
  }
}

export function readLastSelectedAction(): string {
  try {
    return window.localStorage.getItem(selectionKey) ?? '';
  } catch {
    return '';
  }
}

export function rememberSelectedAction(workflowId: string): void {
  try {
    window.localStorage.setItem(selectionKey, workflowId);
  } catch {
    // See rememberInputs.
  }
}
