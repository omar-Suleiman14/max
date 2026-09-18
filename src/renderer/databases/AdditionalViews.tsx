import { useState } from 'react';
import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceRecord, WorkspaceRecordDraft } from '../../shared/property-contract';
import type { TimelineLayoutConfig } from '../../shared/view-contract';

/** Property values are stored as unknown; only the scalar shapes are readable. */
function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function timelineObject(layoutConfig: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const timeline = layoutConfig.timeline;
  return timeline && typeof timeline === 'object' && !Array.isArray(timeline)
    ? timeline as Readonly<Record<string, unknown>>
    : {};
}

function readTimelineConfig(layoutConfig: Readonly<Record<string, unknown>>): TimelineLayoutConfig {
  const timeline = timelineObject(layoutConfig);
  return {
    endPropertyId: typeof timeline.endPropertyId === 'string' ? timeline.endPropertyId : null,
    startPropertyId: typeof timeline.startPropertyId === 'string' ? timeline.startPropertyId : null,
  };
}

type Props = {
  layout: 'chart' | 'timeline' | 'form';
  layoutConfig?: Readonly<Record<string, unknown>>;
  records: readonly WorkspaceRecord[];
  schema: DatabaseSchema | null;
  locale: string;
  onLayoutConfigChange?: (layoutConfig: Readonly<Record<string, unknown>>) => void;
  onManageProperties?: () => void;
  onOpenRecord: (record: WorkspaceRecord) => void;
  onCreateRecord: (draft: WorkspaceRecordDraft) => Promise<WorkspaceRecord | null>;
};

