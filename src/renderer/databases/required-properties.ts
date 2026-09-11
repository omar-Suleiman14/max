import type { WorkspaceProperty } from '../../shared/property-contract';

/**
 * Properties whose value the workspace derives or manages. Marking one of these
 * as unanswered would ask for something nobody can type in.
 */
const derivedTypes = new Set([
  'auto_id',
  'button',
  'created_by',
  'created_time',
  'formula',
  'last_edited_by',
  'last_edited_time',
  'relation',
  'rollup',
]);

/**
 * Whether a required property has been left unanswered on a record.
 *
 * Required is a mark, not a gate. Records can be created and saved with unmet
 * requirements, because the only place to supply the value is the record
 * itself; refusing the write left a database with required properties
 * impossible to add to. A checkbox is never counted, since it always holds one
 * of its two legitimate values.
 */
export function isRequirementUnmet(
  property: Pick<WorkspaceProperty, 'required' | 'type'>,
  value: unknown,
): boolean {
  if (!property.required) return false;
  if (property.type === 'checkbox' || derivedTypes.has(property.type)) return false;
  if (Array.isArray(value)) return value.length === 0;
  return value === undefined || value === null || value === '';
}

/** The required properties a record still has to answer, in schema order. */
export function unmetRequirements(
  properties: readonly WorkspaceProperty[],
  values: Readonly<Record<string, unknown>>,
  title: string,
): readonly WorkspaceProperty[] {
  return properties.filter((property) => (property.type === 'title'
    ? property.required && !title.trim()
    : isRequirementUnmet(property, values[property.id])));
}
