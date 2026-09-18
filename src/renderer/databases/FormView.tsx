import { useEffect, useState } from 'react';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { PropertyType, WorkspaceProperty, WorkspaceRecord, WorkspaceRecordDraft } from '../../shared/property-contract';
import type { FormFieldConfig } from '../../shared/view-contract';

const EMPTY_LAYOUT_CONFIG: Readonly<Record<string, unknown>> = {};

const RENDERABLE_TYPES = new Set<PropertyType>([
  'title', 'text', 'number', 'select', 'multi_select', 'status', 'checkbox', 'date', 'url', 'email', 'phone',
]);

type Props = {
  layoutConfig?: Readonly<Record<string, unknown>>;
  locale: string;
  onCreateRecord: (draft: WorkspaceRecordDraft) => Promise<WorkspaceRecord | null>;
  onLayoutConfigChange?: (layoutConfig: Readonly<Record<string, unknown>>) => void;
  schema: DatabaseSchema;
};

type FieldState = Required<Pick<FormFieldConfig, 'propertyId'>> & Readonly<{
  helpText: string;
  label: string;
  required: boolean;
  visible: boolean;
}>;

function formObject(layoutConfig: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const form = layoutConfig.form;
  return form && typeof form === 'object' && !Array.isArray(form)
    ? form as Readonly<Record<string, unknown>>
    : {};
}

function readConfiguredFields(layoutConfig: Readonly<Record<string, unknown>>): readonly FormFieldConfig[] {
  const fields = formObject(layoutConfig).fields;
  if (!Array.isArray(fields)) return [];
  return fields.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
    const value = candidate as Readonly<Record<string, unknown>>;
    if (typeof value.propertyId !== 'string') return [];
    return [{
      helpText: typeof value.helpText === 'string' ? value.helpText : undefined,
      label: typeof value.label === 'string' ? value.label : undefined,
      propertyId: value.propertyId,
      required: typeof value.required === 'boolean' ? value.required : undefined,
      visible: typeof value.visible === 'boolean' ? value.visible : undefined,
    }];
  });
}

