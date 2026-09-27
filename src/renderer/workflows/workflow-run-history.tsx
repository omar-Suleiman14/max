import { useEffect, useState } from 'react';
import type { WorkflowRunSummary, WorkspaceWorkflow } from '../../shared/workflow-contract';
import type { Locale } from '../app/i18n';
import { stepLabels, stepTypes } from './workflow-draft';

const arabicMessages: Readonly<Record<string, string>> = {
  'Lookup returned no record.': 'لم يعثر البحث على سجل.',
  'Workflow validation failed.': 'لم يتحقق شرط الإجراء.',
  'Iteration requires a collection of at most 100 items.': 'تتطلب الخطوة مجموعة لا تزيد على 100 عنصر.',
  'Sum requires finite numeric values.': 'يتطلب الجمع قيمًا رقمية محدودة.',
  'Sum is too large.': 'نتيجة الجمع كبيرة جدًا.',
  'A finite number is required.': 'مطلوب رقم محدود.',
  'Action exceeds 1,000 executed steps.': 'تجاوز الإجراء 1000 خطوة تنفيذ.',
  'Action failed. Check the configured values.': 'فشل الإجراء. راجع القيم المحددة.',
  'Action failed. No changes were saved.': 'فشل الإجراء. لم تُحفظ أي تغييرات.',
  'Action step failed. Review its configuration and inputs.': 'فشلت خطوة. راجع إعدادات الإجراء ومدخلاته.',
};

export function WorkflowRunHistory({ workflow, locale }: { workflow: WorkspaceWorkflow; locale: Locale }) {
  const ar = locale === 'ar';
  const [runs, setRuns] = useState<readonly WorkflowRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void window.maxApi.workspace.listWorkflowRuns(workflow.id).then((rows) => {
      if (active) { setRuns(rows); setLoading(false); }
    }).catch(() => { if (active) { setError(true); setLoading(false); } });
    return () => { active = false; };
  }, [workflow.id]);

  return <section className="workflow-run-history" aria-label={ar ? 'سجل تنفيذ الإجراء' : 'Action run history'}>
    <h3>{ar ? 'عمليات التنفيذ الأخيرة' : 'Recent runs'}</h3>
    {loading && <p>{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
    {error && <p role="alert">{ar ? 'تعذر تحميل سجل التنفيذ.' : 'Could not load run history.'}</p>}
    {!loading && !error && runs.length === 0 && <p>{ar ? 'لا توجد عمليات تنفيذ بعد.' : 'No runs yet.'}</p>}
    {!loading && !error && <ol>{runs.map((run) => {
      const step = run.stepNumber ? workflow.steps[run.stepNumber - 1] : undefined;
      const status = run.status === 'completed' ? (ar ? 'مكتمل' : 'Completed')
        : run.status === 'rolled_back' ? (ar ? 'معاينة أُلغيت تغييراتها' : 'Preview rolled back')
          : (ar ? 'فشل وأُلغيت التغييرات' : 'Failed; changes rolled back');
      return <li key={run.id}>
        <strong>{workflow.name} · {status}</strong>
        <time dateTime={run.startedAt}>{new Intl.DateTimeFormat(ar ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(run.startedAt))}</time>
        {run.stepNumber && <p>{ar ? 'الخطوة' : 'Step'} {run.stepNumber}{step ? ` · ${stepLabels(ar)[stepTypes.indexOf(step.type)]}` : ''}</p>}
        {run.message && <p>{ar ? arabicMessages[run.message] ?? 'فشلت خطوة في الإجراء.' : run.message}</p>}
        <p>{run.status === 'failed'
          ? (ar ? 'لم تُحفظ أي تغييرات. راجع الإجراء والمدخلات قبل إعادة المحاولة.' : 'No changes were saved. Review the action and inputs before retrying.')
          : run.status === 'rolled_back'
            ? (ar ? 'كانت هذه معاينة؛ لم تُحفظ أي تغييرات.' : 'This was a preview; no changes were saved.')
            : (ar ? 'حُفظت التغييرات. تحقق من النتائج قبل تشغيله مرة أخرى.' : 'Changes were saved. Check the result before running again.')}</p>
      </li>;
    })}</ol>}
  </section>;
}
