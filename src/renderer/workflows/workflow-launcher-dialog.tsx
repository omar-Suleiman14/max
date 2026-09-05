import { Select } from '../ui/select';
import { Play, Plus, Save, Settings2, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type {
  WorkflowInputField,
  WorkflowInputSchema,
  WorkflowStep,
  WorkspaceWorkflow,
} from '../../shared/workflow-contract';
import type { Locale } from '../app/i18n';
import { FocusedOverlay } from '../ui/focused-overlay';

type Props = Readonly<{ locale: Locale; onClose: () => void }>;

function inputKey(field: WorkflowInputField, index: number): string {
  return field.key ?? field.id ?? `input_${index + 1}`;
}

function coerceInput(field: WorkflowInputField, value: string | boolean): unknown {
  if (field.type === 'boolean') return Boolean(value);
  if (field.type === 'money' || field.type === 'number') {
    if (value === '') return '';
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  return value;
}

function initialInputValue(value: unknown): string | boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
}

export function WorkflowLauncherDialog({ locale, onClose }: Props) {
  const ar = locale === 'ar';
  const [workflows, setWorkflows] = useState<readonly WorkspaceWorkflow[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [inputs, setInputs] = useState<Readonly<Record<string, string | boolean>>>({});
  const [recordOptions, setRecordOptions] = useState<Readonly<Record<string, readonly { id: string; title: string }[]>>>({});
  const [message, setMessage] = useState<string>();
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editorName, setEditorName] = useState('');
  const [editorInputs, setEditorInputs] = useState('{\n  "fields": []\n}');
  const [editorSteps, setEditorSteps] = useState('[]');

  const selected = useMemo(() => workflows.find((workflow) => workflow.id === selectedId), [selectedId, workflows]);

  const reload = async (preferredId?: string) => {
    const rows = await window.maxApi.workspace.listWorkflows();
    setWorkflows(rows);
    setSelectedId(preferredId ?? selectedId ?? rows[0]?.id);
  };

  useEffect(() => {
    void window.maxApi.workspace.listWorkflows().then((rows) => {
      setWorkflows(rows);
      setSelectedId(rows[0]?.id);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setInputs(Object.fromEntries(selected.inputSchema.fields.map((field, index) => [
      inputKey(field, index),
      initialInputValue(field.defaultValue),
    ])));
    for (const [index, field] of selected.inputSchema.fields.entries()) {
      const key = inputKey(field, index);
      if (field.type === 'record' && field.databaseId) {
        void window.maxApi.workspace.queryDatabase({ databaseId: field.databaseId, limit: 100 }).then((result) => {
          setRecordOptions((current) => ({
            ...current,
            [key]: result.records.map((record) => ({ id: record.id, title: record.title })),
          }));
        });
      }
    }
  }, [selected]);

  const openEditor = (workflow?: WorkspaceWorkflow) => {
    setEditorName(workflow?.name ?? '');
    setEditorInputs(JSON.stringify(workflow?.inputSchema ?? { fields: [] }, null, 2));
    setEditorSteps(JSON.stringify(workflow?.steps ?? [], null, 2));
    setEditing(true);
    setMessage(undefined);
  };

  const saveWorkflow = async () => {
    try {
      const inputSchema = JSON.parse(editorInputs) as WorkflowInputSchema;
      const steps = JSON.parse(editorSteps) as readonly WorkflowStep[];
      const result = selected && selectedId
        ? await window.maxApi.workspace.updateWorkflow(selectedId, { inputSchema, name: editorName, steps })
        : await window.maxApi.workspace.createWorkflow({ inputSchema, name: editorName, steps });
      if (!result.ok) throw new Error(result.error.message);
      setEditing(false);
      await reload(result.value.id);
      setMessage(ar ? 'تم حفظ سير العمل.' : 'Workflow saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const execute = async (testMode: boolean) => {
    if (!selected) return;
    setRunning(true);
    setMessage(undefined);
    const values = Object.fromEntries(selected.inputSchema.fields.map((field, index) => {
      const key = inputKey(field, index);
      return [key, coerceInput(field, inputs[key] ?? '')];
    }));
    const result = await window.maxApi.workspace.executeWorkflow({ inputs: values, testMode, workflowId: selected.id });
    setRunning(false);
    setMessage(result.ok
      ? testMode
        ? (ar ? 'نجح الاختبار وتم التراجع عن كل التغييرات.' : 'Test passed; all changes were rolled back.')
        : (ar ? 'اكتمل سير العمل بنجاح.' : 'Workflow completed successfully.')
      : result.error.message);
  };

  return (
    <FocusedOverlay className="modal-backdrop" labelId="workflow-dialog-title" onClose={onClose}>
      <div className="modal-container" role="document">
        <div className="modal-header">
          <h2 id="workflow-dialog-title">{ar ? 'سير العمل' : 'Workflows'}</h2>
          <button aria-label={ar ? 'إغلاق' : 'Close'} className="btn-icon" onClick={onClose} type="button"><X size={17} /></button>
        </div>
        <div className="modal-body grid gap-4" style={{ gridTemplateColumns: 'minmax(180px, .7fr) minmax(280px, 1.3fr)' }}>
          <aside className="space-y-2">
            {workflows.map((workflow) => (
              <button className={`btn w-full justify-start ${selectedId === workflow.id ? 'btn-primary' : 'btn-secondary'}`} key={workflow.id} onClick={() => { setSelectedId(workflow.id); setEditing(false); }} type="button">
                <Play size={14} /> {workflow.name}
              </button>
            ))}
            <button className="btn btn-secondary w-full" onClick={() => { setSelectedId(undefined); openEditor(); }} type="button"><Plus size={14} />{ar ? 'سير عمل جديد' : 'New workflow'}</button>
          </aside>
          <section>
            {editing ? (
              <div className="space-y-3">
                <label className="form-group"><span className="form-label">{ar ? 'الاسم' : 'Name'}</span><input className="input-field" onChange={(event) => setEditorName(event.target.value)} value={editorName} /></label>
                <label className="form-group"><span className="form-label">{ar ? 'مخطط المدخلات (JSON)' : 'Input schema (JSON)'}</span><textarea className="input-field font-mono" onChange={(event) => setEditorInputs(event.target.value)} rows={8} value={editorInputs} /></label>
                <label className="form-group"><span className="form-label">{ar ? 'الخطوات (JSON)' : 'Steps (JSON)'}</span><textarea className="input-field font-mono" onChange={(event) => setEditorSteps(event.target.value)} rows={12} value={editorSteps} /></label>
                <button className="btn btn-primary" disabled={!editorName.trim()} onClick={() => void saveWorkflow()} type="button"><Save size={14} />{ar ? 'حفظ' : 'Save'}</button>
              </div>
            ) : selected ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between"><div><h3>{selected.name}</h3><small>v{selected.version}</small></div><button className="btn btn-secondary btn-sm" onClick={() => openEditor(selected)} type="button"><Settings2 size={14} />{ar ? 'تحرير' : 'Edit'}</button></div>
                {selected.inputSchema.fields.map((field, index) => {
                  const key = inputKey(field, index);
                  return <label className="form-group" key={key}><span className="form-label">{field.label}{field.required ? ' *' : ''}</span>
                    {field.type === 'boolean' ? <input checked={Boolean(inputs[key])} onChange={(event) => setInputs((current) => ({ ...current, [key]: event.target.checked }))} type="checkbox" />
                      : field.type === 'select' || field.type === 'record' ? <Select className="input-field" onChange={(event) => setInputs((current) => ({ ...current, [key]: event.target.value }))} value={String(inputs[key] ?? '')}><option value="">{ar ? 'اختر…' : 'Choose…'}</option>{(field.type === 'record' ? recordOptions[key] ?? [] : field.options ?? []).map((option) => <option key={'id' in option ? option.id : option.value} value={'id' in option ? option.id : option.value}>{'id' in option ? option.title : option.label}</option>)}</Select>
                        : <input className="input-field" onChange={(event) => setInputs((current) => ({ ...current, [key]: event.target.value }))} type={field.type === 'date' ? 'date' : field.type === 'money' || field.type === 'number' ? 'number' : 'text'} value={String(inputs[key] ?? '')} />}
                  </label>;
                })}
                <div className="flex gap-2"><button className="btn btn-primary" disabled={running} onClick={() => void execute(false)} type="button"><Play size={14} />{ar ? 'تشغيل' : 'Run'}</button><button className="btn btn-secondary" disabled={running} onClick={() => void execute(true)} type="button">{ar ? 'اختبار دون حفظ' : 'Test without saving'}</button><button className="btn btn-ghost text-danger" onClick={() => void window.maxApi.workspace.archiveWorkflow(selected.id).then(() => reload())} type="button"><Trash2 size={14} /></button></div>
              </div>
            ) : <p>{ar ? 'أنشئ سير عمل للبدء.' : 'Create a workflow to get started.'}</p>}
            {message && <div className="alert mt-3">{message}</div>}
          </section>
        </div>
      </div>
    </FocusedOverlay>
  );
}
