import type { FrontmatterEntry, FrontmatterScalar } from './page-frontmatter';
import type {
  PropertyDraft,
  PropertyType,
  WorkspaceProperty,
  WorkspaceRecord,
} from './property-contract';

export const RECORD_FRONTMATTER_CREATABLE_TYPES = [
  'text',
  'number',
  'select',
  'multi_select',
  'status',
  'checkbox',
  'date',
  'url',
  'email',
  'phone',
] as const satisfies readonly PropertyType[];

const WRITABLE_TYPES = new Set<PropertyType>(RECORD_FRONTMATTER_CREATABLE_TYPES);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type RecordFrontmatterOperation = Readonly<
  | { key: string; property: WorkspaceProperty; target: 'title'; value: string }
  | { key: string; property: WorkspaceProperty; target: 'property'; value: unknown }
>;

export type RecordFrontmatterIssue = Readonly<{
  key: string;
  kind: 'unknown' | 'forbidden' | 'invalid';
  message: string;
  value: FrontmatterScalar;
}>;

export type RecordFrontmatterPlan = Readonly<{
  issues: readonly RecordFrontmatterIssue[];
  operations: readonly RecordFrontmatterOperation[];
}>;

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isStringList(value: FrontmatterScalar): value is readonly string[] {
  return Array.isArray(value) && value.every((item: unknown): item is string => typeof item === 'string');
}

function optionByLabel(property: WorkspaceProperty, label: string) {
  return property.options?.find((option) => option.label === label);
}

function optionLabel(property: WorkspaceProperty, id: string): string | null {
  return property.options?.find((option) => option.id === id)?.label ?? null;
}

function validationError(property: WorkspaceProperty, value: FrontmatterScalar): string | null {
  if (value === null) return null;
  switch (property.type) {
    case 'title':
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      return typeof value === 'string' ? null : `${property.name} must be text.`;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : `${property.name} must be a number.`;
    case 'checkbox':
      return typeof value === 'boolean' ? null : `${property.name} must be true or false.`;
    case 'date':
      return typeof value === 'string' && isRealIsoDate(value) ? null : `${property.name} must be a YYYY-MM-DD date.`;
    case 'select':
    case 'status':
      if (typeof value !== 'string') return `${property.name} must name one option.`;
      return optionByLabel(property, value) ? null : `"${value}" is not an option for ${property.name}.`;
    case 'multi_select': {
      if (!isStringList(value)) return `${property.name} must be a list of option names.`;
      const missing = value.find((label) => !optionByLabel(property, label));
      return missing === undefined ? null : `"${missing}" is not an option for ${property.name}.`;
    }
    default:
      return `${property.name} is managed by Max and cannot be written from YAML.`;
  }
}

/** Convert a parsed YAML scalar into the value shape the record repository already accepts. */
export function resolveRecordFrontmatterValue(
  property: WorkspaceProperty,
  value: FrontmatterScalar,
): Readonly<{ error: string | null; value: unknown }> {
  const error = validationError(property, value);
  if (error) return { error, value: null };
  if (property.type === 'title' && value === null) return { error: null, value: '' };
  if (value === null) return { error: null, value: null };
  if (property.type === 'select' || property.type === 'status') {
    return { error: null, value: optionByLabel(property, value as string)!.id };
  }
  if (property.type === 'multi_select') {
    return {
      error: null,
      value: [...new Set((value as readonly string[]).map((label) => optionByLabel(property, label)!.id))],
    };
  }
  return { error: null, value };
}

/**
 * Resolve keys against the existing schema. Unknown keys are reported as offers;
 * they never become schema mutations here. Valid siblings still become write
 * operations when another key is invalid.
 */
