import { inferFrontmatterPropertyType, type FrontmatterEntry, type FrontmatterScalar } from '../../shared/page-frontmatter';
import type { PageProperty, PagePropertyType, PagePropertyValue } from './page-properties';

/** Page property types whose value is a flat scalar or list of strings — everything YAML frontmatter can hold. */
const SCALAR_TYPES: readonly PagePropertyType[] = ['text', 'number', 'date', 'checkbox', 'select', 'multi_select', 'status', 'url', 'email', 'phone'];

function toScalar(value: PagePropertyValue): FrontmatterScalar {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || Array.isArray(value)) return value;
  return null;
}

/** The frontmatter's source view of a page's properties: only the types a flat YAML scalar can represent. */
export function propertiesToFrontmatterEntries(properties: readonly PageProperty[]): readonly FrontmatterEntry[] {
  return properties.filter((property) => SCALAR_TYPES.includes(property.type)).map((property): FrontmatterEntry => [property.name, toScalar(property.value)]);
}

function sameValue(a: PagePropertyValue, b: PagePropertyValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return a === b;
}

type NormalizedFrontmatterValue = Readonly<{ valid: true; value: PagePropertyValue }> | Readonly<{ valid: false }>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Keeps an existing page property's persisted value compatible with its
 * configured type. Frontmatter is a text editing surface, so scalar values can
 * be stringified for text-like properties, while structurally typed values
 * (number, checkbox, date and multi-select) only accept their native YAML shape.
 *
 * A mismatched value is ignored rather than corrupting the property. File and
 * read-only timestamp properties are never writable from frontmatter.
 */
function normalizeForExistingType(type: PagePropertyType, value: FrontmatterScalar): NormalizedFrontmatterValue {
  if (value === null) return SCALAR_TYPES.includes(type) ? { valid: true, value: null } : { valid: false };

  if (['text', 'url', 'email', 'phone', 'select', 'status'].includes(type)) {
    if (Array.isArray(value)) return { valid: false };
    return { valid: true, value: String(value) };
  }
  if (type === 'number') return typeof value === 'number' ? { valid: true, value } : { valid: false };
  if (type === 'checkbox') return typeof value === 'boolean' ? { valid: true, value } : { valid: false };
  if (type === 'date') return typeof value === 'string' && ISO_DATE.test(value) ? { valid: true, value } : { valid: false };
  if (type === 'multi_select') return Array.isArray(value) ? { valid: true, value } : { valid: false };
  return { valid: false };
}

/**
 * Applies parsed frontmatter entries onto the current properties. A key that
 * matches an existing property's name keeps that property's configured type
 * — the type is never re-inferred from YAML — and only its value changes. A
 * key with no match becomes a new property, typed from the value's shape.
 *
 * Omitting a key from the YAML source never deletes a property: that stays a
 * dedicated action in the property panel, so a half-typed edit can never
 * silently drop data.
 */
export function applyFrontmatterEntries(properties: readonly PageProperty[], entries: readonly FrontmatterEntry[]): readonly PageProperty[] {
  let next = properties;
  for (const [key, value] of entries) {
    const existingIndex = next.findIndex((property) => property.name === key);
    if (existingIndex === -1) {
      const type = inferFrontmatterPropertyType(value);
      next = [...next, {
        id: crypto.randomUUID(),
        name: key,
        type,
        value,
        options: type === 'multi_select' && Array.isArray(value) ? [...new Set(value)] : undefined,
      }];
      continue;
    }
    const current = next[existingIndex]!;
    const normalized = normalizeForExistingType(current.type, value);
    if (!normalized.valid || sameValue(current.value, normalized.value)) continue;
    const incoming: readonly string[] = Array.isArray(normalized.value) ? normalized.value : [];
    const incomingChoice = ['select', 'status'].includes(current.type) && typeof normalized.value === 'string'
      ? normalized.value
      : null;
    next = next.map((property, index) => index === existingIndex
      ? {
        ...property,
        value: normalized.value,
        options: property.type === 'multi_select' && incoming.length
          ? [...new Set([...(property.options ?? []), ...incoming])]
          : incomingChoice && !(property.options ?? []).includes(incomingChoice)
            ? [...(property.options ?? []), incomingChoice]
            : property.options,
      }
      : property);
  }
  return next;
}
