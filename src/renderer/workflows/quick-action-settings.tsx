import { formChoices } from './form-choices';
import { ActionFormBehavior } from './action-form-behavior';
import { ActionInputsEditor } from './action-inputs-editor';
import { IconPickerDialog } from '../ui/icon-picker-dialog';
import { PageIconRenderer } from '../ui/page-icon-renderer';
import { scalarText } from '../../shared/scalar-text';
import { generateOrderKey } from '../../shared/order-key';
import { useEffect, useState } from 'react';
import type { WorkspaceWorkflow, WorkspaceWorkflowDraft, WorkflowStep, WorkflowStepType, WorkflowValue } from '../../shared/workflow-contract';
import type { WorkspaceProperty } from '../../shared/property-contract';
import type { PropertyFilterNode, FilterOperator } from '../../shared/query-contract';
import type { Locale } from '../app/i18n';
import { Select } from '../ui/select';
import { ActionValueEditor, type ValueChoice } from './action-value-editor';
import './quick-actions.css';

const empty = (): WorkspaceWorkflowDraft => ({ name: '', enabled: true, icon: '', inputSchema: { fields: [] }, steps: [] });
const literal = (value: unknown): WorkflowValue => ({ source: 'literal', value });
const variable = (key: string): WorkflowValue => ({ source: 'variable', key });
const stepTypes: WorkflowStepType[] = ['FIND_RECORD', 'COMPUTE', 'CREATE_RECORD', 'UPDATE_RECORD', 'FOR_EACH', 'SUM'];
const en = ['Find record', 'Calculate value', 'Create record', 'Update record', 'For each row', 'Sum rows'];
const arabic = ['بحث عن سجل', 'حساب قيمة', 'إنشاء سجل', 'تحديث سجل', 'لكل صف', 'مجموع الصفوف'];

