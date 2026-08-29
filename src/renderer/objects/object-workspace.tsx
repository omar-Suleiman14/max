import { Archive, Clock3, Edit3, Plus, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  propertyTypes,
  type AuditEntry,
  type ConfigurableRecord,
  type ConfigurableRecordDraft,
  type MutationResult,
  type ObjectKind,
  type PropertyDefinition,
  type PropertyDraft,
  type PropertyValue,
} from '../../shared/object-contract';
import type { Locale } from '../app/i18n';
import { Button } from '../ui/button';
import { FocusedOverlay } from '../ui/focused-overlay';
import { objectCopy, objectError, objectKindLabel, propertyTypeLabel } from './object-i18n';

type ObjectWorkspaceProps = Readonly<{
  createRequest: number;
  locale: Locale;
  objectKind: ObjectKind;
}>;

type ArchiveTarget = Readonly<{
  id: string;
  kind: 'property' | 'record';
  name: string;
}>;

function mutationMessage<T>(locale: Locale, result: MutationResult<T>): string | undefined {
  return result.ok ? undefined : objectError(locale, result.error.code);
}

function formatValue(
  value: PropertyValue | undefined,
  property: PropertyDefinition,
  relatedRecords: readonly ConfigurableRecord[],
  locale: Locale,
): string {
  if (value === undefined) return objectCopy(locale, 'optional');
  if (property.type === 'checkbox') return value ? (locale === 'ar' ? 'نعم' : 'Yes') : (locale === 'ar' ? 'لا' : 'No');
  if (property.type === 'relation') return relatedRecords.find(({ id }) => id === value)?.label ?? String(value);
  return String(value);
}

function DialogHeader({ locale, onClose, title, titleId }: Readonly<{ locale: Locale; onClose: () => void; title: string; titleId: string }>) {
  return (
    <header className="dialog-header">
      <div><p className="eyebrow">MAX · {objectCopy(locale, 'schema')}</p><h2 id={titleId}>{title}</h2></div>
      <button aria-label={objectCopy(locale, 'close')} className="icon-button" onClick={onClose} type="button">
        <X aria-hidden="true" size={19} />
      </button>
    </header>
  );
}