export function planRecordFrontmatterEntries(
  properties: readonly WorkspaceProperty[],
  entries: readonly FrontmatterEntry[],
): RecordFrontmatterPlan {
  const issues: RecordFrontmatterIssue[] = [];
  const operations: RecordFrontmatterOperation[] = [];

  for (const [key, value] of entries) {
    const matches = properties.filter((property) => property.name === key);
    if (matches.length === 0) {
      issues.push({ key, kind: 'unknown', message: `Create "${key}" as a property`, value });
      continue;
    }
    if (matches.length > 1) {
      issues.push({ key, kind: 'invalid', message: `${key} matches more than one property. Rename one before editing it from YAML.`, value });
      continue;
    }

    const property = matches[0]!;
    if (property.type !== 'title' && !WRITABLE_TYPES.has(property.type)) {
      issues.push({ key, kind: 'forbidden', message: `${property.name} is managed by Max and cannot be written from YAML.`, value });
      continue;
    }

    const resolved = resolveRecordFrontmatterValue(property, value);
    if (resolved.error) {
      issues.push({ key, kind: 'invalid', message: resolved.error, value });
      continue;
    }

    if (property.type === 'title') {
      operations.push({ key, property, target: 'title', value: resolved.value as string });
    } else {
      operations.push({ key, property, target: 'property', value: resolved.value });
    }
  }

  return { issues, operations };
}

/** Frontmatter source for values that can safely round-trip as flat YAML. */
export function recordToFrontmatterEntries(
  properties: readonly WorkspaceProperty[],
  record: Pick<WorkspaceRecord, 'properties' | 'title'>,
): readonly FrontmatterEntry[] {
  const entries: FrontmatterEntry[] = [];
  for (const property of properties) {
    if (property.type === 'title') {
      entries.push([property.name, record.title]);
      continue;
    }
    if (!WRITABLE_TYPES.has(property.type)) continue;
    const stored = record.properties[property.id];
    if (stored === undefined || stored === null || stored === '') {
      entries.push([property.name, null]);
      continue;
    }
    if (property.type === 'select' || property.type === 'status') {
      entries.push([property.name, typeof stored === 'string' ? optionLabel(property, stored) : null]);
      continue;
    }
    if (property.type === 'multi_select') {
      const labels = Array.isArray(stored)
        ? stored.flatMap((id) => typeof id === 'string' ? [optionLabel(property, id)] : []).filter((label): label is string => Boolean(label))
        : [];
      entries.push([property.name, labels]);
      continue;
    }
    if (typeof stored === 'string' || typeof stored === 'number' || typeof stored === 'boolean') {
      entries.push([property.name, stored]);
    }
  }
  return entries;
}

function newPropertyValueError(type: (typeof RECORD_FRONTMATTER_CREATABLE_TYPES)[number], value: FrontmatterScalar): string | null {
  if (value === null) return null;
  if (['text', 'url', 'email', 'phone', 'select', 'status', 'date'].includes(type)) {
    if (typeof value !== 'string') return `${type.replace('_', ' ')} properties require a text value.`;
    if (type === 'date' && !isRealIsoDate(value)) return 'Date properties require a YYYY-MM-DD value.';
    return null;
  }
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value) ? null : 'Number properties require a number.';
  if (type === 'checkbox') return typeof value === 'boolean' ? null : 'Checkbox properties require true or false.';
  if (type === 'multi_select') return isStringList(value) ? null : 'Multi-select properties require a list of text values.';
  return null;
}

/** Build the ordinary createProperty draft after the person explicitly chose a type. */
export function propertyDraftFromFrontmatter(
  databaseId: string,
  name: string,
  type: (typeof RECORD_FRONTMATTER_CREATABLE_TYPES)[number],
  value: FrontmatterScalar,
): Readonly<{ draft: PropertyDraft | null; error: string | null }> {
  const error = newPropertyValueError(type, value);
  if (error) return { draft: null, error };

  const options = type === 'select' || type === 'status'
    ? typeof value === 'string' && value ? [{ label: value }] : []
    : type === 'multi_select' && isStringList(value)
      ? [...new Set(value)].map((label) => ({ label }))
      : undefined;

  return {
    error: null,
    draft: {
      databaseId,
      name,
      type,
      ...(options ? { options } : {}),
    },
  };
}
