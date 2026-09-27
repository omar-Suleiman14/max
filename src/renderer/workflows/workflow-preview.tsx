import type { WorkflowExecutionResult, WorkspaceWorkflow } from '../../shared/workflow-contract';
import type { Locale } from '../app/i18n';
import { resultOutputs } from './result-outputs';

function display(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function WorkflowPreview({ action, locale, preview }: { action: WorkspaceWorkflow; locale: Locale; preview: WorkflowExecutionResult }) {
  const ar = locale === 'ar';
  const outputs = resultOutputs(action, preview.result, locale);
  return <section aria-label={ar ? 'معاينة التغييرات' : 'Change preview'} className="quick-action-form__preview">
    <strong>{ar ? 'سيحدث عند التشغيل' : 'Would happen when run'}</strong>
    {preview.previewEffects?.length ? <ul>{preview.previewEffects.map((effect) =>
      <li key={`${effect.kind}:${effect.recordId}`}>{effect.kind === 'created' ? (ar ? 'إنشاء' : 'Create') : (ar ? 'تحديث' : 'Update')}: {effect.title}</li>)}</ul>
      : <p>{ar ? 'لا توجد تغييرات على السجلات.' : 'No record changes.'}</p>}
    {!!preview.previewComputed?.length && <><strong>{ar ? 'قيم محسوبة' : 'Computed values'}</strong><dl>{preview.previewComputed.map(({ name, value }) => <div key={name}><dt>{name}</dt><dd>{display(value)}</dd></div>)}</dl></>}
    {!!outputs.length && <><strong>{ar ? 'النتائج' : 'Results'}</strong><dl>{outputs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></>}
  </section>;
}