function fieldsForSchema(schema: DatabaseSchema, layoutConfig: Readonly<Record<string, unknown>>): readonly FieldState[] {
  const configured = readConfiguredFields(layoutConfig);
  const properties = new Map(schema.properties.map((property) => [property.id, property]));
  const byId = new Map(configured.map((field) => [field.propertyId, field]));
  const order = [
    ...configured.map((field) => field.propertyId).filter((id) => properties.has(id)),
    ...schema.properties.map((property) => property.id).filter((id) => !byId.has(id)),
  ];
  return order.map((propertyId) => {
    const saved = byId.get(propertyId);
    return {
      helpText: saved?.helpText ?? '',
      label: saved?.label ?? '',
      propertyId,
      required: saved?.required ?? false,
      visible: saved?.visible ?? true,
    };
  });
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function inputValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function FormView({ layoutConfig = EMPTY_LAYOUT_CONFIG, locale, onCreateRecord, onLayoutConfigChange, schema }: Props) {
  const ar = locale === 'ar';
  const [fields, setFields] = useState<readonly FieldState[]>(() => fieldsForSchema(schema, layoutConfig));
  const [title, setTitle] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFields(fieldsForSchema(schema, layoutConfig));
  }, [layoutConfig, schema]);

  const properties = new Map(schema.properties.map((property) => [property.id, property]));

  const persistFields = (next: readonly FieldState[]) => {
    setFields(next);
    onLayoutConfigChange?.({
      ...layoutConfig,
      form: {
        ...formObject(layoutConfig),
        fields: next.map((field) => ({ ...field })),
      },
    });
  };

  const updateField = (propertyId: string, patch: Partial<FieldState>) => {
    persistFields(fields.map((field) => field.propertyId === propertyId ? { ...field, ...patch } : field));
  };

  const moveField = (propertyId: string, direction: -1 | 1) => {
    const index = fields.findIndex((field) => field.propertyId === propertyId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target]!, next[index]!];
    persistFields(next);
  };

  const labelFor = (property: WorkspaceProperty, field: FieldState) => field.label.trim() || property.name;
  const requiredFor = (property: WorkspaceProperty, field: FieldState) => property.type === 'title' || property.required || field.required;

  const submit = async () => {
    if (busy) return;
    setMessage('');
    setFormError('');

    const nextValues: Record<string, unknown> = { ...values };
    const nextErrors: Record<string, string> = {};
    for (const field of fields) {
      const property = properties.get(field.propertyId);
      if (!property || !field.visible) continue;
      const required = requiredFor(property, field);
      if (!RENDERABLE_TYPES.has(property.type)) {
        if (required) nextErrors[property.id] = ar ? 'هذه الخاصية مطلوبة ولا يمكن إدخالها من النموذج.' : 'This required property cannot be entered in a form.';
        continue;
      }
      if (property.type === 'checkbox' && nextValues[property.id] === undefined) nextValues[property.id] = false;
      const value = property.type === 'title' ? title : nextValues[property.id];
      if (required && isEmpty(value)) nextErrors[property.id] = ar ? `${labelFor(property, field)} مطلوب.` : `${labelFor(property, field)} is required.`;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    try {
      const record = await onCreateRecord({ databaseId: schema.database.id, properties: nextValues, title });
      if (!record) {
        setFormError(ar ? 'تعذر حفظ السجل.' : 'Could not save the record.');
        return;
      }
      setTitle('');
      setValues({});
      setErrors({});
      setMessage(ar ? 'تم حفظ السجل' : 'Record saved');
    } catch (error) {
      const text = errorMessage(error);
      const matchingProperty = schema.properties.find((property) => text.toLocaleLowerCase().includes(property.name.toLocaleLowerCase()));
      if (matchingProperty) setErrors((current) => ({ ...current, [matchingProperty.id]: text }));
      else setFormError(text);
    } finally {
      setBusy(false);
    }
  };

  return <section className="database-form-view" dir={ar ? 'rtl' : 'ltr'}>
    <details className="database-form-config">
      <summary>{ar ? 'إعداد النموذج' : 'Configure form'}</summary>
      <div className="database-form-config__fields">
        {fields.map((field, index) => {
          const property = properties.get(field.propertyId);
          if (!property) return null;
          const supported = RENDERABLE_TYPES.has(property.type);
          const required = requiredFor(property, field);
          return <div className="database-form-config__field" key={property.id}>
            <div className="database-form-config__heading">
              <strong>{property.name}</strong>
              <span>{property.type}</span>
              {!supported && <span>{ar ? 'غير مدعوم في النماذج' : 'Not supported in forms'}</span>}
            </div>
            <div className="database-form-config__actions">
              <button type="button" aria-label={ar ? `نقل ${property.name} لأعلى` : `Move ${property.name} up`} disabled={index === 0} onClick={() => moveField(property.id, -1)}>↑</button>
              <button type="button" aria-label={ar ? `نقل ${property.name} لأسفل` : `Move ${property.name} down`} disabled={index === fields.length - 1} onClick={() => moveField(property.id, 1)}>↓</button>
            </div>
            <label><input type="checkbox" checked={field.visible} disabled={required} onChange={(event) => updateField(property.id, { visible: event.target.checked })}/>{ar ? 'إظهار' : 'Show'}</label>
            <label>{ar ? `تسمية ${property.name}` : `Label for ${property.name}`}<input aria-label={ar ? `تسمية ${property.name}` : `Label for ${property.name}`} value={field.label} onChange={(event) => updateField(property.id, { label: event.target.value })}/></label>
            <label>{ar ? `مساعدة ${property.name}` : `Help text for ${property.name}`}<input aria-label={ar ? `مساعدة ${property.name}` : `Help text for ${property.name}`} value={field.helpText} onChange={(event) => updateField(property.id, { helpText: event.target.value })}/></label>
            <label><input type="checkbox" checked={required} disabled={!supported || property.required || property.type === 'title'} onChange={(event) => updateField(property.id, { required: event.target.checked })}/>{ar ? 'مطلوب' : 'Required'}</label>
          </div>;
        })}
      </div>
    </details>

    <form className="database-entry-form" noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <h2>{schema.database.title}</h2>
      {fields.map((field) => {
        const property = properties.get(field.propertyId);
        if (!property || !field.visible) return null;
        const label = labelFor(property, field);
        const required = requiredFor(property, field);
        const error = errors[property.id];
        const helpId = field.helpText ? `form-help-${property.id}` : undefined;
        const errorId = error ? `form-error-${property.id}` : undefined;
        const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;

        if (!RENDERABLE_TYPES.has(property.type)) return <div className="database-entry-form__unsupported" key={property.id}>
          <strong>{label}</strong>
          <span>{ar ? 'هذه الخاصية غير مدعومة في النماذج.' : `${property.name} is not supported in forms.`}</span>
          {error && <span className="database-entry-form__error" id={errorId} role="alert">{error}</span>}
        </div>;

        let control;
        if (property.type === 'select' || property.type === 'status') {
          control = <select aria-label={label} aria-describedby={describedBy} aria-invalid={!!error} aria-required={required} value={inputValue(values[property.id])} onChange={(event) => setValues((current) => ({ ...current, [property.id]: event.target.value || null }))}>
            <option value="">—</option>{property.options?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>;
        } else if (property.type === 'multi_select') {
          control = <select aria-label={label} aria-describedby={describedBy} aria-invalid={!!error} aria-required={required} multiple value={Array.isArray(values[property.id]) ? values[property.id] as string[] : []} onChange={(event) => setValues((current) => ({ ...current, [property.id]: Array.from(event.target.selectedOptions, (option) => option.value) }))}>
            {property.options?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>;
        } else if (property.type === 'checkbox') {
          control = <input aria-label={label} aria-describedby={describedBy} aria-invalid={!!error} aria-required={required} checked={Boolean(values[property.id])} type="checkbox" onChange={(event) => setValues((current) => ({ ...current, [property.id]: event.target.checked }))}/>;
        } else {
          const value = property.type === 'title' ? title : values[property.id];
          const inputType = property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : property.type === 'email' ? 'email' : property.type === 'url' ? 'url' : 'text';
          control = <input aria-label={label} aria-describedby={describedBy} aria-invalid={!!error} aria-required={required} type={inputType} step={property.type === 'number' ? 'any' : undefined} value={inputValue(value)} onChange={(event) => {
            if (property.type === 'title') setTitle(event.target.value);
            else setValues((current) => ({ ...current, [property.id]: property.type === 'number' ? event.target.value === '' ? null : Number(event.target.value) : event.target.value }));
          }}/>;
        }

        return <label className="database-entry-form__field" key={property.id}>
          <span>{label}{required ? ' *' : ''}</span>
          {control}
          {field.helpText && <small id={helpId}>{field.helpText}</small>}
          {error && <span className="database-entry-form__error" id={errorId} role="alert">{error}</span>}
        </label>;
      })}
      {formError && <p className="database-entry-form__error" role="alert">{formError}</p>}
      {message && <p role="status">{message}</p>}
      <button className="btn btn-primary" disabled={busy} type="submit">{ar ? 'حفظ' : 'Submit'}</button>
    </form>
  </section>;
}
