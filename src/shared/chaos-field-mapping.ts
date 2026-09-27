import type { PropertyType } from './property-contract';
import {
  CHAOS_LIMITS,
  CHAOS_OPTION_FIELD_TYPES,
  fieldTypesForKind,
  type ChaosCompatibilityReport,
  type ChaosDefinition,
  type ChaosDraftRequest,
  type ChaosField,
  type ChaosFieldType,
  type ChaosItemKind,
  type ChaosLocalDefinition,
} from './chaos-integration-contract';

/**
 * Turning Max database properties into Chaos form fields.
 *
 * Only a property's name, type and option labels are used. Record values,
 * page text and anything else in the workspace stay where they are: the person
 * picks properties explicitly, and nothing is inferred from prose.
 */

export type MappableProperty = Readonly<{
  id: string;
  name: string;
  options?: readonly Readonly<{ label: string }>[];
  type: PropertyType;
}>;

export type PropertyMapping =
  | Readonly<{ field: ChaosField; propertyId: string; supported: true }>
  | Readonly<{ propertyId: string; propertyName: string; reason: string; supported: false }>;

const UNSUPPORTED_REASONS: Partial<Record<PropertyType, string>> = {
  auto_id: 'Numbered automatically by Max',
  button: 'A button runs an action and has no value to ask for',
  created_by: 'Filled in by Max',
  created_time: 'Filled in by Max',
  file: 'Attachments are not sent to Chaos',
  formula: 'Calculated by Max',
  last_edited_by: 'Filled in by Max',
  last_edited_time: 'Filled in by Max',
  relation: 'Links to other Max records cannot be answered in Chaos',
  rollup: 'Calculated by Max',
  user: 'People in this workspace are not shared with Chaos',
};

/** A field id that satisfies the contract and is not in `taken`. */
export function freshFieldId(taken: ReadonlySet<string>, base = 'field'): string {
  const stem = (base.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^[^A-Za-z]+/, '').replace(/_+$/, '').slice(0, 40) || 'field').toLowerCase();
  let candidate = stem;
  for (let index = 2; taken.has(candidate); index += 1) candidate = `${stem}_${index}`;
  return candidate;
}

function optionLabels(property: MappableProperty): string[] {
  return (property.options ?? []).map(({ label }) => label.trim()).filter(Boolean).slice(0, CHAOS_LIMITS.maxOptions);
}

export function mapPropertyToField(property: MappableProperty, taken: Set<string>): PropertyMapping {
  const reason = UNSUPPORTED_REASONS[property.type];
  if (reason) return { propertyId: property.id, propertyName: property.name, reason, supported: false };
  const label = property.name.trim().slice(0, CHAOS_LIMITS.labelLength) || 'Untitled';
  const id = freshFieldId(taken, label);
  taken.add(id);
  const base = { id, label, required: property.type === 'title' };
  let field: ChaosField;
  switch (property.type) {
    case 'title':
    case 'text':
      field = { ...base, type: 'text' };
      break;
    case 'number':
      field = { ...base, type: 'number' };
      break;
    case 'select':
    case 'status': {
      const options = optionLabels(property);
      if (options.length < 2) return { propertyId: property.id, propertyName: property.name, reason: 'Needs at least two options', supported: false };
      field = { ...base, options, type: options.length > 6 ? 'dropdown' : 'choice' };
      break;
    }
    case 'multi_select': {
      const options = optionLabels(property);
      if (options.length < 2) return { propertyId: property.id, propertyName: property.name, reason: 'Needs at least two options', supported: false };
      field = { ...base, options, type: 'multi_choice' };
      break;
    }
    case 'checkbox':
      field = { ...base, options: ['Yes', 'No'], type: 'choice' };
      break;
    case 'date':
      field = { ...base, type: 'date' };
      break;
    case 'url':
      field = { ...base, type: 'url' };
      break;
    case 'email':
      field = { ...base, type: 'email' };
      break;
    case 'phone':
      field = { ...base, type: 'phone' };
      break;
    default:
      return { propertyId: property.id, propertyName: property.name, reason: 'This property type has no Chaos equivalent', supported: false };
  }
  return { field, propertyId: property.id, supported: true };
}

