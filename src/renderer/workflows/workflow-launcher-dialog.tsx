import { ReactiveActionForm } from './reactive-action-form';
import { hasReactiveFields } from './reactive-config';
import { WorkflowInputForm } from './workflow-input-form';
import { inputDefaults } from './input-defaults';
import { useEffect, useRef, useState } from 'react';
import type { WorkspaceWorkflow } from '../../shared/workflow-contract';
import type { Locale } from '../app/i18n';
import { FocusedOverlay } from '../ui/focused-overlay';
import './quick-actions.css';

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export function WorkflowLauncherDialog({ locale, onClose, onConfigure }: { locale: Locale; onClose: () => void; onConfigure: () => void }) {
  const ar = locale === 'ar';
  const [actions, setActions] = useState<readonly WorkspaceWorkflow[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [formInstance, setFormInstance] = useState(0);
  const lock = useRef(false);
  const selected = actions.find((action) => action.id === selectedId);

  useEffect(() => {
    let active = true;
    void window.maxApi.workspace.listWorkflows()
      .then((rows) => {
        if (!active) return;
        const enabled = rows.filter((row) => row.enabled);
        setActions(enabled);
        setSelectedId((current) => enabled.some((action) => action.id === current) ? current : enabled[0]?.id ?? '');
      })
      .catch(() => setError(ar ? 'تعذر تحميل الإجراءات.' : 'Could not load actions.'))
      .finally(() => setLoading(false));
    return () => { active = false; };
  }, [ar]);

  useEffect(() => {
    setCompleted(false);
    setError('');
    setValues(inputDefaults(selected?.inputSchema.fields ?? []));
  }, [selected, ar, formInstance]);

  useEffect(() => {
    const chooseByNumber = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return;
      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index > 8 || !actions[index] || running) return;
      event.preventDefault();
      setSelectedId(actions[index].id);
    };
    document.addEventListener('keydown', chooseByNumber);
    return () => document.removeEventListener('keydown', chooseByNumber);
  }, [actions, running]);

  const execute = async () => {
    if (!selected || lock.current || completed) return;
    lock.current = true;
    setRunning(true);
    setError('');
    try {
      const result = await window.maxApi.workspace.executeWorkflow({ workflowId: selected.id, inputs: values });
      if (!result.ok) setError(result.error.message);
      else {
        setCompleted(true);
        window.dispatchEvent(new Event('max:workspace-changed'));
      }
    } catch {
      setError(ar ? 'تعذر تنفيذ الإجراء.' : 'Could not execute action.');
    } finally {
      lock.current = false;
      setRunning(false);
    }
  };

  const resetCurrentAction = () => {
    setCompleted(false);
    setFormInstance((current) => current + 1);
  };

  return (
    <FocusedOverlay className="quick-actions-overlay" labelId="quick-action-title" onClose={() => { if (!lock.current) onClose(); }}>
      <div className="quick-action-runtime" role="document">
        <div className="quick-action-runtime__header">
          <div>
            <h2 id="quick-action-title">{ar ? 'الإجراءات السريعة' : 'Quick Actions'}</h2>
            {!loading && actions.length > 1 && <p>{ar ? 'اضغط ١–٩ للتبديل بسرعة.' : 'Press 1–9 to switch actions.'}</p>}
          </div>
          <button className="quick-action-runtime__close" type="button" disabled={running} aria-label={ar ? 'إغلاق' : 'Close'} onClick={onClose}>×</button>
        </div>

        {loading ? <div className="quick-action-runtime__empty"><p>{ar ? 'جار التحميل…' : 'Loading…'}</p></div> : !actions.length ? (
          <div className="quick-action-runtime__empty"><p>{ar ? 'لا توجد إجراءات سريعة بعد. قم بإعدادها في إعدادات مساحة العمل.' : 'No quick actions yet. Configure them in Workspace Settings.'}</p></div>
        ) : <>
          <div className="quick-action-tabs" aria-label={ar ? 'الإجراءات السريعة' : 'Quick actions'} role="tablist">
            {actions.map((action, index) => {
              const selectedTab = action.id === selectedId;
              return <button
                aria-controls="quick-action-panel"
                aria-selected={selectedTab}
                className="quick-action-tab"
                data-active={selectedTab || undefined}
                disabled={running}
                key={action.id}
                onClick={() => setSelectedId(action.id)}
                role="tab"
                tabIndex={selectedTab ? 0 : -1}
                title={index < 9 ? `${index + 1}. ${action.name}` : action.name}
                type="button"
              >
                {index < 9 && <kbd>{index + 1}</kbd>}
                <span>{action.name}</span>
              </button>;
            })}
          </div>

          {selected && <section className="quick-action-runtime__panel" id="quick-action-panel" role="tabpanel">
            <div className="quick-action-runtime__action-title">
              <h3>{selected.name}</h3>
            </div>
            {completed ? (
              <div className="quick-action-runtime__complete" role="status">
                <strong>{ar ? 'اكتمل الإجراء' : 'Action completed'}</strong>
                <p>{ar ? 'تم حفظ التغييرات في مساحة العمل.' : 'Your changes have been saved to the workspace.'}</p>
                <button className="btn btn-primary" type="button" onClick={resetCurrentAction}>{ar ? 'تشغيل مرة أخرى' : 'Run again'}</button>
              </div>
            ) : hasReactiveFields(selected.inputSchema) ? (
              <ReactiveActionForm key={`${selected.id}:${formInstance}`} workflow={selected} locale={locale} onCompleted={() => setCompleted(true)} onBusy={(busy) => { lock.current = busy; setRunning(busy); }} />
            ) : (
              <form key={`${selected.id}:${formInstance}`} onSubmit={(event) => { event.preventDefault(); void execute(); }}>
                <WorkflowInputForm fields={selected.inputSchema.fields} values={values} onChange={setValues} disabled={running} locale={locale} />
                <button className="btn btn-primary" type="submit" disabled={running}>{running ? (ar ? 'جار التنفيذ…' : 'Running…') : (ar ? 'تشغيل' : 'Run')}</button>
              </form>
            )}
          </section>}
        </>}

        {error && <p className="quick-action-runtime__error" role="alert">{error}</p>}
        <footer className="quick-action-runtime__footer">
          <button className="btn btn-ghost" type="button" disabled={running} onClick={onConfigure}>{ar ? 'إدارة الإجراءات السريعة' : 'Manage Quick Actions'}</button>
        </footer>
      </div>
    </FocusedOverlay>
  );
}
