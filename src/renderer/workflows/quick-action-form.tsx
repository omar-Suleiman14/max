import { useCallback, useEffect, useRef, useState } from 'react';

import type { WorkspaceWorkflow } from '../../shared/workflow-contract';
import type { Locale } from '../app/i18n';
import { lastUsedInputs, rememberInputs } from './last-used-inputs';
import { ReactiveActionForm } from './reactive-action-form';
import { hasReactiveFields } from './reactive-config';
import { listMissing, missingRequiredInputs } from './required-inputs';
import { WorkflowInputForm } from './workflow-input-form';
import './quick-actions.css';

export type QuickActionFormProps = Readonly<{
  action: WorkspaceWorkflow;
  locale: Locale;
  /** Raised while the action is mid-flight so the host can hold itself open. */
  onBusyChange?: (busy: boolean) => void;
  /** The action was switched back on and should be reloaded by the host. */
  onEnabled?: () => void;
  onOpenSettings: () => void;
}>;

/**
 * One quick action, ready to run.
 *
 * This is the whole surface for running an action: the search popup shows it in
 * place of the result list, so choosing an action by name never means being
 * handed off to a second window with a row of tabs to re-orient in.
 *
 * A finished run clears back to an empty form with a short confirmation rather
 * than replacing the form with a results card. Serving the next customer is the
 * common case, and a card in the way of it is one click of ceremony each time.
 */
export function QuickActionForm({ action, locale, onBusyChange, onEnabled, onOpenSettings }: QuickActionFormProps) {
  const ar = locale === 'ar';
  const [values, setValues] = useState<Record<string, unknown>>(() => lastUsedInputs(action.id, action.inputSchema.fields));
  const [error, setError] = useState('');
  const [missing, setMissing] = useState<readonly string[]>([]);
  const [done, setDone] = useState(false);
  const [running, setRunning] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [formInstance, setFormInstance] = useState(0);
  const lock = useRef(false);
  const blocked = !action.enabled;

  const setBusy = useCallback((busy: boolean) => {
    lock.current = busy;
    setRunning(busy);
    onBusyChange?.(busy);
  }, [onBusyChange]);

  useEffect(() => {
    setError('');
    setMissing([]);
    setValues(lastUsedInputs(action.id, action.inputSchema.fields));
  }, [action, formInstance]);

  // The confirmation is a passing note, not a screen to dismiss.
  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setDone(false), 3600);
    return () => window.clearTimeout(timer);
  }, [done]);

  const completed = useCallback(() => {
    setError('');
    setMissing([]);
    setDone(true);
    setFormInstance((current) => current + 1);
  }, []);

  const execute = async () => {
    if (blocked || lock.current) return;
    const gaps = missingRequiredInputs(action.inputSchema.fields, values);
    if (gaps.length) {
      setMissing(gaps.map((gap) => gap.address));
      setError(`${ar ? 'أكمل أولاً: ' : 'Fill in first: '}${listMissing(gaps, ar ? 'ar' : 'en')}`);
      return;
    }
    setMissing([]);
    setBusy(true);
    setError('');
    setDone(false);
    try {
      const result = await window.maxApi.workspace.executeWorkflow({ workflowId: action.id, inputs: values });
      if (!result.ok) setError(result.error.message);
      else {
        rememberInputs(action.id, values);
        window.dispatchEvent(new Event('max:workspace-changed'));
        completed();
      }
    } catch {
      setError(ar ? 'تعذر تنفيذ الإجراء.' : 'Could not run this action.');
    } finally {
      setBusy(false);
    }
  };

  const turnOn = async () => {
    if (enabling) return;
    setEnabling(true);
    setError('');
    try {
      const result = await window.maxApi.workspace.updateWorkflow(action.id, { enabled: true });
      if (!result.ok) setError(result.error.message);
      else {
        onEnabled?.();
        window.dispatchEvent(new Event('max:workspace-changed'));
      }
    } catch {
      setError(ar ? 'تعذر تفعيل الإجراء.' : 'Could not turn this action on.');
    } finally {
      setEnabling(false);
    }
  };

  if (blocked) {
    return (
      <div className="quick-action-form">
        <p className="quick-action-form__off">{ar ? 'هذا الإجراء موقوف في الإعدادات.' : 'This action is switched off in settings.'}</p>
        <div className="quick-action-form__actions">
          <button className="btn btn-primary" disabled={enabling} onClick={() => void turnOn()} type="button">
            {enabling ? (ar ? 'جارٍ التفعيل…' : 'Turning on…') : (ar ? 'تفعيل الإجراء' : 'Turn it on')}
          </button>
          <button className="btn btn-ghost" onClick={onOpenSettings} type="button">{ar ? 'الإعدادات' : 'Settings'}</button>
        </div>
        {error && <p className="quick-action-form__error" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="quick-action-form">
      {hasReactiveFields(action.inputSchema) ? (
        <ReactiveActionForm
          key={`${action.id}:${formInstance}`}
          workflow={action}
          locale={locale}
          onCompleted={completed}
          onBusy={setBusy}
        />
      ) : (
        <form key={`${action.id}:${formInstance}`} noValidate onSubmit={(event) => { event.preventDefault(); void execute(); }}>
          <WorkflowInputForm fields={action.inputSchema.fields} values={values} onChange={(next) => { setValues(next); setMissing([]); setError(''); }} disabled={running} locale={locale} missing={missing} />
          {error && <p className="quick-action-form__error" role="alert">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={running}>
            {running ? (ar ? 'جار التنفيذ…' : 'Running…') : (ar ? 'تشغيل' : 'Run')}
          </button>
        </form>
      )}
      <p aria-live="polite" className="quick-action-form__done" data-shown={done || undefined}>{done ? (ar ? 'تم · جاهز للتالي' : 'Done · ready for the next one') : ''}</p>
    </div>
  );
}
