import type { WorkspaceProperty } from '../../shared/property-contract';
import type { FilterNode } from '../../shared/query-contract';

/** Values the workspace derives; a new record cannot carry them in. */
const unsettableTypes = new Set([
  'auto_id',
  'button',
  'created_by',
  'created_time',
  'formula',
  'last_edited_by',
  'last_edited_time',
  'rollup',
  'title',
]);

/**
 * Read the one value a condition names, or `undefined` when it names a range, a
 * substring, or anything else no single value satisfies.
 */
function valueFromCondition(
  operator: string,
  rawValue: unknown,
  property: WorkspaceProperty,
): unknown {
  switch (operator) {
    case 'equals':
      return rawValue === undefined ? undefined : rawValue;
    case 'is_checked':
      return true;
    case 'is_not_checked':
      return false;
    case 'in_options': {
      if (!Array.isArray(rawValue) || rawValue.length === 0) return undefined;
      return property.type === 'multi_select' ? rawValue : rawValue[0];
    }
    default:
      return undefined;
  }
}

/**
 * Property values a new record needs in order to land inside the view it was
 * created from.
 *
 * A row added from a filtered view used to be saved blank, fail the filter, and
 * vanish, which reads as the button doing nothing. Only `AND` groups and
 * conditions that name a single value contribute; an `OR` branch or a range has
 * no one answer, so it is left alone and the caller falls back to opening the
 * record.
 */
export function recordDefaultsForFilter(
  filter: FilterNode | null | undefined,
  properties: readonly WorkspaceProperty[],
): Record<string, unknown> {
  const byId = new Map(properties.map((property) => [property.id, property]));
  const defaults: Record<string, unknown> = {};

  const visit = (node: FilterNode | null | undefined): void => {
    if (!node) return;
    if (node.kind === 'group') {
      if (node.operator !== 'AND') return;
      for (const condition of node.conditions) visit(condition);
      return;
    }
    // A relation condition describes rows on the far side of the link, not a
    // value this record can be created with.
    if (node.kind !== 'property') return;

    const property = byId.get(node.propertyId);
    if (!property || unsettableTypes.has(property.type)) return;
    if (property.id in defaults) return;

    const value = valueFromCondition(node.operator, node.value, property);
    if (value !== undefined) defaults[property.id] = value;
  };

  visit(filter);
  return defaults;
}
