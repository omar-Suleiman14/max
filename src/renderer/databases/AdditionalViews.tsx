import { useState } from 'react';
import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceProperty, WorkspaceRecord, WorkspaceRecordDraft } from '../../shared/property-contract';
import { PageIconRenderer } from '../ui/page-icon-renderer';

/** Property values are stored as unknown; only the scalar shapes are readable. */
function formatValue(value: unknown, property?: WorkspaceProperty): string {
  if (Array.isArray(value)) return value.map((entry) => formatValue(entry, property)).join(', ');
  if (typeof value === 'string' && property?.options) return property.options.find((option) => (option.id || option.label) === value)?.label ?? value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

type Props = {
  layout: 'chart' | 'dashboard' | 'timeline' | 'feed' | 'form';
  records: readonly WorkspaceRecord[];
  schema: DatabaseSchema | null;
  locale: string;
  onOpenRecord: (record: WorkspaceRecord) => void;
  onCreateRecord: (draft: WorkspaceRecordDraft) => Promise<WorkspaceRecord | null>;
};

export function AdditionalViews({ layout, records, schema, locale, onOpenRecord, onCreateRecord }: Props) {
  const ar = locale === 'ar';
  const [propertyId, setPropertyId] = useState('');
  const [title, setTitle] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  if (!schema) return null;
  const numeric = schema.properties.filter(p => ['number', 'formula', 'rollup'].includes(p.type));
  const dates = schema.properties.filter(p => p.type === 'date');
  const selected = (layout === 'timeline' ? dates : numeric).find(p => p.id === propertyId) ?? (layout === 'timeline' ? dates : numeric)[0];
  const create = () => { void onCreateRecord({ databaseId: schema.database.id, title: ar ? 'بدون عنوان' : 'Untitled' }).then(record => { if (record) onOpenRecord(record); }); };
  if (layout === 'form') return <form className="database-entry-form" onSubmit={event => {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage('');
    void onCreateRecord({ databaseId: schema.database.id, title, properties: values }).then(record => { if (record) { setTitle(''); setValues({}); setMessage(ar ? 'تم حفظ السجل' : 'Record saved'); } }).catch(error => setMessage(String(error))).finally(() => setBusy(false));
  }}><h2>{schema.database.title}</h2><label>{ar ? 'الاسم' : 'Name'}<input required value={title} onChange={event => setTitle(event.target.value)}/></label>
    {schema.properties.filter(p => ['text','number','date','checkbox','select','status','email','url','phone'].includes(p.type)).map(p => <label key={p.id}>{p.name}{p.required ? ' *' : ''}{['select','status'].includes(p.type) ? <select required={p.required} value={formatValue(values[p.id])} onChange={event => setValues(old => ({...old,[p.id]:event.target.value}))}><option value="">—</option>{p.options?.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select> : <input required={p.required} type={p.type === 'number' ? 'number' : p.type === 'date' ? 'date' : p.type === 'checkbox' ? 'checkbox' : 'text'} step="any" checked={p.type === 'checkbox' ? !!values[p.id] : undefined} value={p.type === 'checkbox' ? undefined : formatValue(values[p.id])} onChange={event => setValues(old => ({...old,[p.id]:p.type === 'checkbox' ? event.target.checked : p.type === 'number' ? event.target.value === '' ? null : Number(event.target.value) : event.target.value}))}/>}</label>)}
    {message && <p role="status">{message}</p>}<button className="btn btn-primary" disabled={busy} type="submit">{ar ? 'حفظ' : 'Submit'}</button>
  </form>;
  if (layout === 'feed') return <section className="database-feed">{[...records].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).map(record => <button className="database-feed-card" type="button" key={record.id} onClick={() => onOpenRecord(record)}><PageIconRenderer icon={record.icon ?? undefined}/><strong>{record.title}</strong><time>{new Date(record.updatedAt).toLocaleString(ar ? 'ar' : 'en')}</time><span>{schema.properties.filter(p => !['title','relation','button'].includes(p.type)).slice(0,4).map(p => `${p.name}: ${formatValue(record.properties[p.id], p) || '—'}`).join(' · ')}</span></button>)}<button type="button" onClick={create}>{ar ? 'سجل جديد' : 'New record'}</button></section>;
  if (layout === 'timeline') {
    const dated = records.map(record => ({record, date: selected ? formatValue(record.properties[selected.id]) : ''}));
    return <section className="database-timeline"><label>{ar ? 'خاصية التاريخ' : 'Date property'}<select value={selected?.id ?? ''} onChange={event => setPropertyId(event.target.value)}><option value="">—</option>{dates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {!dates.length && <p>{ar ? 'أضف خاصية تاريخ من إعدادات الخصائص.' : 'Add a Date property in property settings to place records on the timeline.'}</p>}
      {dated.sort((a,b) => (a.date || 'z').localeCompare(b.date || 'z')).map(({record,date}) => <button type="button" key={record.id} onClick={() => onOpenRecord(record)}><time>{date || (ar ? 'بدون تاريخ' : 'No date')}</time><span>{record.title}</span></button>)}<button type="button" onClick={create}>{ar ? 'سجل جديد' : 'New record'}</button></section>;
  }
  const data = records.map(record => ({record, value:selected ? Number(record.properties[selected.id]) || 0 : 1}));
  const maximum = Math.max(1,...data.map(row => Math.abs(row.value)));
  return <section className="database-chart">
    {layout === 'dashboard' && <div className="database-special-view"><div className="database-special-view__metric"><strong>{records.length}</strong><span>{ar ? 'سجل' : 'Records'}</span></div>{numeric.slice(0,4).map(p => <div key={p.id} className="database-special-view__metric"><strong>{records.reduce((sum,r) => sum + (Number(r.properties[p.id]) || 0),0).toLocaleString(locale)}</strong><span>{p.name}</span></div>)}</div>}
    <label>{ar ? 'القيمة' : 'Value'}<select value={selected?.id ?? ''} onChange={event => setPropertyId(event.target.value)}><option value="">{ar ? 'عدد السجلات' : 'Record count'}</option>{numeric.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    {data.map(({record,value}) => <button className="database-chart-row" type="button" key={record.id} onClick={() => onOpenRecord(record)}><span>{record.title}</span><span className="database-chart-track"><i style={{width:`${Math.abs(value)/maximum*100}%`}}/></span><output>{value.toLocaleString(locale)}</output></button>)}<button type="button" onClick={create}>{ar ? 'سجل جديد' : 'New record'}</button>
  </section>;
}
