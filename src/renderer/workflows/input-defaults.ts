import type { WorkflowInputField } from '../../shared/workflow-contract';
export const inputKey = (field: WorkflowInputField, index: number) => field.key ?? field.id ?? 'input_' + (index + 1);
export function inputDefaults(fields: readonly WorkflowInputField[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((f, i) => [inputKey(f, i), f.defaultValue ?? (f.type === 'collection' ? Array.from({ length: Math.max(f.minItems ?? 0, f.required ? 1 : 0) }, () => inputDefaults(f.fields ?? [])) : f.type === 'boolean' ? false : '')]));
}