export function QuickActionSettings({ locale }: { locale: Locale }) {
  const ar = locale === 'ar';
  const [actions, setActions] = useState<readonly WorkspaceWorkflow[]>([]);
  const [draft, setDraft] = useState<WorkspaceWorkflowDraft>();
  const [databases, setDatabases] = useState<readonly { id: string; title: string }[]>([]);
  const [schemas, setSchemas] = useState<Record<string, readonly WorkspaceProperty[]>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pickingIcon, setPickingIcon] = useState(false);
  const reload = () => window.maxApi.workspace.listWorkflows().then(setActions);
  useEffect(() => {
    let active = true;
    void Promise.all([window.maxApi.workspace.listWorkflows(), window.maxApi.workspace.getNavigation()]).then(async ([rows, nav]) => {
      const entries = await Promise.all(nav.databases.map(async (db) => [db.id, (await window.maxApi.workspace.getDatabaseSchema(db.id)).properties] as const));
      if (active) { setActions(rows); setDatabases(nav.databases); setSchemas(Object.fromEntries(entries)); }
    }).catch(() => setError(ar ? 'تعذر تحميل الإجراءات.' : 'Could not load actions.'));
    return () => { active = false; };
  }, [ar]);
  const save = async () => {
    if (!draft || saving) return;
    setSaving(true); setError('');
    try {
      const definition = JSON.parse(JSON.stringify(draft)) as WorkspaceWorkflowDraft;
      const result = draft.id ? await window.maxApi.workspace.updateWorkflow(draft.id, definition) : await window.maxApi.workspace.createWorkflow(definition);
      if (!result.ok) { setError(result.error.message); return; }
      setDraft(undefined); await reload();
      window.dispatchEvent(new Event('max:workspace-changed'));
    } catch { setError(ar ? 'تعذر حفظ الإجراء.' : 'Could not save action.'); }
    finally { setSaving(false); }
  };
  const dbSelect = (value: unknown, change: (id: string) => void) => <Select aria-label={ar ? 'قاعدة البيانات' : 'Database'} value={scalarText(value ?? '')} onChange={(e) => change(e.target.value)}><option value="">{ar ? 'اختر قاعدة بيانات' : 'Choose database'}</option>{value && !databases.some((db) => db.id === value) ? <option value={scalarText(value)}>{ar ? 'قاعدة بيانات غير متاحة' : 'Unavailable database'}</option> : null}{databases.map((db) => <option value={db.id} key={db.id}>{db.title}</option>)}</Select>;
  const properties = (id: unknown) => schemas[scalarText(id)] ?? [];
  const choicesAt = (index: number): ValueChoice[] => {
    if (!draft) return [];
    const choices: ValueChoice[] = [];
    const add = (key: string, label: string, databaseId?: string) => {
      choices.push({ label, value: variable(key) });
      if (databaseId) for (const prop of properties(databaseId)) choices.push({ label: `${label} · ${prop.name}`, value: { source: 'property', record: variable(key), databaseId, propertyId: prop.id } });
    };
    draft.inputSchema.fields.forEach((field) => add(field.key ?? field.id ?? '', field.label, field.databaseId));
    draft.steps.slice(0, index).forEach((step, i) => { if (step.config.outputVariable) add(scalarText(step.config.outputVariable), `${ar ? 'الخطوة' : 'Step'} ${i + 1}`, step.type !== 'COMPUTE' && !step.config.multiple ? scalarText(step.config.databaseId ?? '') : undefined); });
    add('now', ar ? 'الوقت الحالي' : 'Current time');
    return choices;
  };
  const outputChoices = (steps: WorkspaceWorkflowDraft['steps']): ValueChoice[] => steps.flatMap((step, i) => {
    const key = scalarText(step.config.outputVariable ?? ''); if (!key) return [];
    const value = variable(key); const label = 'Step ' + (i + 1);
    return [{ label, value }, ...(['CREATE_RECORD','UPDATE_RECORD','FIND_RECORD'].includes(step.type) && !step.config.multiple ? properties(step.config.databaseId).map(p => ({ label: label + ' · ' + p.name, value: { source: 'property' as const, record: value, databaseId: String(step.config.databaseId), propertyId: p.id } })) : [])];
  });
  const itemChoices = (collection: unknown): ValueChoice[] => {
    const ref = collection as WorkflowValue; const field = ref?.source === 'variable' ? draft?.inputSchema.fields.find(f => (f.key ?? f.id) === ref.key) : undefined;
    return [{ label: 'Current item', value: { source: 'item' } }, { label: 'Current index (0 based)', value: { source: 'index' } }, ...(field?.fields ?? []).flatMap((f, i) => {
      const value: WorkflowValue = { source: 'item', field: f.key ?? f.id ?? 'input_' + (i + 1) };
      return [{ label: 'Row · ' + f.label, value }, ...(f.type === 'record' ? properties(f.databaseId).map(p => ({ label: 'Row · ' + f.label + ' · ' + p.name, value: { source: 'property' as const, record: value, databaseId: f.databaseId!, propertyId: p.id } })) : [])];
    })];
  };
  const renderSteps = (steps: WorkspaceWorkflowDraft['steps'], setSteps: (steps: WorkspaceWorkflowDraft['steps']) => void, inherited: ValueChoice[], depth = 0): React.ReactNode => {
    const patchStep = (index: number, config: Record<string, unknown>) => setSteps(steps.map((s, i) => i === index ? { ...s, config: { ...s.config, ...config } } : s));
    const choicesFor = (index: number) => [...inherited, ...outputChoices(steps.slice(0, index))];
    return <div className="action-nested-steps">{steps.map((step, index) => {
        const c = step.config;
        const choices = choicesFor(index);
        const valueEditor = (value: unknown, change: (value: WorkflowValue) => void) => <ActionValueEditor locale={locale} choices={choices} value={value} onChange={change} />;
        const propSelect = (value: string, change: (id: string) => void, numeric = false) => <Select aria-label={ar ? 'الخاصية' : 'Property'} value={value} onChange={(e) => change(e.target.value)}><option value="">{ar ? 'اختر خاصية' : 'Choose property'}</option>{value && !properties(c.databaseId).some((prop) => prop.id === value) && <option value={value}>{ar ? 'خاصية محذوفة' : 'Deleted property'}</option>}{properties(c.databaseId).filter((prop) => numeric ? prop.type === 'number' : !['formula', 'rollup', 'auto_id', 'button', 'created_time', 'created_by', 'last_edited_time', 'last_edited_by'].includes(prop.type)).map((prop) => <option key={prop.id} value={prop.id}>{prop.name}</option>)}</Select>;
        const mapping = (key: 'properties' | 'increments') => <div>
          {Object.entries((c[key] ?? {}) as Record<string, unknown>).map(([id, value]) => <div className="action-row" key={id}>{propSelect(id, (next) => patchStep(index, { [key]: Object.fromEntries(Object.entries(c[key] as object).map(([old, v]) => [old === id ? next : old, v])) }), key === 'increments')}{valueEditor(value, (next) => patchStep(index, { [key]: { ...(c[key] as object), [id]: next } }))}<button type="button" aria-label={ar ? 'حذف تعيين' : 'Remove mapping'} onClick={() => patchStep(index, { [key]: Object.fromEntries(Object.entries(c[key] as object).filter(([old]) => old !== id)) })}>×</button></div>)}
          <button type="button" onClick={() => patchStep(index, { [key]: { ...(c[key] as object), '': literal(key === 'increments' ? 0 : '') } })}>{key === 'increments' ? (ar ? '+ تعديل رقمي' : '+ Numeric adjustment') : (ar ? '+ تعيين خاصية' : '+ Property mapping')}</button>
        </div>;
        const filters = (c.filter as { conditions?: PropertyFilterNode[] } | undefined)?.conditions ?? [];
        return <div className="action-step" key={step.id ?? index}>
          <div className="action-row"><strong>{index + 1}</strong><Select aria-label={ar ? 'العملية' : 'Operation'} value={step.type} onChange={(e) => setSteps(steps.map((s, i) => i === index ? { ...s, type: e.target.value as WorkflowStepType, config: { outputVariable: s.config.outputVariable, ...(['FOR_EACH', 'SUM'].includes(e.target.value) ? { collection: variable(draft?.inputSchema.fields.find(f => f.type === 'collection')?.key ?? 'rows'), ...(e.target.value === 'FOR_EACH' ? { steps: [], yield: { source: 'item' } } : { value: literal(0) }) } : {}) } } : s))}>{stepTypes.filter(type => depth < 3 || type !== 'FOR_EACH').map((type) => <option key={type} value={type}>{(ar ? arabic : en)[stepTypes.indexOf(type)]}</option>)}</Select><button type="button" disabled={index === 0} aria-label={ar ? 'تحريك الخطوة لأعلى' : 'Move step up'} onClick={() => { const reordered = [...steps]; [reordered[index - 1], reordered[index]] = [reordered[index]!, reordered[index - 1]!]; setSteps(reordered); }}>↑</button><button type="button" aria-label={ar ? 'حذف الخطوة' : 'Remove step'} onClick={() => setSteps(steps.filter((_, i) => i !== index))}>×</button></div>
          {['CREATE_RECORD', 'UPDATE_RECORD', 'FIND_RECORD'].includes(step.type) && dbSelect(c.databaseId, (databaseId) => patchStep(index, { databaseId, properties: {}, increments: {}, filter: undefined }))}
          {['FOR_EACH', 'SUM'].includes(step.type) && <>
            <label>{ar ? 'الصفوف' : 'Collection'}{valueEditor(c.collection ?? literal([]), collection => patchStep(index, { collection }))}</label>
            {step.type === 'SUM' ? <ActionValueEditor locale={locale} choices={[...choices, ...itemChoices(c.collection)]} value={c.value ?? literal(0)} onChange={value => patchStep(index, { value })}/> : <>
              {renderSteps((c.steps ?? []) as WorkflowStep[], nested => patchStep(index, { steps: nested }), [...choices, ...itemChoices(c.collection)], depth + 1)}
              <label>{ar ? 'نتيجة كل صف' : 'Collect result from each row'}<ActionValueEditor locale={locale} choices={[...choices, ...itemChoices(c.collection), ...outputChoices((c.steps ?? []) as WorkflowStep[])]} value={c.yield ?? literal(null)} onChange={value => patchStep(index, { yield: value })}/></label>
            </>}
          </>}
          {step.type === 'COMPUTE' && valueEditor(c.value ?? literal(0), (value) => patchStep(index, { value }))}
          {step.type === 'CREATE_RECORD' && <label>{ar ? 'عنوان السجل' : 'Record title'}{valueEditor(c.title ?? literal(''), (title) => patchStep(index, { title }))}</label>}
          {step.type === 'UPDATE_RECORD' && <label>{ar ? 'السجل' : 'Record'}{valueEditor(c.record ?? literal(''), (record) => patchStep(index, { record }))}</label>}
          {['CREATE_RECORD', 'UPDATE_RECORD'].includes(step.type) && mapping('properties')}
          {step.type === 'UPDATE_RECORD' && mapping('increments')}
          {step.type === 'FIND_RECORD' && <>
            {filters.map((filter, i) => <div className="action-row" key={i}>{propSelect(filter.propertyId, (propertyId) => patchStep(index, { filter: { kind: 'group', operator: 'AND', conditions: filters.map((f, j) => i === j ? { ...f, propertyId } : f) } }))}<Select aria-label={ar ? 'المقارنة' : 'Comparison'} value={filter.operator} onChange={(e) => patchStep(index, { filter: { kind: 'group', operator: 'AND', conditions: filters.map((f, j) => i === j ? { ...f, operator: e.target.value as FilterOperator } : f) } })}>{['equals', 'not_equals', 'greater_than', 'greater_than_or_equal', 'less_than', 'less_than_or_equal', 'contains'].map((op, j) => <option key={op} value={op}>{['=', '≠', '>', '≥', '<', '≤', ar ? 'يحتوي' : 'contains'][j]}</option>)}</Select>{valueEditor(filter.value, (value) => patchStep(index, { filter: { kind: 'group', operator: 'AND', conditions: filters.map((f, j) => i === j ? { ...f, value } : f) } }))}<button type="button" aria-label={ar ? 'حذف شرط' : 'Remove filter'} onClick={() => patchStep(index, { filter: { kind: 'group', operator: 'AND', conditions: filters.filter((_, j) => i !== j) } })}>×</button></div>)}
            <button type="button" onClick={() => patchStep(index, { filter: { kind: 'group', operator: 'AND', conditions: [...filters, { kind: 'property', propertyId: '', operator: 'equals', value: literal('') }] } })}>{ar ? '+ شرط' : '+ Filter'}</button>
            <label><input type="checkbox" checked={c.required !== false} onChange={(e) => patchStep(index, { required: e.target.checked })} />{ar ? 'يجب العثور على سجل' : 'Require a match'}</label>
            <label><input type="checkbox" checked={Boolean(c.multiple)} onChange={(e) => patchStep(index, { multiple: e.target.checked })} />{ar ? 'إرجاع كل النتائج' : 'Return all matches'}</label>
          </>}
        </div>;
      })}<button type="button" onClick={() => { const id = crypto.randomUUID(); setSteps([...steps, { id, type: 'CREATE_RECORD', config: { outputVariable: id } }]); }}>+ Step</button></div>;
  };
  return <div className="quick-action-settings">
    {error && <p role="alert">{error}</p>}
    {!draft ? <>
      {!actions.length && <p>{ar ? 'لا توجد إجراءات سريعة بعد.' : 'No quick actions yet.'}</p>}
      {actions.map((action, index) => <div className="action-list-row" key={action.id}>
        <button type="button" onClick={() => { setDraft(action); setError(''); }}><strong><PageIconRenderer icon={action.icon || 'lucide:Zap'} size={16} /> {action.name}</strong><small>{action.inputSchema.fields.length} {ar ? 'مدخلات' : 'inputs'} · {action.steps.length} {ar ? 'خطوات' : 'steps'}{!action.enabled && (ar ? ' · معطل' : ' · Disabled')}</small></button>
        <button type="button" disabled={index === 0 || saving} aria-label={ar ? 'تحريك لأعلى' : 'Move up'} onClick={() => { const previous = actions[index - 1]; if (!previous) return; setSaving(true); void window.maxApi.workspace.updateWorkflow(action.id, { positionKey: generateOrderKey(actions[index - 2]?.positionKey, previous.positionKey) }).then(async (result) => { if (!result.ok) setError(result.error.message); await reload(); }).finally(() => setSaving(false)); }}>↑</button>
      </div>)}
      <button type="button" className="btn btn-secondary" onClick={() => { setDraft(empty()); setError(''); }}>{ar ? '+ إجراء سريع' : '+ Quick action'}</button>
    </> : <>
      <div className="action-row">
        <label>{ar ? 'الأيقونة' : 'Icon'}<div style={{ position: 'relative' }}><button type="button" aria-label={ar ? 'اختر أيقونة' : 'Choose icon'} onClick={() => setPickingIcon(true)}><PageIconRenderer icon={draft.icon || 'lucide:Zap'} size={20} /></button>{pickingIcon && <IconPickerDialog locale={locale} currentIcon={draft.icon ?? undefined} onClose={() => setPickingIcon(false)} onSelect={(icon) => { setDraft({ ...draft, icon }); setPickingIcon(false); }} />}</div></label>
        <label>{ar ? 'الاسم' : 'Name'}<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label><input type="checkbox" checked={draft.enabled !== false} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />{ar ? 'مفعل' : 'Enabled'}</label>
      </div>
      <h3>{ar ? 'المدخلات' : 'Inputs'}</h3>
      <ActionInputsEditor fields={draft.inputSchema.fields} onChange={fields => setDraft({ ...draft, inputSchema: { ...draft.inputSchema, fields } })} databases={databases} schemas={schemas} locale={locale}/>
      <ActionFormBehavior schema={draft.inputSchema} onChange={inputSchema => setDraft({ ...draft, inputSchema })} choices={formChoices(draft.inputSchema.fields, schemas)} schemas={schemas} locale={locale}/>
      <h3>{ar ? 'الخطوات' : 'Steps'}</h3>
      {renderSteps(draft.steps, steps => setDraft({ ...draft, steps }), choicesAt(0))}

      {error && <p className="action-save-error" role="alert">{error}</p>}
      <div className="action-row action-footer"><button className="btn btn-primary" disabled={saving || !draft.name.trim()} type="button" onClick={() => void save()}>{ar ? 'حفظ' : 'Save'}</button><button type="button" disabled={saving} onClick={() => setDraft(undefined)}>{ar ? 'إلغاء' : 'Cancel'}</button>{draft.id && <button type="button" disabled={saving} onClick={() => { setSaving(true); void window.maxApi.workspace.archiveWorkflow(draft.id!).then(async (result) => { if (!result.ok) setError(result.error.message); else { setDraft(undefined); await reload(); } }).finally(() => setSaving(false)); }}>{ar ? 'أرشفة الإجراء' : 'Archive action'}</button>}</div>
    </>}
  </div>;
}
