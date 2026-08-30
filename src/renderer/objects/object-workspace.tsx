import {
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  Edit3,
  FileText,
  GripVertical,
  Package,
  Plus,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { NotionBlockEditor, type NotionBlock } from '../ui/notion-block-editor';

import type { PersonBalanceSummary } from '../../shared/person-debt-contract';
import type { SavedView, ViewFilterRule, ViewSortRule } from '../../shared/views-search-contract';
import { PersonStatementDialog } from '../people/person-statement-dialog';
import { peopleDebtCopy } from '../people/people-debt-i18n';
import { ViewBar } from '../views/view-bar';
import { viewsCopy } from '../views/views-i18n';
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
import type { TemplateDefinition, TemplateDraft } from '../../shared/template-contract';
import type { Locale } from '../app/i18n';
import { TemplateEditor } from '../templates/template-editor';
import { templateCopy } from '../templates/template-i18n';
import { TemplatePicker } from '../templates/template-picker';
import { Button } from '../ui/button';
import { FocusedOverlay } from '../ui/focused-overlay';
import { objectCopy, objectError, objectKindLabel, propertyTypeLabel } from './object-i18n';

type ObjectWorkspaceProps = Readonly<{
  createRequest: number;
  locale: Locale;
  objectKind: ObjectKind;
  onViewsChanged?: () => void;
  selectedViewId?: string;
}>;

type ArchiveTarget = Readonly<{
  id: string;
  kind: 'property' | 'record' | 'template';
  name: string;
}>;

function mutationMessage<T>(locale: Locale, result: MutationResult<T>): string | undefined {
  return result.ok ? undefined : objectError(locale, result.error.code);
}

const PILL_COLORS = [
  'light-gray', 'gray', 'brown', 'orange', 'yellow',
  'green', 'blue', 'purple', 'pink', 'red',
] as const;

function pillColor(index: number): string {
  // Deterministic color from choice index within the property's choice list
  return PILL_COLORS[index % PILL_COLORS.length] ?? 'default';
}

/** Renders a rich cell value (pills, checkboxes, etc.) for Notion-style display. */
function renderCellValue(
  value: PropertyValue | undefined,
  property: PropertyDefinition,
  relatedRecords: readonly ConfigurableRecord[],
): ReactNode {
  if (value === undefined) {
    return <span className="database-cell-empty">—</span>;
  }

  // Select / Status → colored pill
  if (property.type === 'select' || property.type === 'status') {
    const choiceIndex = property.rules.choices.indexOf(String(value));
    const color = choiceIndex >= 0 ? pillColor(choiceIndex) : 'default';
    return (
      <span className={`database-cell-pill database-cell-pill--${color}`}>
        {String(value)}
      </span>
    );
  }

  // Checkbox → visual check box
  if (property.type === 'checkbox') {
    return (
      <span className="database-cell-check" data-checked={Boolean(value)}>
        {value ? <Check aria-hidden="true" size={11} strokeWidth={3} /> : null}
      </span>
    );
  }

  // Relation → linked record name
  if (property.type === 'relation') {
    const related = relatedRecords.find(({ id }) => id === value);
    return related?.label ?? String(value);
  }

  // Date → formatted
  if (property.type === 'date' && typeof value === 'string' && value) {
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
    } catch {
      return String(value);
    }
  }

  // Money → formatted with 2 decimals
  if (property.type === 'money' && typeof value === 'number') {
    return value.toFixed(2);
  }

  return String(value);
}

function recordFieldValue(record: ConfigurableRecord, field: string): PropertyValue | undefined {
  return field === 'label' ? record.label : record.values[field];
}

function searchableString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

function matchesFilter(record: ConfigurableRecord, rule: ViewFilterRule): boolean {
  const raw = recordFieldValue(record, rule.field);
  const current = searchableString(raw);
  const expected = searchableString(rule.value);
  if (rule.operator === 'is-empty') return current.length === 0;
  if (rule.operator === 'is-not-empty') return current.length > 0;
  if (rule.operator === 'contains') return current.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
  if (rule.operator === 'equals') return current.toLocaleLowerCase() === expected.toLocaleLowerCase();
  const currentNumber = Number(raw);
  const expectedNumber = Number(rule.value);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(expectedNumber)) return false;
  return rule.operator === 'greater-than' ? currentNumber > expectedNumber : currentNumber < expectedNumber;
}

function DialogHeader({
  locale,
  onClose,
  title,
  titleId,
}: Readonly<{ locale: Locale; onClose: () => void; title: string; titleId: string }>) {
  return (
    <header className="dialog-header">
      <div>
        <p className="eyebrow">MAX · {objectCopy(locale, 'schema')}</p>
        <h2 id={titleId}>{title}</h2>
      </div>
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
    const numberOrUndefined = (value: string) => (value === '' ? undefined : Number(value));
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
      <DialogHeader
        locale={locale}
        onClose={onClose}
        title={initial ? objectCopy(locale, 'editProperty') : objectCopy(locale, 'addProperty')}
        titleId="property-dialog-title"
      />
      <form className="object-form" onSubmit={(event) => void submit(event)}>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <label className="field">
          <span>{objectCopy(locale, 'propertyName')}</span>
          <input data-autofocus="true" maxLength={80} onChange={(event) => setName(event.target.value)} required value={name} />
        </label>
        <label className="field">
          <span>{objectCopy(locale, 'type')}</span>
          <select onChange={(event) => setType(event.target.value as PropertyDraft['type'])} value={type}>
            {propertyTypes.map((propertyType) => (
              <option key={propertyType} value={propertyType}>
                {propertyTypeLabel(locale, propertyType)}
              </option>
            ))}
          </select>
        </label>
        <div className="rule-grid">
          <label className="check-field">
            <input checked={required} onChange={(event) => setRequired(event.target.checked)} type="checkbox" />
            <span>{objectCopy(locale, 'required')}</span>
          </label>
          <label className="check-field">
            <input checked={unique} onChange={(event) => setUnique(event.target.checked)} type="checkbox" />
            <span>{objectCopy(locale, 'unique')}</span>
          </label>
          {type === 'text' && (
            <label className="check-field">
              <input checked={digitsOnly} onChange={(event) => setDigitsOnly(event.target.checked)} type="checkbox" />
              <span>{objectCopy(locale, 'digitsOnly')}</span>
            </label>
          )}
        </div>
        {(type === 'number' || type === 'money') && (
          <div className="field-pair">
            <label className="field">
              <span>{objectCopy(locale, 'minimum')}</span>
              <input inputMode="decimal" onChange={(event) => setMinimum(event.target.value)} type="number" value={minimum} />
            </label>
            <label className="field">
              <span>{objectCopy(locale, 'maximum')}</span>
              <input inputMode="decimal" onChange={(event) => setMaximum(event.target.value)} type="number" value={maximum} />
            </label>
          </div>
        )}
        {type === 'text' && (
          <div className="field-pair">
            <label className="field">
              <span>{objectCopy(locale, 'minimumLength')}</span>
              <input min="0" onChange={(event) => setMinimumLength(event.target.value)} step="1" type="number" value={minimumLength} />
            </label>
            <label className="field">
              <span>{objectCopy(locale, 'maximumLength')}</span>
              <input min="0" onChange={(event) => setMaximumLength(event.target.value)} step="1" type="number" value={maximumLength} />
            </label>
          </div>
        )}
        {(type === 'select' || type === 'status') && (
          <label className="field">
            <span>{objectCopy(locale, 'choices')}</span>
            <textarea onChange={(event) => setChoices(event.target.value)} placeholder={objectCopy(locale, 'choicesHint')} rows={4} value={choices} />
          </label>
        )}
        {type === 'relation' && (
          <label className="field">
            <span>{objectCopy(locale, 'relationTarget')}</span>
            <select onChange={(event) => setRelationTarget(event.target.value as ObjectKind)} value={relationTarget}>
              <option value="item">{objectKindLabel(locale, 'item')}</option>
              <option value="person">{objectKindLabel(locale, 'person')}</option>
            </select>
          </label>
        )}
        <footer className="form-footer">
          <Button onClick={onClose}>{objectCopy(locale, 'cancel')}</Button>
          <Button disabled={saving} type="submit" variant="primary">
            {objectCopy(locale, 'save')}
          </Button>
        </footer>
      </form>
    </FocusedOverlay>
  );
}

