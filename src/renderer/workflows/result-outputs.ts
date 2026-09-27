import type { WorkspaceWorkflow } from '../../shared/workflow-contract';
import type { Locale } from '../app/i18n';

/**
 * The named results a "Show a result" step returned, in the order the author
 * listed them, as text to show under the form. An action without that step
 * shows nothing: its result is internal.
 */
export function resultOutputs(action: Pick<WorkspaceWorkflow, 'steps'>, result: Readonly<Record<string, unknown>> | undefined, locale: Locale): (readonly [string, string])[] {
  const step = [...action.steps].reverse().find((candidate) => candidate.type === 'RETURN_RESULT' && Array.isArray(candidate.config.outputs));
  if (!step || !result || typeof result !== 'object') return [];
  const labels = (step.config.outputs as { label?: unknown }[]).map((output) => output.label).filter((label): label is string => typeof label === 'string' && label.trim() !== '');
  return labels.map((label) => [label, display(result[label], locale)] as const);
}

function display(value: unknown, locale: Locale): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return value.toLocaleString(locale === 'ar' ? 'ar' : 'en');
  if (typeof value === 'boolean') return value ? (locale === 'ar' ? 'نعم' : 'Yes') : (locale === 'ar' ? 'لا' : 'No');
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => display(item, locale)).join(locale === 'ar' ? '، ' : ', ');
  return JSON.stringify(value);
}
