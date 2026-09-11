import { useEffect, useRef, useState } from 'react';
import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceRecord } from '../../shared/property-contract';
import type { Locale } from '../app/i18n';
import { OptionValue } from './OptionValue';
import { isRequirementUnmet } from './required-properties';
import { scalarText } from '../../shared/scalar-text';

/** Unsaved record draft; persistence and constraints use the normal workspace record API. */
export function RecordCreateForm({ databaseId, locale, onCreated, onCancel }: { databaseId: string; locale: Locale; onCreated: (record: WorkspaceRecord) => void; onCancel: () => void }) {
  const ar = locale === 'ar'; const [schema, setSchema] = useState<DatabaseSchema>();
  const [title, setTitle] = useState(''), [properties, setProperties] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState(''); const locked = useRef(false);
  useEffect(() => { let active = true; void window.maxApi.workspace.getDatabaseSchema(databaseId).then(s => { if (active) { setSchema(s); setProperties(Object.fromEntries(s.properties.filter(p => p.defaultValueJson).map(p => [p.id, JSON.parse(p.defaultValueJson!) as unknown]))); } }).catch(() => setError(ar ? 'تعذر تحميل الخصائص.' : 'Could not load properties.')); return () => { active = false; }; }, [databaseId, ar]);
  const create = async () => {
    if (!schema || locked.current || !title.trim()) return;
    locked.current = true; setBusy(true); setError('');
    try { const result = await window.maxApi.workspace.createRecord({ databaseId, title, properties }); if (!result.ok) { setError(result.error.message); return; } onCreated(result.value); window.dispatchEvent(new Event('max:workspace-changed')); }
    catch { setError(ar ? 'تعذر إنشاء السجل.' : 'Could not create record.'); }
    finally { locked.current = false; setBusy(false); }
  };
  return <div className="action-inline-create" role="group" aria-label={ar ? 'سجل جديد' : 'New record'}><strong>{schema?.database.title}</strong><label>{ar ? 'الاسم' : 'Name'}<input autoFocus aria-label={ar ? 'اسم السجل الجديد' : 'New record name'} value={title} disabled={busy} onChange={e => setTitle(e.target.value)}/></label>{schema?.properties.filter(p => !['title', 'formula', 'rollup', 'created_time', 'last_edited_time', 'created_by', 'last_edited_by', 'auto_id', 'button', 'relation'].includes(p.type)).map(p => <label key={p.id} data-required-unmet={isRequirementUnmet(p, properties[p.id]) || undefined}><span>{p.name}{p.required ? ' *' : ''}</span>{['select', 'multi_select', 'status'].includes(p.type) ? <OptionValue property={p} value={properties[p.id]} multiple={p.type === 'multi_select'} locale={locale} onChange={v => setProperties(old => ({ ...old, [p.id]: v }))}/> : <input disabled={busy} type={p.type === 'number' ? 'number' : p.type === 'checkbox' ? 'checkbox' : p.type === 'date' ? 'date' : 'text'} step="any" checked={p.type === 'checkbox' ? Boolean(properties[p.id]) : undefined} value={p.type === 'checkbox' ? undefined : scalarText(properties[p.id] ?? '')} onChange={e => setProperties(old => ({ ...old, [p.id]: p.type === 'checkbox' ? e.target.checked : p.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value }))}/>}</label>)}{error && <p role="alert">{error}</p>}<small>{ar ? 'يُحفظ السجل الجديد بشكل مستقل عن الإجراء.' : 'The new record is saved independently of this action.'}</small><div className="action-row"><button type="button" disabled={busy || !schema || !title.trim()} onClick={() => { void create(); }}>{ar ? 'إنشاء واختيار' : 'Create and select'}</button><button type="button" disabled={busy} onClick={onCancel}>{ar ? 'إلغاء' : 'Cancel'}</button></div></div>;
}