type InputValue = boolean | string;

function RecordEditor({
  appliedTemplate,
  initial,
  locale,
  objectKind,
  onClose,
  onSave,
  properties,
  relatedRecords,
}: Readonly<{
  appliedTemplate?: TemplateDefinition;
  initial?: ConfigurableRecord;
  locale: Locale;
  objectKind: ObjectKind;
  onClose: () => void;
  onSave: (draft: ConfigurableRecordDraft) => Promise<string | undefined>;
  properties: readonly PropertyDefinition[];
  relatedRecords: readonly ConfigurableRecord[];
}>) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [showMoreProgressive, setShowMoreProgressive] = useState(false);

  // Initialize values with initial record or template defaults
  const [values, setValues] = useState<Record<string, InputValue>>(() => {
    if (initial?.values) {
      return Object.fromEntries(
        Object.entries(initial.values).map(([id, value]) => [id, typeof value === 'boolean' ? value : String(value)]),
      );
    }
    if (appliedTemplate?.defaults) {
      return Object.fromEntries(
        Object.entries(appliedTemplate.defaults).map(([id, value]) => [id, typeof value === 'boolean' ? value : String(value)]),
      );
    }
    return {};
  });

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
      else if ((property.type === 'number' || property.type === 'money') && value !== '' && value !== undefined)
        prepared[property.id] = Number(value);
      else if (typeof value === 'string' && value !== '') prepared[property.id] = value;
    }
    setSaving(true);
    const nextError = await onSave({ label, objectKind, values: prepared });
    setSaving(false);
    setError(nextError);
  }

  // Determine ordered properties
  const orderedProperties = (() => {
    if (!appliedTemplate?.fieldOrder || appliedTemplate.fieldOrder.length === 0) {
      return properties;
    }
    const propsById = new Map(properties.map((p) => [p.id, p]));
    const ordered: PropertyDefinition[] = [];
    const seen = new Set<string>();

    for (const id of appliedTemplate.fieldOrder) {
      const prop = propsById.get(id);
      if (prop && !seen.has(prop.id)) {
        ordered.push(prop);
        seen.add(prop.id);
      }
    }
    for (const prop of properties) {
      if (!seen.has(prop.id)) {
        ordered.push(prop);
        seen.add(prop.id);
      }
    }
    return ordered;
  })();

  const progressiveSet = new Set(appliedTemplate?.progressive ?? []);
  const primaryProps = orderedProperties.filter((p) => !progressiveSet.has(p.id));
  const progressiveProps = orderedProperties.filter((p) => progressiveSet.has(p.id));

  return (
    <FocusedOverlay className="object-dialog" labelId="record-dialog-title" onClose={onClose}>
      <DialogHeader locale={locale} onClose={onClose} title={title} titleId="record-dialog-title" />
      <form className="object-form" onSubmit={(event) => void submit(event)}>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <label className="field">
          <span>{objectCopy(locale, 'label')}</span>
          <input
            data-autofocus="true"
            maxLength={120}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={objectCopy(locale, objectKind === 'item' ? 'labelHintItem' : 'labelHintPerson')}
            required
            value={label}
          />
        </label>

        {primaryProps.map((property) => renderField(property))}

        {progressiveProps.length > 0 && (
          <div className="progressive-fields-container">
            <button
              className="progressive-toggle-button"
              onClick={() => setShowMoreProgressive((prev) => !prev)}
              type="button"
            >
              {showMoreProgressive ? <ChevronUp aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}
              <span>{templateCopy(locale, 'showMore')} ({progressiveProps.length})</span>
            </button>

            {showMoreProgressive && progressiveProps.map((property) => renderField(property))}
          </div>
        )}

        <footer className="form-footer">
          <Button onClick={onClose}>{objectCopy(locale, 'cancel')}</Button>
          <Button disabled={saving} type="submit" variant="primary">
            {objectCopy(locale, 'save')}
          </Button>
        </footer>
      </form>
    </FocusedOverlay>
  );

  function renderField(property: PropertyDefinition) {
    const fieldLabel = (
      <span>
        {property.name}
        {property.rules.required && <b aria-hidden="true"> *</b>}
      </span>
    );
    if (property.type === 'checkbox')
      return (
        <label className="field" key={property.id}>
          {fieldLabel}
          <select
            onChange={(event) => setValue(property.id, event.target.value === '' ? '' : event.target.value === 'true')}
            required={property.rules.required}
            value={values[property.id] === undefined ? '' : String(values[property.id])}
          >
            <option value="">—</option>
            <option value="true">{locale === 'ar' ? 'نعم' : 'Yes'}</option>
            <option value="false">{locale === 'ar' ? 'لا' : 'No'}</option>
          </select>
        </label>
      );
    if (property.type === 'select' || property.type === 'status')
      return (
        <label className="field" key={property.id}>
          {fieldLabel}
          <select
            onChange={(event) => setValue(property.id, event.target.value)}
            required={property.rules.required}
            value={String(values[property.id] ?? '')}
          >
            <option value="">—</option>
            {property.rules.choices.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        </label>
      );
    if (property.type === 'relation') {
      const choices = relatedRecords.filter(({ objectKind: targetKind }) => targetKind === property.rules.relationTarget);
      return (
        <label className="field" key={property.id}>
          {fieldLabel}
          <select
            onChange={(event) => setValue(property.id, event.target.value)}
            required={property.rules.required}
            value={String(values[property.id] ?? '')}
          >
            <option value="">—</option>
            {choices.map((record) => (
              <option key={record.id} value={record.id}>
                {record.label}
              </option>
            ))}
          </select>
        </label>
      );
    }
    const inputType =
      property.type === 'date' ? 'date' : property.type === 'number' || property.type === 'money' ? 'number' : 'text';
    return (
      <label className="field" key={property.id}>
        {fieldLabel}
        <input
          inputMode={property.rules.digitsOnly ? 'numeric' : undefined}
          max={property.rules.maximum}
          maxLength={property.rules.maximumLength}
          min={property.rules.minimum}
          minLength={property.rules.minimumLength}
          onChange={(event) => setValue(property.id, event.target.value)}
          required={property.rules.required}
          step={property.type === 'money' ? '0.01' : property.type === 'number' ? 'any' : undefined}
          type={inputType}
          value={String(values[property.id] ?? '')}
        />
      </label>
    );
  }
}