export function mapPropertiesToFields(properties: readonly MappableProperty[], existing: readonly ChaosField[] = []): Readonly<{
  fields: readonly ChaosField[];
  unsupported: readonly Readonly<{ name: string; reason: string }>[];
}> {
  const taken = new Set(existing.map(({ id }) => id));
  const fields: ChaosField[] = [];
  const unsupported: { name: string; reason: string }[] = [];
  for (const property of properties) {
    const mapped = mapPropertyToField(property, taken);
    if (mapped.supported) fields.push(mapped.field);
    else unsupported.push({ name: mapped.propertyName, reason: mapped.reason });
  }
  return { fields, unsupported };
}

/** A blank field of the given type with sensible starting values. */
export function blankField(type: ChaosFieldType, taken: ReadonlySet<string>): ChaosField {
  const id = freshFieldId(taken, 'question');
  if (type === 'matrix') return { id, label: '', options: ['Poor', 'Fair', 'Good'], rows: ['Row 1'], type };
  if (CHAOS_OPTION_FIELD_TYPES.includes(type)) return { id, label: '', options: ['Option 1', 'Option 2'], type };
  if (type === 'rating') return { id, label: '', max: 5, min: 1, type };
  if (type === 'scale') return { id, label: '', max: 10, min: 0, type };
  if (type === 'true_false') return { id, label: '', type };
  return { id, label: '', type };
}

/**
 * Keep only what the chosen kind uses. Switching a list from quiz to form, for
 * example, drops answer keys rather than sending settings a form cannot hold.
 */
export function normalizeFieldForKind(field: ChaosField, kind: ChaosItemKind): ChaosField {
  const next: { -readonly [K in keyof ChaosField]: ChaosField[K] } = { id: field.id, label: field.label, type: field.type };
  if (field.description?.trim()) next.description = field.description;
  if (field.required) next.required = true;
  if (CHAOS_OPTION_FIELD_TYPES.includes(field.type)) next.options = (field.options ?? []).map((option) => option.trim()).filter(Boolean);
  if (field.type === 'matrix') next.rows = (field.rows ?? []).map((row) => row.trim()).filter(Boolean);
  if (field.type === 'rating' || field.type === 'scale' || field.type === 'number') {
    if (field.min !== undefined) next.min = field.min;
    if (field.max !== undefined) next.max = field.max;
  }
  if (kind === 'quiz') {
    if (field.correctAnswer?.trim()) next.correctAnswer = field.correctAnswer.trim();
    if (field.correctAnswers?.length) next.correctAnswers = field.correctAnswers.filter((answer) => answer.trim());
    if (field.keywords?.length) next.keywords = field.keywords.filter((keyword) => keyword.trim());
    if (field.points !== undefined) next.points = field.points;
  }
  return next;
}

/** The exact body `POST /drafts` receives. */
export function buildDraftRequest(kind: ChaosItemKind, definition: ChaosLocalDefinition, sourceLabel?: string): ChaosDraftRequest {
  const description = definition.description?.trim();
  return {
    kind,
    title: definition.title.trim(),
    ...(description ? { description } : {}),
    fields: definition.fields.map((field) => normalizeFieldForKind(field, kind)),
    ...(sourceLabel?.trim() ? { source: { label: sourceLabel.trim().slice(0, 200) } } : {}),
  };
}

/**
 * Make a Chaos definition usable as a Max field list.
 *
 * With `freshIds` (template copy) every field gets a new local id, so the copy
 * shares nothing with the item it came from. Without it (editing a linked
 * draft in place) ids are kept, because the same item is being updated.
 */
