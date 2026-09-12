import type { WorkflowFormEvaluation, WorkflowInputField } from '../../shared/workflow-contract';
import { inputKey } from './input-defaults';

export type MissingInput = Readonly<{ address: string; label: string }>;

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

/**
 * The required answers an action is still waiting for.
 *
 * Running used to be refused in silence when a required field was blank: the
 * button did nothing and nothing said why. Naming the fields lets the form
 * point at them instead.
 */
export function missingRequiredInputs(
  fields: readonly WorkflowInputField[],
  values: Record<string, unknown>,
  evaluation?: WorkflowFormEvaluation,
  path: readonly (string | number)[] = [],
): MissingInput[] {
  return fields.flatMap((field, index) => {
    const key = inputKey(field, index);
    const address = JSON.stringify([...path, key]);
    const state = evaluation?.fields[address];
    if (state?.visible === false || state?.disabled) return [];
    const required = state?.required ?? field.required;
    const value = values[key];
    if (field.type === 'collection') {
      const rows = Array.isArray(value) ? value as Record<string, unknown>[] : [];
      const minimum = Math.max(field.minItems ?? 0, required ? 1 : 0);
      if (rows.length < minimum) return [{ address, label: field.label }];
      return rows.flatMap((row, rowIndex) => missingRequiredInputs(field.fields ?? [], row, evaluation, [...path, key, rowIndex]));
    }
    return required && isEmpty(value) ? [{ address, label: field.label }] : [];
  });
}

/** "Customer and Quantity" — the missing fields, named the way the locale joins lists. */
export function listMissing(missing: readonly MissingInput[], locale: 'ar' | 'en'): string {
  const labels = [...new Set(missing.map((entry) => entry.label))];
  if (labels.length < 2) return labels.join('');
  return `${labels.slice(0, -1).join(locale === 'ar' ? '، ' : ', ')}${locale === 'ar' ? ' و' : ' and '}${labels.at(-1)}`;
}