function AuditDialog({ entries, locale, onClose }: Readonly<{ entries: readonly AuditEntry[]; locale: Locale; onClose: () => void }>) {
  const actionLabel = { archived: 'auditArchived', created: 'auditCreated', updated: 'auditUpdated' } as const;
  return (
    <FocusedOverlay className="audit-dialog" labelId="audit-dialog-title" onClose={onClose}>
      <DialogHeader locale={locale} onClose={onClose} title={objectCopy(locale, 'auditTitle')} titleId="audit-dialog-title" />
      <div className="audit-list">
        {entries.length === 0 && <p>{objectCopy(locale, 'auditEmpty')}</p>}
        {entries.map((entry) => (
          <div className="audit-entry" key={entry.id}>
            <Clock3 aria-hidden="true" size={16} />
            <strong>{objectCopy(locale, actionLabel[entry.action])}</strong>
            <time dateTime={entry.createdAt}>
              {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))}
            </time>
          </div>
        ))}
      </div>
    </FocusedOverlay>
  );
}

export function ObjectWorkspace({ createRequest, locale, objectKind, onViewsChanged, selectedViewId }: ObjectWorkspaceProps) {
  const [properties, setProperties] = useState<readonly PropertyDefinition[]>([]);
  const [templates, setTemplates] = useState<readonly TemplateDefinition[]>([]);
  const [records, setRecords] = useState<readonly ConfigurableRecord[]>([]);
  const [relatedRecords, setRelatedRecords] = useState<readonly ConfigurableRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [schemaTab, setSchemaTab] = useState<'properties' | 'templates'>('properties');
  const [schemaPanelOpen, setSchemaPanelOpen] = useState(false);

  const schemaPanelRef = useRef<HTMLElement>(null);
  const propertiesBtnRef = useRef<HTMLButtonElement>(null);
  const templatesBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!schemaPanelOpen) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) return;

      if (schemaPanelRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.('.overlay')) return;
      if (propertiesBtnRef.current?.contains(target) || templatesBtnRef.current?.contains(target)) {
        return;
      }

      setSchemaPanelOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (document.querySelector('.overlay')) return;
        setSchemaPanelOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [schemaPanelOpen]);

  const [propertyEditor, setPropertyEditor] = useState<PropertyDefinition | 'new'>();
  const [templateEditor, setTemplateEditor] = useState<TemplateDefinition | 'new'>();
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<TemplateDefinition>();
  const [recordEditor, setRecordEditor] = useState<ConfigurableRecord | 'new'>();
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget>();
  const [auditEntries, setAuditEntries] = useState<readonly AuditEntry[]>();
  const [personBalances, setPersonBalances] = useState<readonly PersonBalanceSummary[]>([]);
  const [selectedStatementPersonId, setSelectedStatementPersonId] = useState<string>();
  const [activeView, setActiveView] = useState<SavedView>();
  const [filterRules, setFilterRules] = useState<readonly ViewFilterRule[]>([]);
  const [sortRules, setSortRules] = useState<readonly ViewSortRule[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [groupByPropertyId, setGroupByPropertyId] = useState<string | undefined>();
  const [groupByOpen, setGroupByOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [draggedRecordId, setDraggedRecordId] = useState<string | null>(null);
  const [dragOverRecordId, setDragOverRecordId] = useState<string | null>(null);
  const [pageBlocks, setPageBlocks] = useState<readonly NotionBlock[]>(() => {
    try {
      const raw = window.localStorage.getItem(`max:notion_blocks:${objectKind}`);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) return parsed as readonly NotionBlock[];
      }
    } catch {
      // ignore
    }
    return [];
  });

  function handleBlocksChange(nextBlocks: readonly NotionBlock[]) {
    setPageBlocks(nextBlocks);
    try {
      window.localStorage.setItem(`max:notion_blocks:${objectKind}`, JSON.stringify(nextBlocks));
    } catch {
      // ignore
    }
  }

  function toggleGroupCollapse(groupId: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function handleRecordDragStart(id: string) {
    setDraggedRecordId(id);
  }

  function handleRecordDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (dragOverRecordId !== id) {
      setDragOverRecordId(id);
    }
  }

  function handleRecordDrop(targetId: string) {
    if (!draggedRecordId || draggedRecordId === targetId) {
      setDraggedRecordId(null);
      setDragOverRecordId(null);
      return;
    }
    const fromIdx = records.findIndex((r) => r.id === draggedRecordId);
    const toIdx = records.findIndex((r) => r.id === targetId);
    if (fromIdx !== -1 && toIdx !== -1) {
      const next = [...records];
      const [moved] = next.splice(fromIdx, 1);
      if (moved) {
        next.splice(toIdx, 0, moved);
        setRecords(next);
      }
    }
    setDraggedRecordId(null);
    setDragOverRecordId(null);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [nextProperties, nextTemplates, nextRecords, items, people, pBalances] = await Promise.all([
        window.maxApi.objects.listProperties(objectKind),
        window.maxApi.templates.list(objectKind),
        window.maxApi.objects.listRecords(objectKind),
        window.maxApi.objects.listRecords('item'),
        window.maxApi.objects.listRecords('person'),
        objectKind === 'person' ? window.maxApi.people.getBalances() : Promise.resolve([]),
      ]);
      setProperties(nextProperties);
      setTemplates(nextTemplates);
      setRecords(nextRecords);
      setRelatedRecords([...items, ...people]);
      setPersonBalances(pBalances);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [objectKind]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedViewId) return;
    void window.maxApi.views.list(objectKind).then((views) => {
      const selected = views.find((view) => view.id === selectedViewId);
      setActiveView(selected);
      setFilterRules(selected?.filterRules ?? []);
      setSortRules(selected?.sortRules ?? []);
      setGroupByPropertyId(selected?.groupByPropertyId);
    });
  }, [objectKind, selectedViewId]);

  const visibleRecords = useMemo(() => {
    const filtered = records.filter((record) => filterRules.every((rule) => matchesFilter(record, rule)));
    const rule = sortRules[0];
    if (!rule) return filtered;
    return [...filtered].sort((left, right) => {
      const leftValue = recordFieldValue(left, rule.field);
      const rightValue = recordFieldValue(right, rule.field);
      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue ?? '').localeCompare(String(rightValue ?? ''), locale, { numeric: true });
      return rule.direction === 'asc' ? comparison : -comparison;
    });
  }, [filterRules, locale, records, sortRules]);

  function applyView(view?: SavedView) {
    setActiveView(view);
    setFilterRules(view?.filterRules ?? []);
    setSortRules(view?.sortRules ?? []);
    setGroupByPropertyId(view?.groupByPropertyId);
  }

  function addFilterRule() {
    setActiveView(undefined);
    const firstField = properties[0]?.id ?? 'label';
    setFilterRules((prev) => [...prev, { field: firstField, operator: 'contains', value: '' }]);
    setFilterOpen(true);
  }

  function updateFilterRule(index: number, updated: Partial<ViewFilterRule>) {
    setActiveView(undefined);
    setFilterRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...updated } : r)));
  }

  function removeFilterRule(index: number) {
    setActiveView(undefined);
    setFilterRules((prev) => prev.filter((_, i) => i !== index));
  }

  function addSortRule() {
    setActiveView(undefined);
    const firstField = properties[0]?.id ?? 'label';
    setSortRules((prev) => (prev.length === 0 ? [{ direction: 'asc', field: firstField }] : prev));
    setSortOpen(true);
  }

  function updateSortRule(index: number, updated: Partial<ViewSortRule>) {
    setActiveView(undefined);
    setSortRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...updated } : r)));
  }

  function removeSortRule(index: number) {
    setActiveView(undefined);
    setSortRules((prev) => prev.filter((_, i) => i !== index));
  }

  const startRecordCreation = useCallback(() => {
    if (templates.length > 0) {
      setTemplatePickerOpen(true);
    } else {
      setActiveTemplate(undefined);
      setRecordEditor('new');
    }
  }, [templates.length]);

  const lastHandledCreateRef = useRef(createRequest);
  useEffect(() => {
    if (createRequest > lastHandledCreateRef.current) {
      lastHandledCreateRef.current = createRequest;
      startRecordCreation();
    }
  }, [createRequest, startRecordCreation]);

  function handleSelectTemplate(template?: TemplateDefinition) {
    setTemplatePickerOpen(false);
    setActiveTemplate(template);
    setRecordEditor('new');
  }

  async function saveProperty(draft: PropertyDraft): Promise<string | undefined> {
    const result =
      propertyEditor === 'new'
        ? await window.maxApi.objects.createProperty(draft)
        : await window.maxApi.objects.updateProperty(propertyEditor?.id ?? '', draft);
    const message = mutationMessage(locale, result);
    if (!message) {
      setPropertyEditor(undefined);
      await load();
    }
    return message;
  }

  async function saveTemplate(draft: TemplateDraft): Promise<string | undefined> {
    const result =
      templateEditor === 'new'
        ? await window.maxApi.templates.create(draft)
        : await window.maxApi.templates.update(templateEditor?.id ?? '', draft);
    const message = mutationMessage(locale, result);
    if (!message) {
      setTemplateEditor(undefined);
      await load();
    }
    return message;
  }

  async function saveRecord(draft: ConfigurableRecordDraft): Promise<string | undefined> {
    const result =
      recordEditor === 'new'
        ? await window.maxApi.objects.createRecord(draft)
        : await window.maxApi.objects.updateRecord(recordEditor?.id ?? '', draft);
    const message = mutationMessage(locale, result);
    if (!message) {
      setRecordEditor(undefined);
      await load();
    }
    return message;
  }

  async function archive() {
    if (!archiveTarget) return;
    const result =
      archiveTarget.kind === 'property'
        ? await window.maxApi.objects.archiveProperty(archiveTarget.id)
        : archiveTarget.kind === 'template'
          ? await window.maxApi.templates.archive(archiveTarget.id)
          : await window.maxApi.objects.archiveRecord(archiveTarget.id);
    if (result.ok) {
      setArchiveTarget(undefined);
      await load();
    } else {
      setLoadError(true);
    }
  }

  async function showAudit(id: string) {
    try {
      setAuditEntries(await window.maxApi.objects.listAudit(id));
    } catch {
      setLoadError(true);
    }
  }

  return (
    <section className="object-workspace">
      <div className="object-toolbar">
        <div>
          <strong>
            {visibleRecords.length} {objectCopy(locale, 'records')}
          </strong>
          <span>
            <button
              className="toolbar-text-link"
              onClick={() => {
                setSchemaTab('properties');
                setSchemaPanelOpen(true);
              }}
              type="button"
            >
              {properties.length} {objectCopy(locale, 'properties').toLocaleLowerCase(locale)}
            </button>
            {' · '}
            <button
              className="toolbar-text-link"
              onClick={() => {
                setSchemaTab('templates');
                setSchemaPanelOpen(true);
              }}
              type="button"
            >
              {templates.length} {templateCopy(locale, 'templates').toLocaleLowerCase(locale)}
            </button>
          </span>
        </div>
        <div className="object-toolbar__actions">
          <Button
            ref={propertiesBtnRef}
            icon={<SlidersHorizontal aria-hidden="true" size={16} />}
            onClick={() => {
              if (schemaPanelOpen && schemaTab === 'properties') {
                setSchemaPanelOpen(false);
              } else {
                setSchemaTab('properties');
                setSchemaPanelOpen(true);
              }
            }}
            variant="ghost"
          >
            {objectCopy(locale, 'properties')}
          </Button>
          <Button
            ref={templatesBtnRef}
            icon={<FileText aria-hidden="true" size={16} />}
            onClick={() => {
              if (schemaPanelOpen && schemaTab === 'templates') {
                setSchemaPanelOpen(false);
              } else {
                setSchemaTab('templates');
                setSchemaPanelOpen(true);
              }
            }}
            variant="ghost"
          >
            {templateCopy(locale, 'templates')}
          </Button>
          <Button
            icon={<Plus aria-hidden="true" size={17} />}
            onClick={startRecordCreation}
            variant="primary"
          >
            {objectCopy(locale, objectKind === 'item' ? 'createItem' : 'createPerson')}
          </Button>
        </div>
      </div>

      {loadError && (
        <p className="form-error" role="alert">
          {objectCopy(locale, 'unknownError')}
        </p>
      )}

      <div className="object-layout">
        <div className="record-panel" aria-busy={loading}>
          <ViewBar
            activeFilterRules={filterRules}
            activeGroupBy={groupByPropertyId}
            activeSortRules={sortRules}
            filterOpen={filterOpen}
            groupByOpen={groupByOpen}
            locale={locale}
            onApplyView={applyView}
            onCreateRecord={startRecordCreation}
            onOpenProperties={() => {
              setSchemaTab('properties');
              setSchemaPanelOpen(true);
            }}
            onToggleFilter={() => setFilterOpen((o) => !o)}
            onToggleGroupBy={() => setGroupByOpen((o) => !o)}
            onToggleSort={() => setSortOpen((o) => !o)}
            onViewsChanged={onViewsChanged}
            selectedViewId={activeView?.id}
            sortOpen={sortOpen}
            targetKind={objectKind}
          />

          {groupByOpen && (
            <div className="notion-group-ribbon">
              <span className="notion-filter-pill__prefix">{viewsCopy(locale, 'groupBy')}</span>
              <select
                aria-label={viewsCopy(locale, 'groupBy')}
                className="notion-filter-select"
                onChange={(e) => {
                  setActiveView(undefined);
                  setGroupByPropertyId(e.target.value || undefined);
                }}
                value={groupByPropertyId ?? ''}
              >
                <option value="">{locale === 'ar' ? 'بدون تجميع (جدول واحد)' : 'None (single table)'}</option>
                {templates.length > 0 && (
                  <option value="__template__">
                    {locale === 'ar' ? 'حسب القالب / النوع' : 'By Template / Type'}
                  </option>
                )}
                {properties
                  .filter((p) => p.type === 'select' || p.type === 'status')
                  .map((prop) => (
                    <option key={prop.id} value={prop.id}>
                      {prop.name}
                    </option>
                  ))}
              </select>
              {groupByPropertyId && (
                <button
                  className="notion-filter-clear-btn"
                  onClick={() => {
                    setActiveView(undefined);
                    setGroupByPropertyId(undefined);
                  }}
                  type="button"
                >
                  {locale === 'ar' ? 'إلغاء التجميع' : 'Clear grouping'}
                </button>
              )}
            </div>
          )}

          {filterOpen && (
            <div className="notion-filter-ribbon">
              <div className="notion-filter-ribbon__rows">
                {filterRules.map((rule, index) => (
                  <div key={index} className="notion-filter-pill">
                    <span className="notion-filter-pill__prefix">
                      {index === 0 ? viewsCopy(locale, 'where') : (locale === 'ar' ? 'و' : 'And')}
                    </span>
                    <select
                      aria-label={viewsCopy(locale, 'filterBy')}
                      className="notion-filter-select"
                      onChange={(e) => updateFilterRule(index, { field: e.target.value })}
                      value={rule.field}
                    >
                      <option value="label">{objectKindLabel(locale, objectKind)}</option>
                      {properties.map((prop) => (
                        <option key={prop.id} value={prop.id}>{prop.name}</option>
                      ))}
                    </select>
                    <select
                      aria-label={viewsCopy(locale, 'filterBy')}
                      className="notion-filter-select"
                      onChange={(e) => updateFilterRule(index, { operator: e.target.value as ViewFilterRule['operator'] })}
                      value={rule.operator}
                    >
                      <option value="contains">{viewsCopy(locale, 'contains')}</option>
                      <option value="equals">{viewsCopy(locale, 'equals')}</option>
                      <option value="is-empty">{viewsCopy(locale, 'isEmpty')}</option>
                      <option value="is-not-empty">{viewsCopy(locale, 'isNotEmpty')}</option>
                      <option value="greater-than">{viewsCopy(locale, 'greaterThan')}</option>
                      <option value="less-than">{viewsCopy(locale, 'lessThan')}</option>
                    </select>
                    {!['is-empty', 'is-not-empty'].includes(rule.operator) && (
                      <input
                        aria-label={viewsCopy(locale, 'value')}
                        className="notion-filter-input"
                        onChange={(e) => updateFilterRule(index, { value: e.target.value })}
                        placeholder={viewsCopy(locale, 'value')}
                        value={searchableString(rule.value)}
                      />
                    )}
                    <button
                      aria-label="Remove filter rule"
                      className="notion-filter-remove"
                      onClick={() => removeFilterRule(index)}
                      type="button"
                    >
                      <X aria-hidden="true" size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="notion-filter-ribbon__actions">
                <button
                  className="notion-filter-add-btn"
                  onClick={addFilterRule}
                  type="button"
                >
                  <Plus aria-hidden="true" size={13} />
                  <span>{viewsCopy(locale, 'addFilter')}</span>
                </button>
                {filterRules.length > 0 && (
                  <button
                    className="notion-filter-clear-btn"
                    onClick={() => {
                      setActiveView(undefined);
                      setFilterRules([]);
                    }}
                    type="button"
                  >
                    {viewsCopy(locale, 'clearFilters')}
                  </button>
                )}
              </div>
            </div>
          )}

          {sortOpen && (
            <div className="notion-sort-ribbon">
              <div className="notion-sort-ribbon__rows">
                {sortRules.map((rule, index) => (
                  <div key={index} className="notion-sort-pill">
                    <span className="notion-filter-pill__prefix">{viewsCopy(locale, 'sortBy')}</span>
                    <select
                      aria-label={viewsCopy(locale, 'sortBy')}
                      className="notion-filter-select"
                      onChange={(e) => updateSortRule(index, { field: e.target.value })}
                      value={rule.field}
                    >
                      <option value="label">{objectKindLabel(locale, objectKind)}</option>
                      {properties.map((prop) => (
                        <option key={prop.id} value={prop.id}>{prop.name}</option>
                      ))}
                    </select>
                    <select
                      aria-label={viewsCopy(locale, 'sortBy')}
                      className="notion-filter-select"
                      onChange={(e) => updateSortRule(index, { direction: e.target.value as ViewSortRule['direction'] })}
                      value={rule.direction}
                    >
                      <option value="asc">{viewsCopy(locale, 'ascending')}</option>
                      <option value="desc">{viewsCopy(locale, 'descending')}</option>
                    </select>
                    <button
                      aria-label="Remove sort rule"
                      className="notion-filter-remove"
                      onClick={() => removeSortRule(index)}
                      type="button"
                    >
                      <X aria-hidden="true" size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="notion-sort-ribbon__actions">
                {sortRules.length === 0 && (
                  <button
                    className="notion-filter-add-btn"
                    onClick={addSortRule}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={13} />
                    <span>{viewsCopy(locale, 'addSort')}</span>
                  </button>
                )}
                {sortRules.length > 0 && (
                  <button
                    className="notion-filter-clear-btn"
                    onClick={() => {
                      setActiveView(undefined);
                      setSortRules([]);
                    }}
                    type="button"
                  >
                    {viewsCopy(locale, 'clearSort')}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Notion Markdown Notes & Blocks on page */}
          <NotionBlockEditor
            blocks={pageBlocks}
            locale={locale}
            onChange={handleBlocksChange}
            placeholder={
              locale === 'ar'
                ? 'اكتب ملاحظات أو عناوين في هذه الصفحة...'
                : 'Write notes, headings, or markdown on this page...'
            }
          />

          {!loading && records.length === 0 && (
            <div className="object-empty">
              <div className="empty-state__icon">
                <Plus aria-hidden="true" size={25} />
              </div>
              <h2>{objectCopy(locale, objectKind === 'item' ? 'emptyItems' : 'emptyPeople')}</h2>
              <p>{objectCopy(locale, 'emptyBody')}</p>
              <Button onClick={startRecordCreation} variant="primary">
                {objectCopy(locale, objectKind === 'item' ? 'createItem' : 'createPerson')}
              </Button>
            </div>
          )}
          {records.length > 0 && visibleRecords.length === 0 && (
            <div className="database-no-matches">{viewsCopy(locale, 'noMatches')}</div>
          )}
          {records.length > 0 && (
            <div className="database-stacked-groups">
              {(() => {
                // Compute groups
                const groups: Array<{
                  id: string;
                  label: string;
                  records: readonly ConfigurableRecord[];
                  template?: TemplateDefinition;
                }> = [];

                if (groupByPropertyId === '__template__') {
                  const assigned = new Set<string>();
                  for (const t of templates) {
                    const matching = visibleRecords.filter((rec) => {
                      const keys = Object.keys(t.defaults);
                      if (keys.length > 0) {
                        return keys.every((k) => rec.values[k] === t.defaults[k]);
                      }
                      return t.fieldOrder.some((k) => rec.values[k] !== undefined);
                    });
                    matching.forEach((r) => assigned.add(r.id));
                    groups.push({ id: t.id, label: t.name, records: matching, template: t });
                  }
                  const unassigned = visibleRecords.filter((r) => !assigned.has(r.id));
                  if (unassigned.length > 0 || groups.length === 0) {
                    groups.push({
                      id: 'unassigned',
                      label: locale === 'ar' ? 'أصناف عامة / بدون قالب' : 'General / Other',
                      records: unassigned,
                    });
                  }
                } else if (groupByPropertyId) {
                  const prop = properties.find((p) => p.id === groupByPropertyId);
                  if (prop) {
                    const assigned = new Set<string>();
                    for (const choice of prop.rules.choices) {
                      const matching = visibleRecords.filter((r) => String(r.values[prop.id] ?? '') === choice);
                      matching.forEach((r) => assigned.add(r.id));
                      groups.push({ id: choice, label: choice, records: matching });
                    }
                    const unassigned = visibleRecords.filter((r) => !assigned.has(r.id));
                    if (unassigned.length > 0) {
                      groups.push({
                        id: 'none',
                        label: locale === 'ar' ? 'بدون قيمة' : 'No value',
                        records: unassigned,
                      });
                    }
                  }
                }

                if (groups.length === 0) {
                  groups.push({
                    id: 'all',
                    label: objectKindLabel(locale, objectKind),
                    records: visibleRecords,
                  });
                }

                return groups.map((group) => {
                  const isCollapsed = collapsedGroups.has(group.id);
                  const isGrouped = Boolean(groupByPropertyId);

                  return (
                    <div className="database-group-section" key={group.id}>
                      {/* Group Header / Table Title */}
                      <div className="database-group-header">
                        {isGrouped && (
                          <button
                            aria-expanded={!isCollapsed}
                            className="database-group-header__toggle"
                            onClick={() => toggleGroupCollapse(group.id)}
                            type="button"
                          >
                            {isCollapsed ? (
                              <ChevronRight aria-hidden="true" size={16} />
                            ) : (
                              <ChevronDown aria-hidden="true" size={16} />
                            )}
                            <span>{group.label}</span>
                          </button>
                        )}
                        {!isGrouped && (
                          <div className="database-title-bar">
                            <span className="database-title-bar__icon">
                              {objectKind === 'item' ? (
                                <Package aria-hidden="true" size={18} />
                              ) : (
                                <FileText aria-hidden="true" size={18} />
                              )}
                            </span>
                            <span className="database-title-bar__label">
                              {group.label}
                            </span>
                          </div>
                        )}
                        <span className="database-group-header__count">{group.records.length}</span>
                      </div>

                      {!isCollapsed && (
                        <div className="database-table-wrapper">
                          <table className="database-table">
                            <thead>
                              <tr>
                                <th className="database-table__name-column" scope="col">
                                  <span className="notion-col-type-tag">Aa</span>
                                  <span>{objectKindLabel(locale, objectKind)}</span>
                                </th>
                                {properties.map((property) => {
                                  const typeTag = property.type === 'money'
                                    ? '$'
                                    : property.type === 'date'
                                      ? '📅'
                                      : property.type === 'select' || property.type === 'status'
                                        ? '⊙'
                                        : property.type === 'checkbox'
                                          ? '☑'
                                          : 'Aa';
                                  return (
                                    <th key={property.id} scope="col">
                                      <button
                                        className="database-column-button"
                                        onClick={() => setPropertyEditor(property)}
                                        type="button"
                                      >
                                        <span className="notion-col-type-tag">{typeTag}</span>
                                        <span>{property.name}</span>
                                      </button>
                                    </th>
                                  );
                                })}
                                <th aria-label={locale === 'ar' ? 'الإجراءات' : 'Actions'} className="database-table__actions-column" scope="col" />
                              </tr>
                            </thead>
                            <tbody>
                              {group.records.map((record) => {
                                const balance = objectKind === 'person' ? personBalances.find((b) => b.personId === record.id) : undefined;
                                const isDragging = draggedRecordId === record.id;
                                const isDragOver = dragOverRecordId === record.id;

                                return (
                                  <tr
                                    key={record.id}
                                    data-drag-over={isDragOver}
                                    data-dragging={isDragging}
                                    draggable
                                    onDragEnd={() => {
                                      setDraggedRecordId(null);
                                      setDragOverRecordId(null);
                                    }}
                                    onDragOver={(e) => handleRecordDragOver(e, record.id)}
                                    onDragStart={() => handleRecordDragStart(record.id)}
                                    onDrop={() => handleRecordDrop(record.id)}
                                  >
                                    <th scope="row">
                                      <button
                                        className="database-record-name"
                                        onClick={() => {
                                          setActiveTemplate(undefined);
                                          setRecordEditor(record);
                                        }}
                                        type="button"
                                      >
                                        <span className="database-row-grip" title="Drag to reorder row">
                                          <GripVertical aria-hidden="true" size={12} />
                                        </span>
                                        <span className="database-record-name__page-icon">
                                          <FileText aria-hidden="true" size={14} />
                                        </span>
                                        <span>{record.label}</span>
                                        {balance && balance.receivable > 0 && (
                                          <small className="badge badge--danger">
                                            {peopleDebtCopy(locale, 'owesShop')}: {balance.receivable.toFixed(2)}
                                          </small>
                                        )}
                                        {balance && balance.payable > 0 && (
                                          <small className="badge badge--info">
                                            {peopleDebtCopy(locale, 'shopOwes')}: {balance.payable.toFixed(2)}
                                          </small>
                                        )}
                                      </button>
                                    </th>
                                    {properties.map((property) => (
                                      <td key={property.id}>
                                        {renderCellValue(record.values[property.id], property, relatedRecords)}
                                      </td>
                                    ))}
                                    <td>
                                      <div className="database-row-actions">
                                        {objectKind === 'person' && (
                                          <button
                                            aria-label={`${peopleDebtCopy(locale, 'debtStatement')}: ${record.label}`}
                                            className="icon-button"
                                            onClick={() => setSelectedStatementPersonId(record.id)}
                                            type="button"
                                          >
                                            <FileText aria-hidden="true" size={15} />
                                          </button>
                                        )}
                                        <button
                                          aria-label={`${objectCopy(locale, 'auditTitle')}: ${record.label}`}
                                          className="icon-button"
                                          onClick={() => void showAudit(record.id)}
                                          type="button"
                                        >
                                          <Clock3 aria-hidden="true" size={15} />
                                        </button>
                                        <button
                                          aria-label={`${objectCopy(locale, 'edit')}: ${record.label}`}
                                          className="icon-button"
                                          onClick={() => {
                                            setActiveTemplate(undefined);
                                            setRecordEditor(record);
                                          }}
                                          type="button"
                                        >
                                          <Edit3 aria-hidden="true" size={15} />
                                        </button>
                                        <button
                                          aria-label={`${objectCopy(locale, 'archive')}: ${record.label}`}
                                          className="icon-button icon-button--danger"
                                          onClick={() => setArchiveTarget({ id: record.id, kind: 'record', name: record.label })}
                                          type="button"
                                        >
                                          <Archive aria-hidden="true" size={15} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>

                          {/* Notion-style "+ New" row in this group */}
                          <button
                            className="database-new-row"
                            onClick={() => {
                              if (group.template) {
                                handleSelectTemplate(group.template);
                              } else {
                                startRecordCreation();
                              }
                            }}
                            type="button"
                          >
                            <Plus aria-hidden="true" size={14} />
                            <span>
                              {locale === 'ar'
                                ? `جديد في ${group.label}`
                                : group.template
                                  ? `New ${group.template.name}`
                                  : 'New'}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}

              {/* Overall table footer count */}
              <div className="database-table-footer">
                <span className="database-title-bar__count">{visibleRecords.length}</span>
              </div>
            </div>
          )}
        </div>

        {schemaPanelOpen && (
          <>
            <div
              aria-hidden="true"
              className="schema-backdrop"
              data-testid="schema-backdrop"
              onClick={() => setSchemaPanelOpen(false)}
            />
            <aside aria-label={objectCopy(locale, 'schema')} className="schema-panel" ref={schemaPanelRef}>
              <div className="schema-panel__tabs" role="tablist">
                <button
                  aria-selected={schemaTab === 'properties'}
                  className="schema-tab-button"
                  data-active={schemaTab === 'properties'}
                  onClick={() => setSchemaTab('properties')}
                  role="tab"
                  type="button"
                >
                  <SlidersHorizontal aria-hidden="true" size={15} />
                  <span>{objectCopy(locale, 'properties')}</span>
                </button>
                <button
                  aria-selected={schemaTab === 'templates'}
                  className="schema-tab-button"
                  data-active={schemaTab === 'templates'}
                  onClick={() => setSchemaTab('templates')}
                  role="tab"
                  type="button"
                >
                  <FileText aria-hidden="true" size={15} />
                  <span>{templateCopy(locale, 'templates')}</span>
                </button>
              </div>

              {schemaTab === 'properties' && (
                <>
                  <div className="schema-panel__head">
                    <div>
                      <span className="eyebrow">{objectCopy(locale, 'schema')}</span>
                      <h2>{objectCopy(locale, 'properties')}</h2>
                    </div>
                    <div className="schema-panel__actions">
                      <button
                        aria-label={objectCopy(locale, 'addProperty')}
                        className="icon-button"
                        onClick={() => setPropertyEditor('new')}
                        type="button"
                      >
                        <Plus aria-hidden="true" size={18} />
                      </button>
                      <button
                        aria-label={objectCopy(locale, 'close')}
                        className="icon-button"
                        onClick={() => setSchemaPanelOpen(false)}
                        type="button"
                      >
                        <X aria-hidden="true" size={18} />
                      </button>
                    </div>
                  </div>
                  <p className="schema-panel__summary">{objectCopy(locale, 'schemaSummary')}</p>
                  {properties.length === 0 && (
                    <div className="schema-empty">
                      <SlidersHorizontal aria-hidden="true" size={21} />
                      <strong>{objectCopy(locale, 'noProperties')}</strong>
                      <p>{objectCopy(locale, 'noPropertiesBody')}</p>
                      <Button onClick={() => setPropertyEditor('new')}>{objectCopy(locale, 'addProperty')}</Button>
                    </div>
                  )}
                  <div className="property-list">
                    {properties.map((property) => (
                      <div className="property-row" key={property.id}>
                        <div>
                          <strong>{property.name}</strong>
                          <span>
                            {propertyTypeLabel(locale, property.type)} ·{' '}
                            {property.rules.required ? objectCopy(locale, 'required') : objectCopy(locale, 'optional')}
                          </span>
                        </div>
                        <button
                          aria-label={`${objectCopy(locale, 'edit')}: ${property.name}`}
                          className="icon-button"
                          onClick={() => setPropertyEditor(property)}
                          type="button"
                        >
                          <Edit3 aria-hidden="true" size={15} />
                        </button>
                        <button
                          aria-label={`${objectCopy(locale, 'archive')}: ${property.name}`}
                          className="icon-button icon-button--danger"
                          onClick={() => setArchiveTarget({ id: property.id, kind: 'property', name: property.name })}
                          type="button"
                        >
                          <Archive aria-hidden="true" size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {schemaTab === 'templates' && (
                <>
                  <div className="schema-panel__head">
                    <div>
                      <span className="eyebrow">{objectCopy(locale, 'schema')}</span>
                      <h2>{templateCopy(locale, 'templates')}</h2>
                    </div>
                    <div className="schema-panel__actions">
                      <button
                        aria-label={templateCopy(locale, 'addTemplate')}
                        className="icon-button"
                        onClick={() => setTemplateEditor('new')}
                        type="button"
                      >
                        <Plus aria-hidden="true" size={18} />
                      </button>
                      <button
                        aria-label={objectCopy(locale, 'close')}
                        className="icon-button"
                        onClick={() => setSchemaPanelOpen(false)}
                        type="button"
                      >
                        <X aria-hidden="true" size={18} />
                      </button>
                    </div>
                  </div>
                  <p className="schema-panel__summary">{templateCopy(locale, 'emptyTemplatesBody')}</p>
                  {templates.length === 0 && (
                    <div className="schema-empty">
                      <FileText aria-hidden="true" size={21} />
                      <strong>{templateCopy(locale, 'emptyTemplates')}</strong>
                      <p>{templateCopy(locale, 'emptyTemplatesBody')}</p>
                      <Button onClick={() => setTemplateEditor('new')}>{templateCopy(locale, 'addTemplate')}</Button>
                    </div>
                  )}
                  <div className="property-list">
                    {templates.map((template) => (
                      <div className="property-row" key={template.id}>
                        <div>
                          <strong>{template.name}</strong>
                          <span>
                            {template.fieldOrder.length} {locale === 'ar' ? 'حقول مرتبة' : 'ordered fields'}
                          </span>
                        </div>
                        <button
                          aria-label={`${objectCopy(locale, 'edit')}: ${template.name}`}
                          className="icon-button"
                          onClick={() => setTemplateEditor(template)}
                          type="button"
                        >
                          <Edit3 aria-hidden="true" size={15} />
                        </button>
                        <button
                          aria-label={`${objectCopy(locale, 'archive')}: ${template.name}`}
                          className="icon-button icon-button--danger"
                          onClick={() => setArchiveTarget({ id: template.id, kind: 'template', name: template.name })}
                          type="button"
                        >
                          <Archive aria-hidden="true" size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </aside>
          </>
        )}
      </div>

      {propertyEditor && (
        <PropertyEditor
          initial={propertyEditor === 'new' ? undefined : propertyEditor}
          locale={locale}
          objectKind={objectKind}
          onClose={() => setPropertyEditor(undefined)}
          onSave={saveProperty}
        />
      )}

      {templateEditor && (
        <TemplateEditor
          initial={templateEditor === 'new' ? undefined : templateEditor}
          locale={locale}
          objectKind={objectKind}
          onClose={() => setTemplateEditor(undefined)}
          onSave={saveTemplate}
          properties={properties}
        />
      )}

      {templatePickerOpen && (
        <TemplatePicker
          locale={locale}
          objectKind={objectKind}
          onClose={() => setTemplatePickerOpen(false)}
          onSelect={handleSelectTemplate}
          templates={templates}
        />
      )}

      {recordEditor && (
        <RecordEditor
          appliedTemplate={activeTemplate}
          initial={recordEditor === 'new' ? undefined : recordEditor}
          locale={locale}
          objectKind={objectKind}
          onClose={() => setRecordEditor(undefined)}
          onSave={saveRecord}
          properties={properties}
          relatedRecords={relatedRecords}
        />
      )}

      {archiveTarget && (
        <FocusedOverlay className="confirm-dialog" labelId="archive-dialog-title" onClose={() => setArchiveTarget(undefined)}>
          <div className="scope-dialog__icon">
            <Archive aria-hidden="true" size={22} />
          </div>
          <h2 id="archive-dialog-title">
            {archiveTarget.kind === 'template'
              ? templateCopy(locale, 'archiveTemplate')
              : objectCopy(locale, archiveTarget.kind === 'property' ? 'archiveProperty' : 'archiveRecord')}
          </h2>
          <strong>{archiveTarget.name}</strong>
          <p>
            {archiveTarget.kind === 'template'
              ? templateCopy(locale, 'archiveBody')
              : objectCopy(locale, 'archiveBody')}
          </p>
          <div className="confirm-dialog__actions">
            <Button onClick={() => setArchiveTarget(undefined)}>{objectCopy(locale, 'cancel')}</Button>
            <Button onClick={() => void archive()} variant="consequential">
              {objectCopy(locale, 'archive')}
            </Button>
          </div>
        </FocusedOverlay>
      )}

      {auditEntries && <AuditDialog entries={auditEntries} locale={locale} onClose={() => setAuditEntries(undefined)} />}

      {selectedStatementPersonId && (
        <PersonStatementDialog
          locale={locale}
          onClose={() => {
            setSelectedStatementPersonId(undefined);
            void load();
          }}
          personId={selectedStatementPersonId}
        />
      )}
    </section>
  );
}
