import { Select } from '../ui/select';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import type { ObjectKind, PropertyDefinition, PropertyValue } from '../../shared/object-contract';
import type { TemplateDefinition, TemplateDraft } from '../../shared/template-contract';
import type { Locale } from '../app/i18n';
import { Button } from '../ui/button';
import { FocusedOverlay } from '../ui/focused-overlay';
import { templateCopy } from './template-i18n';

type TemplateEditorProps = Readonly<{
  initial?: TemplateDefinition;
  locale: Locale;
  objectKind: ObjectKind;
  onClose: () => void;
  onSave: (draft: TemplateDraft) => Promise<string | undefined>;
  properties: readonly PropertyDefinition[];
}>;

export function TemplateEditor({
  initial,
  locale,
  objectKind,
  onClose,
  onSave,
  properties,
}: TemplateEditorProps) {
  const [name, setName] = useState(initial?.name ?? '');

  // Initialize ordered property IDs
  const [orderedPropIds, setOrderedPropIds] = useState<string[]>(() => {
    const initialOrder = initial?.fieldOrder ?? [];
    const knownIds = new Set(properties.map((p) => p.id));
    const validInitial = initialOrder.filter((id) => knownIds.has(id));
    const remaining = properties.map((p) => p.id).filter((id) => !validInitial.includes(id));
    return [...validInitial, ...remaining];
  });

  const [defaults, setDefaults] = useState<Record<string, PropertyValue>>(() => ({
    ...(initial?.defaults ?? {}),
  }));

  const [progressiveIds, setProgressiveIds] = useState<Set<string>>(() => new Set(initial?.progressive ?? []));

  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  function moveProperty(index: number, direction: 'down' | 'up') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= orderedPropIds.length) return;

    setOrderedPropIds((current) => {
      const next = [...current];
      const temp = next[index];
      next[index] = next[targetIndex]!;
      next[targetIndex] = temp!;
      return next;
    });
  }

  function toggleProgressive(propertyId: string) {
    setProgressiveIds((current) => {
      const next = new Set(current);
      if (next.has(propertyId)) {
        next.delete(propertyId);
      } else {
        next.add(propertyId);
      }
      return next;
    });
  }

  function setDefault(propertyId: string, value: PropertyValue | undefined) {
    setDefaults((current) => {
      const next = { ...current };
      if (value === undefined || value === '') {
        delete next[propertyId];
      } else {
        next[propertyId] = value;
      }
      return next;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const nextError = await onSave({
      defaults,
      fieldOrder: orderedPropIds,
      name,
      objectKind,
      progressive: Array.from(progressiveIds),
    });
    setSaving(false);
    setError(nextError);
  }

  const propsById = new Map(properties.map((p) => [p.id, p]));

  return (
    <FocusedOverlay className="object-dialog template-dialog" labelId="template-dialog-title" onClose={onClose}>
      <header className="dialog-header">
        <div>
          <p className="eyebrow">MAX · {templateCopy(locale, 'template')}</p>
          <h2 id="template-dialog-title">
            {initial ? templateCopy(locale, 'editTemplate') : templateCopy(locale, 'addTemplate')}
          </h2>
        </div>
        <button aria-label={templateCopy(locale, 'cancel')} className="icon-button" onClick={onClose} type="button">
          <X aria-hidden="true" size={19} />
        </button>
      </header>

      <form className="object-form" onSubmit={(event) => void handleSubmit(event)}>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <label className="field">
          <span>{templateCopy(locale, 'templateName')}</span>
          <input
            data-autofocus="true"
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder={templateCopy(locale, 'templateNameHint')}
            required
            value={name}
          />
        </label>

        <section className="template-field-order-section">
          <div>
            <strong>{templateCopy(locale, 'fieldOrder')}</strong>
            <p className="field-hint">{templateCopy(locale, 'fieldOrderHint')}</p>
          </div>

          {properties.length === 0 && (
            <p className="schema-empty__text">{templateCopy(locale, 'noPropertiesConfigured')}</p>
          )}

          <div className="template-property-list">
            {orderedPropIds.map((propId, index) => {
              const property = propsById.get(propId);
              if (!property) return null;

              const isProgressive = progressiveIds.has(propId);
              const isFirst = index === 0;
              const isLast = index === orderedPropIds.length - 1;

              return (
                <div key={propId} className="template-property-row">
                  <div className="template-property-row__info">
                    <span className="template-property-row__index">{index + 1}</span>
                    <div>
                      <strong>{property.name}</strong>
                      <small>{property.type}</small>
                    </div>
                  </div>

                  <div className="template-property-row__default">
                    {property.type === 'select' || property.type === 'status' ? (
                      <Select
                        onChange={(e) => setDefault(propId, e.target.value || undefined)}
                        value={String(defaults[propId] ?? '')}
                      >
                        <option value="">(No default)</option>
                        {property.rules.choices.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </Select>
                    ) : property.type === 'checkbox' ? (
                      <Select
                        onChange={(e) =>
                          setDefault(propId, e.target.value === '' ? undefined : e.target.value === 'true')
                        }
                        value={defaults[propId] === undefined ? '' : String(defaults[propId])}
                      >
                        <option value="">(No default)</option>
                        <option value="true">{locale === 'ar' ? 'نعم' : 'Yes'}</option>
                        <option value="false">{locale === 'ar' ? 'لا' : 'No'}</option>
                      </Select>
                    ) : (
                      <input
                        onChange={(e) =>
                          setDefault(
                            propId,
                            property.type === 'number' || property.type === 'money'
                              ? e.target.value === '' ? undefined : Number(e.target.value)
                              : e.target.value || undefined,
                          )
                        }
                        placeholder="Default value"
                        type={property.type === 'number' || property.type === 'money' ? 'number' : 'text'}
                        value={defaults[propId] === undefined ? '' : String(defaults[propId])}
                      />
                    )}
                  </div>

                  <label className="template-property-row__progressive" title={templateCopy(locale, 'progressiveHint')}>
                    <input checked={isProgressive} onChange={() => toggleProgressive(propId)} type="checkbox" />
                    <span>{locale === 'ar' ? 'إخفاء خلف المزيد' : 'Progressive'}</span>
                  </label>

                  <div className="template-property-row__actions">
                    <button
                      aria-label={templateCopy(locale, 'moveUp')}
                      className="icon-button"
                      disabled={isFirst}
                      onClick={() => moveProperty(index, 'up')}
                      type="button"
                    >
                      <ArrowUp aria-hidden="true" size={15} />
                    </button>
                    <button
                      aria-label={templateCopy(locale, 'moveDown')}
                      className="icon-button"
                      disabled={isLast}
                      onClick={() => moveProperty(index, 'down')}
                      type="button"
                    >
                      <ArrowDown aria-hidden="true" size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <footer className="form-footer">
          <Button onClick={onClose}>{templateCopy(locale, 'cancel')}</Button>
          <Button disabled={saving} type="submit" variant="primary">
            {templateCopy(locale, 'save')}
          </Button>
        </footer>
      </form>
    </FocusedOverlay>
  );
}