function PropertyEditor({
  initial,
  locale,
  objectKind,
  onClose,
  onSave,
}: Readonly<{
  initial?: PropertyDefinition;
  locale: Locale;
  objectKind: ObjectKind;
  onClose: () => void;
  onSave: (draft: PropertyDraft) => Promise<string | undefined>;
}>) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<PropertyDraft['type']>(initial?.type ?? 'text');
  const [required, setRequired] = useState(initial?.rules.required ?? false);
  const [unique, setUnique] = useState(initial?.rules.unique ?? false);
  const [digitsOnly, setDigitsOnly] = useState(initial?.rules.digitsOnly ?? false);
  const [minimum, setMinimum] = useState(initial?.rules.minimum?.toString() ?? '');
  const [maximum, setMaximum] = useState(initial?.rules.maximum?.toString() ?? '');
  const [minimumLength, setMinimumLength] = useState(initial?.rules.minimumLength?.toString() ?? '');
  const [maximumLength, setMaximumLength] = useState(initial?.rules.maximumLength?.toString() ?? '');
  const [choices, setChoices] = useState(initial?.rules.choices.join('\n') ?? '');
  const [relationTarget, setRelationTarget] = useState<ObjectKind>(initial?.rules.relationTarget ?? 'person');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const numberOrUndefined = (value: string) => value === '' ? undefined : Number(value);
    const nextError = await onSave({
      name,
      objectKind,
      rules: {
        choices: choices.split('\n'),
        digitsOnly,
        maximum: numberOrUndefined(maximum),
        maximumLength: numberOrUndefined(maximumLength),
        minimum: numberOrUndefined(minimum),
        minimumLength: numberOrUndefined(minimumLength),
        relationTarget,
        required,
        unique,
      },
      type,
    });
    setSaving(false);
    setError(nextError);
  }

  return (
    <FocusedOverlay className="object-dialog" labelId="property-dialog-title" onClose={onClose}>
      <DialogHeader locale={locale} onClose={onClose} title={initial ? objectCopy(locale, 'editProperty') : objectCopy(locale, 'addProperty')} titleId="property-dialog-title" />
      <form className="object-form" onSubmit={(event) => void submit(event)}>
        {error && <p className="form-error" role="alert">{error}</p>}
        <label className="field">
          <span>{objectCopy(locale, 'propertyName')}</span>
          <input data-autofocus="true" maxLength={80} onChange={(event) => setName(event.target.value)} required value={name} />
        </label>
        <label className="field">
          <span>{objectCopy(locale, 'type')}</span>
          <select onChange={(event) => setType(event.target.value as PropertyDraft['type'])} value={type}>
            {propertyTypes.map((propertyType) => <option key={propertyType} value={propertyType}>{propertyTypeLabel(locale, propertyType)}</option>)}
          </select>
        </label>
        <div className="rule-grid">
          <label className="check-field"><input checked={required} onChange={(event) => setRequired(event.target.checked)} type="checkbox" /><span>{objectCopy(locale, 'required')}</span></label>
          <label className="check-field"><input checked={unique} onChange={(event) => setUnique(event.target.checked)} type="checkbox" /><span>{objectCopy(locale, 'unique')}</span></label>
          {type === 'text' && <label className="check-field"><input checked={digitsOnly} onChange={(event) => setDigitsOnly(event.target.checked)} type="checkbox" /><span>{objectCopy(locale, 'digitsOnly')}</span></label>}
        </div>
        {(type === 'number' || type === 'money') && (
          <div className="field-pair">
            <label className="field"><span>{objectCopy(locale, 'minimum')}</span><input inputMode="decimal" onChange={(event) => setMinimum(event.target.value)} type="number" value={minimum} /></label>
            <label className="field"><span>{objectCopy(locale, 'maximum')}</span><input inputMode="decimal" onChange={(event) => setMaximum(event.target.value)} type="number" value={maximum} /></label>
          </div>
        )}
        {type === 'text' && (
          <div className="field-pair">
            <label className="field"><span>{objectCopy(locale, 'minimumLength')}</span><input min="0" onChange={(event) => setMinimumLength(event.target.value)} step="1" type="number" value={minimumLength} /></label>
            <label className="field"><span>{objectCopy(locale, 'maximumLength')}</span><input min="0" onChange={(event) => setMaximumLength(event.target.value)} step="1" type="number" value={maximumLength} /></label>
          </div>
        )}
        {(type === 'select' || type === 'status') && (
          <label className="field"><span>{objectCopy(locale, 'choices')}</span><textarea onChange={(event) => setChoices(event.target.value)} placeholder={objectCopy(locale, 'choicesHint')} rows={4} value={choices} /></label>
        )}
        {type === 'relation' && (
          <label className="field"><span>{objectCopy(locale, 'relationTarget')}</span><select onChange={(event) => setRelationTarget(event.target.value as ObjectKind)} value={relationTarget}><option value="item">{objectKindLabel(locale, 'item')}</option><option value="person">{objectKindLabel(locale, 'person')}</option></select></label>
        )}
        <footer className="form-footer"><Button onClick={onClose}>{objectCopy(locale, 'cancel')}</Button><Button disabled={saving} type="submit" variant="primary">{objectCopy(locale, 'save')}</Button></footer>
      </form>
    </FocusedOverlay>
  );
}

type InputValue = boolean | string;