export function AdditionalViews({ layout, layoutConfig = {}, records, schema, locale, onLayoutConfigChange, onManageProperties, onOpenRecord, onCreateRecord }: Props) {
  const ar = locale === 'ar';
  const [propertyId, setPropertyId] = useState('');
  const [title, setTitle] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  if (!schema) return null;
  const numeric = schema.properties.filter(p => ['number', 'formula', 'rollup'].includes(p.type));
  const dates = schema.properties.filter(p => p.type === 'date');
  const selected = numeric.find(p => p.id === propertyId) ?? numeric[0];
  const create = () => { void onCreateRecord({ databaseId: schema.database.id, title: ar ? 'بدون عنوان' : 'Untitled' }).then(record => { if (record) onOpenRecord(record); }); };
  if (layout === 'form') return <form className="database-entry-form" onSubmit={event => {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage('');
    void onCreateRecord({ databaseId: schema.database.id, title, properties: values }).then(record => { if (record) { setTitle(''); setValues({}); setMessage(ar ? 'تم حفظ السجل' : 'Record saved'); } }).catch(error => setMessage(String(error))).finally(() => setBusy(false));
  }}><h2>{schema.database.title}</h2><label>{ar ? 'الاسم' : 'Name'}<input required value={title} onChange={event => setTitle(event.target.value)}/></label>
    {schema.properties.filter(p => ['text','number','date','checkbox','select','status','email','url','phone'].includes(p.type)).map(p => <label key={p.id}>{p.name}{p.required ? ' *' : ''}{['select','status'].includes(p.type) ? <select required={p.required} value={formatValue(values[p.id])} onChange={event => setValues(old => ({...old,[p.id]:event.target.value}))}><option value="">—</option>{p.options?.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select> : <input required={p.required} type={p.type === 'number' ? 'number' : p.type === 'date' ? 'date' : p.type === 'checkbox' ? 'checkbox' : 'text'} step="any" checked={p.type === 'checkbox' ? !!values[p.id] : undefined} value={p.type === 'checkbox' ? undefined : formatValue(values[p.id])} onChange={event => setValues(old => ({...old,[p.id]:p.type === 'checkbox' ? event.target.checked : p.type === 'number' ? event.target.value === '' ? null : Number(event.target.value) : event.target.value}))}/>}</label>)}
    {message && <p role="status">{message}</p>}<button className="btn btn-primary" disabled={busy} type="submit">{ar ? 'حفظ' : 'Submit'}</button>
  </form>;
  if (layout === 'timeline') {
    const timelineConfig = readTimelineConfig(layoutConfig);
    const startProperty = dates.find(p => p.id === timelineConfig.startPropertyId) ?? dates[0];
    const endProperty = timelineConfig.endPropertyId && timelineConfig.endPropertyId !== startProperty?.id
      ? dates.find(p => p.id === timelineConfig.endPropertyId)
      : undefined;
    const saveTimelineConfig = (next: TimelineLayoutConfig) => {
      onLayoutConfigChange?.({
        ...layoutConfig,
        timeline: { ...timelineObject(layoutConfig), ...next },
      });
    };

    if (!startProperty) {
      return <section className="database-timeline" dir={ar ? 'rtl' : 'ltr'}>
        <div className="database-timeline__empty">
          <p>{ar ? 'أضف خاصية تاريخ لعرض السجلات على الخط الزمني.' : 'Add a Date property to place records on the timeline.'}</p>
          {onManageProperties && <button type="button" onClick={onManageProperties}>{ar ? 'إضافة خاصية تاريخ' : 'Add Date property'}</button>}
        </div>
        <button type="button" onClick={create}>{ar ? 'سجل جديد' : 'New record'}</button>
      </section>;
    }

    const dated = records.map((record, index) => ({
      end: endProperty ? formatValue(record.properties[endProperty.id]) : '',
      index,
      record,
      start: formatValue(record.properties[startProperty.id]),
    }));
    dated.sort((a, b) => {
      if (!a.start && b.start) return 1;
      if (a.start && !b.start) return -1;
      return a.start.localeCompare(b.start) || a.index - b.index;
    });

    return <section className="database-timeline" dir={ar ? 'rtl' : 'ltr'}>
      <div className="database-timeline__controls">
        <label>{ar ? 'تاريخ البداية' : 'Start date'}
          <select value={startProperty.id} onChange={event => {
            const startPropertyId = event.target.value;
            saveTimelineConfig({
              endPropertyId: timelineConfig.endPropertyId === startPropertyId ? null : timelineConfig.endPropertyId ?? null,
              startPropertyId,
            });
          }}>{dates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
        <label>{ar ? 'تاريخ النهاية' : 'End date'}
          <select value={endProperty?.id ?? ''} onChange={event => saveTimelineConfig({
            endPropertyId: event.target.value || null,
            startPropertyId: startProperty.id,
          })}>
            <option value="">{ar ? 'بدون تاريخ نهاية' : 'No end date'}</option>
            {dates.filter(p => p.id !== startProperty.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      {dated.map(({ record, start, end }) => {
        const startLabel = start || (endProperty ? (ar ? 'بدون تاريخ بداية' : 'No start date') : (ar ? 'بدون تاريخ' : 'No date'));
        const range = endProperty ? `${startLabel} → ${end || (ar ? 'بدون تاريخ نهاية' : 'No end date')}` : startLabel;
        return <button className="database-timeline__record" type="button" key={record.id} onClick={() => onOpenRecord(record)}><time>{range}</time><span>{record.title}</span></button>;
      })}
      <button type="button" onClick={create}>{ar ? 'سجل جديد' : 'New record'}</button>
    </section>;
  }
  const data = records.map(record => ({record, value:selected ? Number(record.properties[selected.id]) || 0 : 1}));
  const maximum = Math.max(1,...data.map(row => Math.abs(row.value)));
  return <section className="database-chart">
    <label>{ar ? 'القيمة' : 'Value'}<select value={selected?.id ?? ''} onChange={event => setPropertyId(event.target.value)}><option value="">{ar ? 'عدد السجلات' : 'Record count'}</option>{numeric.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    {data.map(({record,value}) => <button className="database-chart-row" type="button" key={record.id} onClick={() => onOpenRecord(record)}><span>{record.title}</span><span className="database-chart-track"><i style={{width:`${Math.abs(value)/maximum*100}%`}}/></span><output>{value.toLocaleString(locale)}</output></button>)}<button type="button" onClick={create}>{ar ? 'سجل جديد' : 'New record'}</button>
  </section>;
}
