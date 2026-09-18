import { useState, type CSSProperties } from 'react';
import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceRecord, WorkspaceRecordDraft } from '../../shared/property-contract';
import type { AggregateCalculationType, QueryCalculationResult, RecordGroup } from '../../shared/query-contract';
import type { ChartLayoutConfig, TimelineLayoutConfig } from '../../shared/view-contract';

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

function chartObject(layoutConfig: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const chart = layoutConfig.chart;
  return chart && typeof chart === 'object' && !Array.isArray(chart)
    ? chart as Readonly<Record<string, unknown>>
    : {};
}

function readChartConfig(layoutConfig: Readonly<Record<string, unknown>>): ChartLayoutConfig {
  const chart = chartObject(layoutConfig);
  const calculation = typeof chart.calculation === 'string' ? chart.calculation as AggregateCalculationType : 'count';
  const type = chart.type === 'line' || chart.type === 'pie' ? chart.type : 'bar';
  return {
    calculation,
    propertyId: typeof chart.propertyId === 'string' ? chart.propertyId : 'title',
    type,
  };
}

function calculationValue(
  calculations: readonly QueryCalculationResult[],
  propertyId: string,
  calculation: AggregateCalculationType,
): number | null {
  const result = calculations.find((candidate) => candidate.propertyId === propertyId && candidate.calculation === calculation);
  return typeof result?.value === 'number' && Number.isFinite(result.value) ? result.value : null;
}

function pieBackground(points: readonly { value: number }[]): string {
  const total = points.reduce((sum, point) => sum + Math.abs(point.value), 0);
  if (total <= 0) return 'var(--line)';
  let cursor = 0;
  const stops = points.map((point, index) => {
    const start = cursor;
    cursor += Math.abs(point.value) / total * 100;
    return `var(--chart-${index % 6}) ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

type Props = {
  calculations?: readonly QueryCalculationResult[];
  groups?: readonly RecordGroup[];
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

export function AdditionalViews({ calculations = [], groups = [], layout, layoutConfig = {}, records, schema, locale, onLayoutConfigChange, onManageProperties, onOpenRecord, onCreateRecord }: Props) {
  const ar = locale === 'ar';
  const [title, setTitle] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  if (!schema) return null;
  const dates = schema.properties.filter(p => p.type === 'date');
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
  const chartConfig = readChartConfig(layoutConfig);
  const chartType = chartConfig.type ?? 'bar';
  const calculation = chartConfig.calculation ?? 'count';
  const chartPropertyId = chartConfig.propertyId ?? 'title';
  const numeric = schema.properties.filter(p => ['number', 'formula', 'rollup'].includes(p.type));
  const availableMeasures = [{ id: 'title', name: ar ? 'عدد السجلات' : 'Record count' }, ...numeric.map(p => ({ id: p.id, name: p.name }))];
  const points = groups.length > 0
    ? groups.map(group => ({ label: group.label, value: calculationValue(group.calculations ?? [], chartPropertyId, calculation) }))
    : [{ label: ar ? 'كل السجلات' : 'All records', value: calculationValue(calculations, chartPropertyId, calculation) }];
  const plotted = points.filter((point): point is { label: string; value: number } => point.value !== null);
  const maximum = Math.max(1, ...plotted.map(point => Math.abs(point.value)));
  const saveChartConfig = (next: ChartLayoutConfig) => {
    const nextPropertyId = next.propertyId ?? chartPropertyId;
    const nextCalculation = next.calculation ?? calculation;
    onLayoutConfigChange?.({
      ...layoutConfig,
      calculations: [{ calculation: nextCalculation, propertyId: nextPropertyId }],
      chart: { ...chartObject(layoutConfig), ...next },
    });
  };

  return <section className="database-chart" dir={ar ? 'rtl' : 'ltr'}>
    <div className="database-chart__controls">
      <label>{ar ? 'نوع الرسم' : 'Chart type'}<select value={chartType} onChange={event => saveChartConfig({ ...chartConfig, type: event.target.value as 'bar' | 'line' | 'pie' })}><option value="bar">{ar ? 'أعمدة' : 'Bar'}</option><option value="line">{ar ? 'خطي' : 'Line'}</option><option value="pie">{ar ? 'دائري' : 'Pie'}</option></select></label>
      <label>{ar ? 'القيمة' : 'Value'}<select value={chartPropertyId} onChange={event => {
        const propertyId = event.target.value;
        saveChartConfig({ ...chartConfig, calculation: propertyId === 'title' ? 'count' : 'sum', propertyId });
      }}>{availableMeasures.map(measure => <option key={measure.id} value={measure.id}>{measure.name}</option>)}</select></label>
      {chartPropertyId !== 'title' && <label>{ar ? 'التجميع' : 'Aggregation'}<select value={calculation} onChange={event => saveChartConfig({ ...chartConfig, calculation: event.target.value as AggregateCalculationType })}>{(['sum', 'avg', 'min', 'max', 'count_values'] as const).map(kind => <option key={kind} value={kind}>{kind}</option>)}</select></label>}
    </div>
    {plotted.length === 0 ? <div className="database-chart__empty" role="status">{ar ? 'لا توجد بيانات للرسم. اختر قيمة أو غيّر عوامل التصفية.' : 'No chart data. Choose a value or change the active filters.'}</div> : chartType === 'line' ? <svg className="database-chart__line" role="img" aria-label={ar ? 'رسم خطي' : 'Line chart'} viewBox="0 0 100 40" preserveAspectRatio="none">
      <polyline points={plotted.map((point, index) => `${plotted.length === 1 ? 50 : index * 100 / (plotted.length - 1)},${20 - point.value / maximum * 18}`).join(' ')} vectorEffect="non-scaling-stroke" />
    </svg> : chartType === 'pie' ? <div className="database-chart__pie" role="img" aria-label={ar ? 'رسم دائري' : 'Pie chart'} style={{ '--chart-pie': pieBackground(plotted) } as CSSProperties} /> : <div className="database-chart__bars" aria-label={ar ? 'رسم أعمدة' : 'Bar chart'} role="img">
      {plotted.map(point => <div className="database-chart-row" key={point.label}><span>{point.label}</span><span className="database-chart-track"><i data-negative={point.value < 0 || undefined} style={{ width: `${Math.abs(point.value) / maximum * 100}%` }} /></span><output>{point.value.toLocaleString(locale)}</output></div>)}
    </div>}
    <div className="database-chart__values" aria-label={ar ? 'قيم الرسم' : 'Chart values'} role="list">{plotted.map(point => <div key={point.label} role="listitem" tabIndex={0} aria-label={`${point.label}: ${point.value.toLocaleString(locale)}`}><span>{point.label}</span><output>{point.value.toLocaleString(locale)}</output></div>)}</div>
    <button type="button" onClick={create}>{ar ? 'سجل جديد' : 'New record'}</button>
  </section>;
}
