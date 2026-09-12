import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkflowFormEvaluation, WorkspaceWorkflow } from '../../shared/workflow-contract';
import type { Locale } from '../app/i18n';
import { lastUsedInputs, rememberInputs } from './last-used-inputs';
import { WorkflowInputForm } from './workflow-input-form';
import { scalarText } from '../../shared/scalar-text';

export function ReactiveActionForm({ workflow, locale, onCompleted, onBusy }: { workflow: WorkspaceWorkflow; locale: Locale; onCompleted: () => void; onBusy: (busy: boolean) => void }) {
  const ar = locale === 'ar'; const [values, setValues] = useState(() => lastUsedInputs(workflow.id, workflow.inputSchema.fields));
  const [overrides, setOverrides] = useState<string[]>([]), [evaluation, setEvaluation] = useState<WorkflowFormEvaluation>();
  const [error, setError] = useState(''), [snapshot, setSnapshot] = useState('');
  const [revision, setRevision] = useState(0), [confirming, setConfirming] = useState(false), [running, setRunning] = useState(false);
  const previewToken = useRef<string | undefined>(undefined);
  const lock = useRef(false); const requestKey = JSON.stringify([values, overrides, revision]);
  const pending = snapshot !== requestKey;
  // What the form holds right now, readable from a response that was sent
  // earlier. An evaluation answers the inputs it was given, so when those
  // inputs have moved on since - picking a record that was just created, say -
  // its echo has to be dropped instead of writing the older values back.
  const currentValues = useRef(values);
  const applyValues = useCallback((next: typeof values) => { currentValues.current = next; setValues(next); }, []);
  useEffect(() => { const refresh = () => { setConfirming(false); setRevision(v => v + 1); }; window.addEventListener('max:workspace-changed', refresh); return () => window.removeEventListener('max:workspace-changed', refresh); }, []);
  useEffect(() => {
    let active = true;
    const sent = JSON.stringify(values);
    const timer = setTimeout(() => { void window.maxApi.workspace.evaluateWorkflow({ workflowId: workflow.id, inputs: values, overrides, evaluationToken: previewToken.current }).then(result => {
      if (!active || JSON.stringify(currentValues.current) !== sent) return;
      if (!result.ok) { setError(result.error.message); setEvaluation(undefined); return; }
      previewToken.current = result.value.token;
      setError(''); setEvaluation(result.value); setSnapshot(JSON.stringify([result.value.values, overrides, revision]));
      if (sent !== JSON.stringify(result.value.values)) applyValues({ ...result.value.values });
    }).catch(() => { if (active) setError(ar ? 'تعذر تحديث المعاينة.' : 'Could not update preview.'); }); }, 120);
    return () => { active = false; clearTimeout(timer); };
  }, [applyValues, workflow.id, values, overrides, revision, ar]);
  const warnings = evaluation?.messages.filter(m => m.severity === 'WARNING') ?? [];
  const blocked = evaluation?.messages.some(m => m.severity === 'BLOCK');
  const submit = async (confirmed = false) => {
    if (!evaluation || pending || blocked || lock.current) return;
    if (warnings.length && !confirmed) { setConfirming(true); return; }
    lock.current = true; setRunning(true); onBusy(true); setError('');
    try {
      const result = await window.maxApi.workspace.executeWorkflow({ workflowId: workflow.id, inputs: values, overrides, evaluationToken: evaluation.token, confirmedWarnings: confirmed ? warnings.map(w => w.id) : [] });
      if (!result.ok) { setError(result.error.message); setConfirming(false); setRevision(v => v + 1); }
      else { rememberInputs(workflow.id, values); onCompleted(); window.dispatchEvent(new Event('max:workspace-changed')); }
    } catch { setError(ar ? 'تعذر تنفيذ الإجراء.' : 'Could not execute action.'); }
    finally { lock.current = false; setRunning(false); onBusy(false); }
  };
  return <form onSubmit={e => { e.preventDefault(); void submit(); }} aria-busy={pending || running}>
    <WorkflowInputForm fields={workflow.inputSchema.fields} values={values} onChange={next => { setConfirming(false); applyValues(next); }} disabled={running || confirming} locale={locale} evaluation={evaluation} onEdit={(path, reset, removedRow) => {
      setConfirming(false);
      setOverrides(old => {
        if (removedRow === undefined) return reset ? old.filter(p => p !== path) : [...new Set([...old, path])];
        const prefix = JSON.parse(path) as (string | number)[];
        return old.flatMap(p => { const parts = JSON.parse(p) as (string | number)[];
          if (!prefix.every((v, i) => parts[i] === v) || typeof parts[prefix.length] !== 'number') return [p];
          const index = parts[prefix.length] as number; if (index === removedRow) return [];
          if (index > removedRow) parts[prefix.length] = index - 1; return [JSON.stringify(parts)];
        });
      });
    }}/>
    {!!evaluation?.summary.length && <dl className="action-live-summary" aria-label={ar ? 'المعاينة' : 'Preview'}>{evaluation.summary.map((s, i) => <div key={i}><dt>{s.label}</dt><dd>{typeof s.value === 'number' ? new Intl.NumberFormat(ar ? 'ar' : 'en', { maximumFractionDigits: 6 }).format(s.value) : scalarText(s.value ?? '—')}</dd></div>)}</dl>}
    <div aria-live="polite">{evaluation?.messages.map(m => <p className={'action-message action-message-' + m.severity.toLowerCase()} key={m.id}>{m.message}</p>)}</div>
    {error && <p role="alert">{error}</p>}
    {confirming ? <div className="action-warning-confirm" role="group" aria-label={ar ? 'تأكيد التحذيرات' : 'Confirm warnings'}><strong>{warnings.length} {ar ? 'تحذيرات · هل تريد المتابعة؟' : 'warnings · Continue anyway?'}</strong>{warnings.map(w => <p key={w.id}>{w.message}</p>)}<div className="action-row"><button type="button" disabled={running} onClick={() => setConfirming(false)}>{ar ? 'إلغاء' : 'Cancel'}</button><button type="button" disabled={running || pending || blocked} onClick={() => { void submit(true); }}>{ar ? 'متابعة' : 'Continue'}</button></div></div> : <button className="btn btn-primary" type="submit" disabled={!evaluation || pending || running || blocked}>{running ? (ar ? 'جار التنفيذ…' : 'Running…') : (ar ? 'تشغيل' : 'Run')}</button>}
  </form>;
}