export function definitionToLocal(
  definition: ChaosDefinition,
  unsupportedFields: readonly string[],
  freshIds: boolean,
): Readonly<{ compatibility: ChaosCompatibilityReport; definition: ChaosLocalDefinition }> {
  const allowed = fieldTypesForKind(definition.kind);
  const taken = new Set<string>();
  const droppedByMax = [...unsupportedFields];
  const notes: string[] = [];
  const fields: ChaosField[] = [];
  for (const field of definition.fields) {
    if (!allowed.includes(field.type)) {
      droppedByMax.push(`${field.label} (${field.type})`);
      continue;
    }
    const id = freshIds || !CHAOS_LIMITS.fieldIdPattern.test(field.id) || taken.has(field.id) ? freshFieldId(taken, field.label || 'question') : field.id;
    taken.add(id);
    let normalized = normalizeFieldForKind({ ...field, id }, definition.kind);
    if ((normalized.options?.length ?? 0) > CHAOS_LIMITS.maxOptions) {
      notes.push(`${field.label}: kept the first ${CHAOS_LIMITS.maxOptions} options.`);
      normalized = { ...normalized, options: normalized.options?.slice(0, CHAOS_LIMITS.maxOptions) };
    }
    if (normalized.label.length > CHAOS_LIMITS.labelLength) {
      notes.push(`${field.label.slice(0, 40)}…: shortened the label to ${CHAOS_LIMITS.labelLength} characters.`);
      normalized = { ...normalized, label: normalized.label.slice(0, CHAOS_LIMITS.labelLength) };
    }
    fields.push(normalized);
    if (fields.length >= CHAOS_LIMITS.maxFields) {
      notes.push(`Only the first ${CHAOS_LIMITS.maxFields} fields were kept.`);
      break;
    }
  }
  if (definition.kind === 'quiz' && fields.some((field) => field.correctAnswer === undefined && field.correctAnswers === undefined && field.keywords === undefined)) {
    notes.push('Some answer keys were not included. Chaos shares answer keys only for your own items; add them in Chaos before publishing.');
  }
  return {
    compatibility: { droppedByChaos: definition.compatibility.dropped, droppedByMax, notes },
    definition: {
      ...(definition.description ? { description: definition.description } : {}),
      fields,
      title: definition.title.slice(0, CHAOS_LIMITS.titleLength),
    },
  };
}

export type FieldChange =
  | Readonly<{ field: ChaosField; kind: 'added' }>
  | Readonly<{ field: ChaosField; kind: 'removed' }>
  | Readonly<{ after: ChaosField; before: ChaosField; changes: readonly string[]; kind: 'changed' }>
  | Readonly<{ after: string; before: string; kind: 'title' | 'description' }>
  | Readonly<{ kind: 'order' }>;

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** What an update would change, field by field, for the change preview. */
export function diffDefinitions(before: ChaosLocalDefinition, after: ChaosLocalDefinition): FieldChange[] {
  const changes: FieldChange[] = [];
  if (before.title !== after.title) changes.push({ after: after.title, before: before.title, kind: 'title' });
  if ((before.description ?? '') !== (after.description ?? '')) changes.push({ after: after.description ?? '', before: before.description ?? '', kind: 'description' });
  const previous = new Map(before.fields.map((field) => [field.id, field]));
  const next = new Set(after.fields.map(({ id }) => id));
  for (const field of after.fields) {
    const old = previous.get(field.id);
    if (!old) { changes.push({ field, kind: 'added' }); continue; }
    const fieldChanges: string[] = [];
    if (old.label !== field.label) fieldChanges.push('label');
    if (old.type !== field.type) fieldChanges.push('type');
    if (Boolean(old.required) !== Boolean(field.required)) fieldChanges.push('required');
    if (!same(old.options, field.options)) fieldChanges.push('options');
    if (!same(old.rows, field.rows)) fieldChanges.push('rows');
    if (!same(old.description, field.description)) fieldChanges.push('description');
    if (!same(old.min, field.min) || !same(old.max, field.max)) fieldChanges.push('range');
    if (!same(old.correctAnswer, field.correctAnswer) || !same(old.correctAnswers, field.correctAnswers) || !same(old.keywords, field.keywords) || !same(old.points, field.points)) fieldChanges.push('answer key');
    if (fieldChanges.length) changes.push({ after: field, before: old, changes: fieldChanges, kind: 'changed' });
  }
  for (const field of before.fields) if (!next.has(field.id)) changes.push({ field, kind: 'removed' });
  const order = (definition: ChaosLocalDefinition) => definition.fields.map(({ id }) => id).filter((id) => previous.has(id) && next.has(id));
  if (!changes.some((change) => change.kind === 'added' || change.kind === 'removed') && !same(order(before), order(after))) {
    changes.push({ kind: 'order' });
  }
  return changes;
}

/** Things Max cannot send, always listed in the create preview. */
export const CHAOS_NOT_SENT_NOTES: readonly string[] = [
  'Page text, formatting, images and attachments are never sent. Only the fields listed here are.',
  'Labels and descriptions are sent as plain text.',
  'No Max records or values are sent, only field definitions.',
];
