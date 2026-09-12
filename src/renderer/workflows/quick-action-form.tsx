import { useCallback, useEffect, useRef, useState } from 'react';

import type { WorkspaceWorkflow } from '../../shared/workflow-contract';
import type { Locale } from '../app/i18n';
import { lastUsedInputs, rememberInputs } from './last-used-inputs';
import { ReactiveActionForm } from './reactive-action-form';
import { hasReactiveFields } from './reactive-config';
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
 */
export function QuickActionForm({ action, locale, onBusyChange, onEnabled, onOpenSettings }: QuickActionFormProps) {
  const ar = locale === 'ar';
  const [values, setValues] = useState<Record<string, unknown>>(() => lastUsedInputs(action.id, action.inputSchema.fields));
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [formInstance, setFormInstance] = useState(0);
  const lock = useRef(false);
  const blocked = !action.enabled;

  const setBusy = useCallback((busy: boolean) => {
    lock.current = busy;
    setRunning(busy);
    onBusyChange?.(busy);
  }, [onBusyChange]);

  useEffect(() => {
    setCompleted(false);
    setError('');
    setValues(lastUsedInputs(action.id, action.inputSchema.fields));
  }, [action, formInstance]);

  const execute = async () => {
    if (blocked || lock.current || completed) return;
    setBusy(true);
    setError('');
    try {
      const result = await window.maxApi.workspace.executeWorkflow({ workflowId: action.id, inputs: values });
      if (!result.ok) setError(result.error.message);
      else {
        rememberInputs(action.id, values);
        setCompleted(true);
        window.dispatchEvent(new Event('max:workspace-changed'));
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
        <div className="quick-action-form__notice">
          <strong>{ar ? 'هذا الإجراء موقوف' : 'This action is turned off'}</strong>
          <p>{ar
            ? 'تم إيقافه في الإعدادات، لذا لا يمكن تشغيله الآن.'
            : 'It was switched off in settings, so it cannot run right now.'}</p>
          <div className="quick-action-form__actions">
            <button className="btn btn-primary" disabled={enabling} onClick={() => void turnOn()} type="button">
              {enabling ? (ar ? 'جارٍ التفعيل…' : 'Turning on…') : (ar ? 'تفعيل الإجراء' : 'Turn it on')}
            </button>
            <button className="btn btn-ghost" onClick={onOpenSettings} type="button">{ar ? 'فتح الإعدادات' : 'Open settings'}</button>
          </div>
        </div>
        {error && <p className="quick-action-form__error" role="alert">{error}</p>}
      </div>
    );
  }

  if (completed) {
    return (
      <div className="quick-action-form">
        <div className="quick-action-form__notice quick-action-form__notice--done" role="status">
          <strong>{ar ? 'تم تنفيذ الإجراء' : 'Action completed'}</strong>
          <p>{ar ? 'تم حفظ التغييرات في مساحة العمل.' : 'Your changes have been saved to the workspace.'}</p>
          <div className="quick-action-form__actions">
            <button className="btn btn-primary" onClick={() => setFormInstance((current) => current + 1)} type="button">
              {ar ? 'تشغيل مرة أخرى' : 'Run again'}
            </button>
          </div>
        </div>
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
          onCompleted={() => setCompleted(true)}
          onBusy={setBusy}
        />
      ) : (
        <form key={`${action.id}:${formInstance}`} onSubmit={(event) => { event.preventDefault(); void execute(); }}>
          <WorkflowInputForm fields={action.inputSchema.fields} values={values} onChange={setValues} disabled={running} locale={locale} />
          <button className="btn btn-primary" type="submit" disabled={running}>
            {running ? (ar ? 'جار التنفيذ…' : 'Running…') : (ar ? 'تشغيل' : 'Run')}
          </button>
        </form>
      )}
      {error && <p className="quick-action-form__error" role="alert">{error}</p>}
    </div>
  );
}
