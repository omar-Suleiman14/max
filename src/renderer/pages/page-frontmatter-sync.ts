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

function sameValue(a: PagePropertyValue, b: FrontmatterScalar): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return a === b;
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
    if (sameValue(current.value, value)) continue;
    const incoming: readonly string[] = Array.isArray(value) ? value : [];
    next = next.map((property, index) => index === existingIndex
      ? { ...property, value, options: property.type === 'multi_select' && incoming.length ? [...new Set([...(property.options ?? []), ...incoming])] : property.options }
      : property);
  }
  return next;
}
