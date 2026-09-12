import { RecordCreateForm } from '../databases/RecordCreateForm';
import type { WorkflowFormEvaluation } from '../../shared/workflow-contract';
import { inputKey, inputDefaults } from './input-defaults';
import { useEffect, useRef, useState } from 'react';
import type { WorkflowInputField } from '../../shared/workflow-contract';
import type { WorkspaceRecord } from '../../shared/property-contract';
import type { Locale } from '../app/i18n';
import { NumberInput } from '../ui/number-input';
import { parseNumericInput } from '../../shared/digits';
import { Select } from '../ui/select';
import { scalarText } from '../../shared/scalar-text';
export function WorkflowInputForm({ fields, values, onChange, disabled, locale, evaluation, missing, path = [], onEdit }: { fields: readonly WorkflowInputField[]; values: Record<string, unknown>; onChange: (values: Record<string, unknown>) => void; disabled: boolean; locale: Locale; evaluation?: WorkflowFormEvaluation; missing?: readonly string[]; path?: (string | number)[]; onEdit?: (path: string, reset?: boolean, removedRow?: number) => void }) {
  const latest = useRef({ values, onChange }); latest.current = { values, onChange };
  const [records, setRecords] = useState<Record<string, readonly WorkspaceRecord[]>>({});
  const [creating, setCreating] = useState<string>();
  const [optionalShown, setOptionalShown] = useState(false);
  const [error, setError] = useState(''); const ar = locale === 'ar';
  useEffect(() => {
    if (evaluation) return;
    let active = true;
    const ids = [...new Set(fields.filter(f => f.type === 'record' && f.databaseId).map(f => f.databaseId!))];
    void Promise.all(ids.map(async databaseId => {
      const rows: WorkspaceRecord[] = []; let cursor: string | undefined;
      do { const page = await window.maxApi.workspace.queryDatabase({ databaseId, cursor, limit: 200 }); rows.push(...page.records); cursor = page.nextCursor ?? undefined; } while (cursor && active);
      return [databaseId, rows] as const;
    })).then(entries => { if (active) {
      const loaded = Object.fromEntries(entries); setRecords(loaded);
      const current = latest.current; const next = { ...current.values }; let changed = false;
      fields.forEach((f, i) => { const key = inputKey(f, i); if (!f.prefill || (next[key] !== undefined && next[key] !== '')) return;
        const record = loaded[f.prefill.databaseId]?.find(r => r.id === next[f.prefill!.inputKey]);
        const value = record?.properties[f.prefill.propertyId]; if (value !== undefined) { next[key] = value; changed = true; }
      });
      if (changed) current.onChange(next);
    } }).catch(() => { if (active) setError(ar ? 'تعذر تحميل السجلات.' : 'Could not load records.'); });
    return () => { active = false; };
  }, [fields, ar, evaluation]);
  const update = (field: WorkflowInputField, key: string, value: unknown) => {
    onEdit?.(JSON.stringify([...path, key]));
    const next = { ...values, [key]: value };
    fields.forEach((target, index) => {
      if (target.prefill?.inputKey !== key) return;
      if (evaluation) { next[inputKey(target, index)] = ''; return; }
      const record = records[field.databaseId ?? '']?.find(r => r.id === value);
      next[inputKey(target, index)] = record?.properties[target.prefill.propertyId] ?? target.defaultValue ?? '';
    });
    onChange(next);
  };
  const displayFields = fields
    .map((field, index) => {
      const key = inputKey(field, index);
      const address = JSON.stringify([...path, key]);
      const state = evaluation?.fields[address];
      return { field, index, key, address, value: values[key], state, required: state?.required ?? field.required };
    })
    .filter(({ state }) => state?.visible !== false)
    .sort((left, right) => Number(Boolean(right.required)) - Number(Boolean(left.required)) || left.index - right.index);

  // Only what the action actually needs is asked for up front. Optional fields
  // stay one click away, unless every field is optional and hiding them all
  // would leave an empty form.
  const optionalCount = displayFields.filter(({ required }) => !required).length;
  const collapsible = optionalCount > 0 && optionalCount < displayFields.length;
  const visibleFields = collapsible && !optionalShown ? displayFields.filter(({ required }) => required) : displayFields;

  return <>{error && <p role="alert">{error}</p>}{visibleFields.map(({ field, key, address, value, state, required }) => {
    const fieldDisabled = disabled || state?.disabled;
    if (field.type === 'collection') {
      const rows = Array.isArray(value) ? value as Record<string, unknown>[] : [];
      const minimum = Math.max(field.minItems ?? 0, required ? 1 : 0);
      return <fieldset className="action-collection" data-missing={missing?.includes(address) || undefined} key={key} disabled={fieldDisabled}><legend>{field.label}{required ? ' *' : ''}</legend>{rows.map((row, i) => <div className="action-collection-row" key={i}><span className="action-row-number">{i + 1}</span><div className="action-collection-fields"><WorkflowInputForm fields={field.fields ?? []} values={row} onChange={next => onChange({ ...values, [key]: rows.map((r, j) => i === j ? next : r) })} disabled={!!fieldDisabled} locale={locale} evaluation={evaluation} missing={missing} path={[...path, key, i]} onEdit={onEdit}/></div><button type="button" disabled={fieldDisabled || rows.length <= minimum} aria-label={(ar ? 'حذف الصف ' : 'Remove row ') + (i + 1)} onClick={() => { onEdit?.(address, false, i); onChange({ ...values, [key]: rows.filter((_, j) => i !== j) }); }}>×</button></div>)}<button type="button" disabled={fieldDisabled || rows.length >= (field.maxItems ?? 100)} onClick={() => onChange({ ...values, [key]: [...rows, inputDefaults(field.fields ?? [])] })}>{ar ? '+ صف' : '+ Add row'}</button></fieldset>;
    }
    return <div className="action-field" data-missing={missing?.includes(address) || undefined} data-required={required || undefined} key={key}><label className="form-group"><span>{field.label}{required ? ' *' : ''}</span>{field.type === 'boolean' ? <input type="checkbox" disabled={fieldDisabled} checked={Boolean(value)} onChange={e => update(field, key, e.target.checked)}/> : field.type === 'record' || field.type === 'select' ? <Select aria-label={field.label} disabled={fieldDisabled} value={scalarText(value ?? '')} onChange={e => update(field, key, e.target.value)}><option value="">{ar ? 'اختر…' : 'Choose…'}</option>{field.type === 'record' ? (state?.options ?? records[field.databaseId ?? ''])?.map(r => <option key={r.id} value={r.id}>{r.title}{'secondary' in r && r.secondary ? ' · ' + String(r.secondary) : ''}</option>) : field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</Select> : field.type === 'number' ? <NumberInput aria-label={field.label} disabled={fieldDisabled} value={scalarText(value ?? '')} onValueChange={next => update(field, key, next === '' ? '' : parseNumericInput(next) ?? next)}/> : <input disabled={fieldDisabled} required={required} type={field.type === 'datetime' ? 'datetime-local' : field.type === 'date' ? 'date' : 'text'} value={scalarText(value ?? '')} onChange={e => update(field, key, e.target.value)}/>}</label>{field.derived?.allowOverride && state?.overridden && <button type="button" className="action-reset" disabled={disabled} onClick={() => onEdit?.(address, true)}>{ar ? 'إعادة الحساب' : 'Reset calculated value'}</button>}{field.type === 'record' && field.allowCreate && !fieldDisabled && <button type="button" className="action-reset" onClick={() => setCreating(key)}>{ar ? '+ سجل جديد' : '+ Add new'}</button>}{creating === key && field.databaseId && <RecordCreateForm databaseId={field.databaseId} locale={locale} onCancel={() => setCreating(undefined)} onCreated={r => { update(field, key, r.id); setCreating(undefined); }}/>}</div>;
  })}{collapsible && <button aria-expanded={optionalShown} className="action-optional-toggle" disabled={disabled} onClick={() => setOptionalShown(shown => !shown)} type="button">{optionalShown
    ? (ar ? 'إخفاء الحقول الاختيارية' : 'Hide optional fields')
    : (ar ? `… ${optionalCount} حقول اختيارية` : `… ${optionalCount} optional field${optionalCount === 1 ? '' : 's'}`)}</button>}</>;
}
