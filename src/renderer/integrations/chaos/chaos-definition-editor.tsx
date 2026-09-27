import { useEffect, useState } from 'react';

import type { Locale } from '../../app/i18n';
import {
  CHAOS_OPTION_FIELD_TYPES,
  fieldTypesForKind,
  type ChaosField,
  type ChaosFieldType,
  type ChaosItemKind,
  type ChaosLocalDefinition,
} from '../../../shared/chaos-integration-contract';
import { blankField, mapPropertiesToFields, normalizeFieldForKind } from '../../../shared/chaos-field-mapping';
import type { NavigationItem } from '../../../shared/workspace-contract';
import type { WorkspaceProperty } from '../../../shared/property-contract';
import { Button } from '../../ui/button';
import { chaosCopy, fieldTypeLabel } from './chaos-copy';

type Props = Readonly<{
  definition: ChaosLocalDefinition;
  kind: ChaosItemKind;
  locale: Locale;
  onChange: (definition: ChaosLocalDefinition) => void;
}>;

const lines = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean);

/**
 * Structured field editor for a Chaos draft. Fields are added by hand or
 * prefilled from database properties the person picks; page prose is never
 * turned into questions.
 */
export function ChaosDefinitionEditor({ definition, kind, locale, onChange }: Props) {
  const copy = chaosCopy(locale);
  const types = fieldTypesForKind(kind);
  const [newType, setNewType] = useState<ChaosFieldType>(types[0]!);
  const [picking, setPicking] = useState(false);

  useEffect(() => { if (!types.includes(newType)) setNewType(types[0]!); }, [kind, newType, types]);

  const setField = (index: number, next: ChaosField) => onChange({ ...definition, fields: definition.fields.map((field, i) => (i === index ? next : field)) });
  const move = (index: number, delta: number) => {
    const fields = [...definition.fields];
    const [field] = fields.splice(index, 1);
    fields.splice(index + delta, 0, field!);
    onChange({ ...definition, fields });
  };
  const taken = () => new Set(definition.fields.map(({ id }) => id));

  return (
    <div className="chaos-form">
      <label>
        <span>{copy.title}</span>
        <input value={definition.title} maxLength={200} onChange={(event) => onChange({ ...definition, title: event.target.value })} />
      </label>
      <label>
        <span>{copy.descriptionLabel}</span>
        <textarea value={definition.description ?? ''} maxLength={5000} onChange={(event) => onChange({ ...definition, description: event.target.value || undefined })} />
      </label>

      <h4>{copy.fields}</h4>
      {definition.fields.length === 0 && <p className="chaos-note">{copy.fieldsEmpty}</p>}
      <ol className="chaos-fields">
        {definition.fields.map((field, index) => (
          <li className="chaos-field" key={field.id}>
            <div className="chaos-field__row">
              <label><span>{copy.fieldLabel}</span><input value={field.label} maxLength={500} onChange={(event) => setField(index, { ...field, label: event.target.value })} /></label>
              <label><span>{copy.fieldType}</span>
                <select value={field.type} onChange={(event) => {
                  const type = event.target.value as ChaosFieldType;
                  const fresh = blankField(type, taken());
                  setField(index, normalizeFieldForKind({ ...fresh, id: field.id, label: field.label, options: CHAOS_OPTION_FIELD_TYPES.includes(type) && field.options?.length ? field.options : fresh.options }, kind));
                }}>
                  {types.map((type) => <option key={type} value={type}>{fieldTypeLabel(locale, type)}</option>)}
                </select>
              </label>
            </div>
            <label><span>{copy.fieldDescription}</span><input value={field.description ?? ''} maxLength={5000} onChange={(event) => setField(index, { ...field, description: event.target.value || undefined })} /></label>
            {CHAOS_OPTION_FIELD_TYPES.includes(field.type) && (
              <label><span>{copy.options}</span>
                <textarea rows={Math.min(8, Math.max(3, (field.options?.length ?? 0) + 1))} value={(field.options ?? []).join('\n')}
                  onChange={(event) => setField(index, { ...field, options: event.target.value.split('\n') })}
                  onBlur={(event) => setField(index, { ...field, options: lines(event.target.value) })} />
              </label>
            )}
            {field.type === 'matrix' && (
              <label><span>{copy.rows}</span>
                <textarea rows={3} value={(field.rows ?? []).join('\n')} onChange={(event) => setField(index, { ...field, rows: event.target.value.split('\n') })}
                  onBlur={(event) => setField(index, { ...field, rows: lines(event.target.value) })} />
              </label>
            )}
            {kind === 'quiz' && field.type !== 'written' && (
              <label><span>{copy.quizAnswer}</span>
                {field.type === 'true_false' ? (
                  <select value={field.correctAnswer ?? ''} onChange={(event) => setField(index, { ...field, correctAnswer: event.target.value || undefined })}>
                    <option value="">—</option><option value="True">True</option><option value="False">False</option>
                  </select>
                ) : field.type === 'multi_select' ? (
                  <input value={(field.correctAnswers ?? []).join(', ')} onChange={(event) => setField(index, { ...field, correctAnswers: event.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
                ) : (
                  <select value={field.correctAnswer ?? ''} onChange={(event) => setField(index, { ...field, correctAnswer: event.target.value || undefined })}>
                    <option value="">—</option>
                    {(field.options ?? []).filter(Boolean).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                )}
              </label>
            )}
            <div className="chaos-field__tools">
              {field.type !== 'statement' && field.type !== 'section' && (
                <label><input type="checkbox" checked={!!field.required} onChange={(event) => setField(index, { ...field, required: event.target.checked })} />{copy.required}</label>
              )}
              {kind === 'quiz' && (
                <label>{copy.points}<input type="number" min={1} style={{ width: 70 }} value={field.points ?? ''} onChange={(event) => setField(index, { ...field, points: event.target.value === '' ? undefined : Number(event.target.value) })} /></label>
              )}
              <span style={{ flex: 1 }} />
              <Button variant="ghost" disabled={index === 0} onClick={() => move(index, -1)}>{copy.moveUp}</Button>
              <Button variant="ghost" disabled={index === definition.fields.length - 1} onClick={() => move(index, 1)}>{copy.moveDown}</Button>
              <Button variant="ghost" onClick={() => onChange({ ...definition, fields: definition.fields.filter((_, i) => i !== index) })}>{copy.remove}</Button>
            </div>
          </li>
        ))}
      </ol>
      <div className="chaos-actions">
        <select aria-label={copy.fieldType} value={newType} onChange={(event) => setNewType(event.target.value as ChaosFieldType)} style={{ width: 'auto' }}>
          {types.map((type) => <option key={type} value={type}>{fieldTypeLabel(locale, type)}</option>)}
        </select>
        <Button onClick={() => onChange({ ...definition, fields: [...definition.fields, normalizeFieldForKind(blankField(newType, taken()), kind)] })}>{copy.addField}</Button>
        {kind === 'form' && <Button variant="ghost" onClick={() => setPicking(!picking)} aria-expanded={picking}>{copy.pickProperties}</Button>}
      </div>
      {picking && kind === 'form' && (
        <PropertyPicker locale={locale} onPick={(properties) => {
          const mapped = mapPropertiesToFields(properties.map((property) => ({ id: property.id, name: property.name, options: property.options?.filter((option) => !option.archivedAt), type: property.type })), definition.fields);
          onChange({ ...definition, fields: [...definition.fields, ...mapped.fields] });
          return mapped.unsupported;
        }} />
      )}
    </div>
  );
}

function PropertyPicker({ locale, onPick }: Readonly<{ locale: Locale; onPick: (properties: readonly WorkspaceProperty[]) => readonly Readonly<{ name: string; reason: string }>[] }>) {
  const copy = chaosCopy(locale);
  const [databases, setDatabases] = useState<readonly NavigationItem[]>([]);
  const [databaseId, setDatabaseId] = useState('');
  const [properties, setProperties] = useState<readonly WorkspaceProperty[]>([]);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [skipped, setSkipped] = useState<readonly Readonly<{ name: string; reason: string }>[]>([]);

  useEffect(() => {
    void window.maxApi.workspace.getNavigation().then((navigation) => setDatabases(navigation.databases.filter((item) => !item.archivedAt))).catch(() => setDatabases([]));
  }, []);
  useEffect(() => {
    if (!databaseId) { setProperties([]); return; }
    void window.maxApi.workspace.listProperties(databaseId).then((list) => {
      const active = list.filter((property) => !property.archivedAt);
      setProperties(active);
      setChosen(new Set(active.map(({ id }) => id)));
    }).catch(() => setProperties([]));
  }, [databaseId]);

  return (
    <div className="chaos-note">
      <p style={{ margin: '0 0 8px' }}>{copy.pickPropertiesHelp}</p>
      <label><span>{copy.selectDatabase}</span>
        <select value={databaseId} onChange={(event) => setDatabaseId(event.target.value)}>
          <option value="">—</option>
          {databases.map((database) => <option key={database.id} value={database.id}>{database.title}</option>)}
        </select>
      </label>
      {properties.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
          {properties.map((property) => (
            <li key={property.id}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={chosen.has(property.id)} onChange={(event) => {
                  const next = new Set(chosen);
                  if (event.target.checked) next.add(property.id); else next.delete(property.id);
                  setChosen(next);
                }} />
                <bdi>{property.name}</bdi>
              </label>
            </li>
          ))}
        </ul>
      )}
      {properties.length > 0 && <Button variant="primary" disabled={!chosen.size} onClick={() => setSkipped(onPick(properties.filter(({ id }) => chosen.has(id))))}>{copy.addField}</Button>}
      {skipped.length > 0 && (
        <div role="status">
          <strong>{copy.unsupported}</strong>
          <ul>{skipped.map((item) => <li key={item.name}><bdi>{item.name}</bdi>: {item.reason}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