function RecordEditor({
  initial,
  locale,
  objectKind,
  onClose,
  onSave,
  properties,
  relatedRecords,
}: Readonly<{
  initial?: ConfigurableRecord;
  locale: Locale;
  objectKind: ObjectKind;
  onClose: () => void;
  onSave: (draft: ConfigurableRecordDraft) => Promise<string | undefined>;
  properties: readonly PropertyDefinition[];
  relatedRecords: readonly ConfigurableRecord[];
}>) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [values, setValues] = useState<Record<string, InputValue>>(() => Object.fromEntries(
    Object.entries(initial?.values ?? {}).map(([id, value]) => [id, typeof value === 'boolean' ? value : String(value)]),
  ));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const title = initial
    ? objectCopy(locale, objectKind === 'item' ? 'editItem' : 'editPerson')
    : objectCopy(locale, objectKind === 'item' ? 'createItem' : 'createPerson');

  function setValue(id: string, value: InputValue) {
    setValues((current) => ({ ...current, [id]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const prepared: Record<string, PropertyValue> = {};
    for (const property of properties) {
      const value = values[property.id];
      if (property.type === 'checkbox' && typeof value === 'boolean') prepared[property.id] = value;
      else if ((property.type === 'number' || property.type === 'money') && value !== '' && value !== undefined) prepared[property.id] = Number(value);
      else if (typeof value === 'string' && value !== '') prepared[property.id] = value;
    }
    setSaving(true);
    const nextError = await onSave({ label, objectKind, values: prepared });
    setSaving(false);
    setError(nextError);
  }

  return (
    <FocusedOverlay className="object-dialog" labelId="record-dialog-title" onClose={onClose}>
      <DialogHeader locale={locale} onClose={onClose} title={title} titleId="record-dialog-title" />
      <form className="object-form" onSubmit={(event) => void submit(event)}>
        {error && <p className="form-error" role="alert">{error}</p>}
        <label className="field"><span>{objectCopy(locale, 'label')}</span><input data-autofocus="true" maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder={objectCopy(locale, objectKind === 'item' ? 'labelHintItem' : 'labelHintPerson')} required value={label} /></label>
        {properties.map((property) => {
          const fieldLabel = <span>{property.name}{property.rules.required && <b aria-hidden="true"> *</b>}</span>;
          if (property.type === 'checkbox') return <label className="field" key={property.id}>{fieldLabel}<select onChange={(event) => setValue(property.id, event.target.value === '' ? '' : event.target.value === 'true')} required={property.rules.required} value={values[property.id] === undefined ? '' : String(values[property.id])}><option value="">—</option><option value="true">{locale === 'ar' ? 'نعم' : 'Yes'}</option><option value="false">{locale === 'ar' ? 'لا' : 'No'}</option></select></label>;
          if (property.type === 'select' || property.type === 'status') return <label className="field" key={property.id}>{fieldLabel}<select onChange={(event) => setValue(property.id, event.target.value)} required={property.rules.required} value={String(values[property.id] ?? '')}><option value="">—</option>{property.rules.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select></label>;
          if (property.type === 'relation') {
            const choices = relatedRecords.filter(({ objectKind: targetKind }) => targetKind === property.rules.relationTarget);
            return <label className="field" key={property.id}>{fieldLabel}<select onChange={(event) => setValue(property.id, event.target.value)} required={property.rules.required} value={String(values[property.id] ?? '')}><option value="">—</option>{choices.map((record) => <option key={record.id} value={record.id}>{record.label}</option>)}</select></label>;
          }
          const inputType = property.type === 'date' ? 'date' : property.type === 'number' || property.type === 'money' ? 'number' : 'text';
          return <label className="field" key={property.id}>{fieldLabel}<input inputMode={property.rules.digitsOnly ? 'numeric' : undefined} max={property.rules.maximum} maxLength={property.rules.maximumLength} min={property.rules.minimum} minLength={property.rules.minimumLength} onChange={(event) => setValue(property.id, event.target.value)} required={property.rules.required} step={property.type === 'money' ? '0.01' : property.type === 'number' ? 'any' : undefined} type={inputType} value={String(values[property.id] ?? '')} /></label>;
        })}
        <footer className="form-footer"><Button onClick={onClose}>{objectCopy(locale, 'cancel')}</Button><Button disabled={saving} type="submit" variant="primary">{objectCopy(locale, 'save')}</Button></footer>
      </form>
    </FocusedOverlay>
  );
}

function AuditDialog({ entries, locale, onClose }: Readonly<{ entries: readonly AuditEntry[]; locale: Locale; onClose: () => void }>) {
  const actionLabel = { archived: 'auditArchived', created: 'auditCreated', updated: 'auditUpdated' } as const;
  return (
    <FocusedOverlay className="audit-dialog" labelId="audit-dialog-title" onClose={onClose}>
      <DialogHeader locale={locale} onClose={onClose} title={objectCopy(locale, 'auditTitle')} titleId="audit-dialog-title" />
      <div className="audit-list">
        {entries.length === 0 && <p>{objectCopy(locale, 'auditEmpty')}</p>}
        {entries.map((entry) => <div className="audit-entry" key={entry.id}><Clock3 aria-hidden="true" size={16} /><strong>{objectCopy(locale, actionLabel[entry.action])}</strong><time dateTime={entry.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))}</time></div>)}
      </div>
    </FocusedOverlay>
  );
}

export function ObjectWorkspace({ createRequest, locale, objectKind }: ObjectWorkspaceProps) {
  const [properties, setProperties] = useState<readonly PropertyDefinition[]>([]);
  const [records, setRecords] = useState<readonly ConfigurableRecord[]>([]);
  const [relatedRecords, setRelatedRecords] = useState<readonly ConfigurableRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [propertyEditor, setPropertyEditor] = useState<PropertyDefinition | 'new'>();
  const [recordEditor, setRecordEditor] = useState<ConfigurableRecord | 'new'>();
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget>();
  const [auditEntries, setAuditEntries] = useState<readonly AuditEntry[]>();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [nextProperties, nextRecords, items, people] = await Promise.all([
        window.maxApi.objects.listProperties(objectKind),
        window.maxApi.objects.listRecords(objectKind),
        window.maxApi.objects.listRecords('item'),
        window.maxApi.objects.listRecords('person'),
      ]);
      setProperties(nextProperties);
      setRecords(nextRecords);
      setRelatedRecords([...items, ...people]);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [objectKind]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (createRequest > 0) setRecordEditor('new'); }, [createRequest]);

  async function saveProperty(draft: PropertyDraft): Promise<string | undefined> {
    const result = propertyEditor === 'new'
      ? await window.maxApi.objects.createProperty(draft)
      : await window.maxApi.objects.updateProperty(propertyEditor?.id ?? '', draft);
    const message = mutationMessage(locale, result);
    if (!message) { setPropertyEditor(undefined); await load(); }
    return message;
  }

  async function saveRecord(draft: ConfigurableRecordDraft): Promise<string | undefined> {
    const result = recordEditor === 'new'
      ? await window.maxApi.objects.createRecord(draft)
      : await window.maxApi.objects.updateRecord(recordEditor?.id ?? '', draft);
    const message = mutationMessage(locale, result);
    if (!message) { setRecordEditor(undefined); await load(); }
    return message;
  }

  async function archive() {
    if (!archiveTarget) return;
    const result = archiveTarget.kind === 'property'
      ? await window.maxApi.objects.archiveProperty(archiveTarget.id)
      : await window.maxApi.objects.archiveRecord(archiveTarget.id);
    if (result.ok) { setArchiveTarget(undefined); await load(); }
    else setLoadError(true);
  }

  async function showAudit(id: string) {
    try { setAuditEntries(await window.maxApi.objects.listAudit(id)); }
    catch { setLoadError(true); }
  }

  return (
    <section className="object-workspace">
      <div className="object-toolbar">
        <div><strong>{records.length} {objectCopy(locale, 'records')}</strong><span>{properties.length} {objectCopy(locale, 'properties').toLocaleLowerCase(locale)}</span></div>
        <Button icon={<Plus aria-hidden="true" size={17} />} onClick={() => setRecordEditor('new')} variant="primary">{objectCopy(locale, objectKind === 'item' ? 'createItem' : 'createPerson')}</Button>
      </div>
      {loadError && <p className="form-error" role="alert">{objectCopy(locale, 'unknownError')}</p>}
      <div className="object-layout">
        <div className="record-panel" aria-busy={loading}>
          {!loading && records.length === 0 && (
            <div className="object-empty"><div className="empty-state__icon"><Plus aria-hidden="true" size={25} /></div><h2>{objectCopy(locale, objectKind === 'item' ? 'emptyItems' : 'emptyPeople')}</h2><p>{objectCopy(locale, 'emptyBody')}</p><Button onClick={() => setRecordEditor('new')} variant="primary">{objectCopy(locale, objectKind === 'item' ? 'createItem' : 'createPerson')}</Button></div>
          )}
          <div className="record-grid">
            {records.map((record) => (
              <article className="record-card" key={record.id}>
                <div className="record-card__head"><div><span>{objectKindLabel(locale, objectKind)}</span><h2>{record.label}</h2></div><div className="record-card__actions"><button aria-label={`${objectCopy(locale, 'auditTitle')}: ${record.label}`} className="icon-button" onClick={() => void showAudit(record.id)} type="button"><Clock3 aria-hidden="true" size={16} /></button><button aria-label={`${objectCopy(locale, 'edit')}: ${record.label}`} className="icon-button" onClick={() => setRecordEditor(record)} type="button"><Edit3 aria-hidden="true" size={16} /></button><button aria-label={`${objectCopy(locale, 'archive')}: ${record.label}`} className="icon-button icon-button--danger" onClick={() => setArchiveTarget({ id: record.id, kind: 'record', name: record.label })} type="button"><Archive aria-hidden="true" size={16} /></button></div></div>
                <dl>{properties.map((property) => record.values[property.id] === undefined ? null : <div key={property.id}><dt>{property.name}</dt><dd>{formatValue(record.values[property.id], property, relatedRecords, locale)}</dd></div>)}</dl>
              </article>
            ))}
          </div>
        </div>
        <aside className="schema-panel">
          <div className="schema-panel__head"><div><span className="eyebrow">{objectCopy(locale, 'schema')}</span><h2>{objectCopy(locale, 'properties')}</h2></div><button aria-label={objectCopy(locale, 'addProperty')} className="icon-button" onClick={() => setPropertyEditor('new')} type="button"><Plus aria-hidden="true" size={18} /></button></div>
          <p className="schema-panel__summary">{objectCopy(locale, 'schemaSummary')}</p>
          {properties.length === 0 && <div className="schema-empty"><SlidersHorizontal aria-hidden="true" size={21} /><strong>{objectCopy(locale, 'noProperties')}</strong><p>{objectCopy(locale, 'noPropertiesBody')}</p><Button onClick={() => setPropertyEditor('new')}>{objectCopy(locale, 'addProperty')}</Button></div>}
          <div className="property-list">{properties.map((property) => <div className="property-row" key={property.id}><div><strong>{property.name}</strong><span>{propertyTypeLabel(locale, property.type)} · {property.rules.required ? objectCopy(locale, 'required') : objectCopy(locale, 'optional')}</span></div><button aria-label={`${objectCopy(locale, 'edit')}: ${property.name}`} className="icon-button" onClick={() => setPropertyEditor(property)} type="button"><Edit3 aria-hidden="true" size={15} /></button><button aria-label={`${objectCopy(locale, 'archive')}: ${property.name}`} className="icon-button icon-button--danger" onClick={() => setArchiveTarget({ id: property.id, kind: 'property', name: property.name })} type="button"><Archive aria-hidden="true" size={15} /></button></div>)}</div>
        </aside>
      </div>

      {propertyEditor && <PropertyEditor initial={propertyEditor === 'new' ? undefined : propertyEditor} locale={locale} objectKind={objectKind} onClose={() => setPropertyEditor(undefined)} onSave={saveProperty} />}
      {recordEditor && <RecordEditor initial={recordEditor === 'new' ? undefined : recordEditor} locale={locale} objectKind={objectKind} onClose={() => setRecordEditor(undefined)} onSave={saveRecord} properties={properties} relatedRecords={relatedRecords} />}
      {archiveTarget && <FocusedOverlay className="confirm-dialog" labelId="archive-dialog-title" onClose={() => setArchiveTarget(undefined)}><div className="scope-dialog__icon"><Archive aria-hidden="true" size={22} /></div><h2 id="archive-dialog-title">{objectCopy(locale, archiveTarget.kind === 'property' ? 'archiveProperty' : 'archiveRecord')}</h2><strong>{archiveTarget.name}</strong><p>{objectCopy(locale, 'archiveBody')}</p><div className="confirm-dialog__actions"><Button onClick={() => setArchiveTarget(undefined)}>{objectCopy(locale, 'cancel')}</Button><Button onClick={() => void archive()} variant="consequential">{objectCopy(locale, 'archive')}</Button></div></FocusedOverlay>}
      {auditEntries && <AuditDialog entries={auditEntries} locale={locale} onClose={() => setAuditEntries(undefined)} />}
    </section>
  );
}
