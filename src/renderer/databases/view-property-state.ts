import type { WorkspaceProperty } from '../../shared/property-contract';
import type { ColumnState } from '../../shared/view-contract';

/**
 * Apply the ordering stored by a saved view without requiring every property to
 * already have a column-state row. Older views often contain only the columns
 * somebody changed, so unlisted properties keep their schema order after the
 * explicitly ordered ones.
 */
export function orderPropertiesForView(
  properties: readonly WorkspaceProperty[],
  columns: readonly ColumnState[],
): readonly WorkspaceProperty[] {
  const explicit = new Map(columns.map((column, index) => [column.propertyId, index]));
  const source = new Map(properties.map((property, index) => [property.id, index]));

  return [...properties].sort((a, b) => {
    if (a.type === 'title' && b.type !== 'title') return -1;
    if (b.type === 'title' && a.type !== 'title') return 1;

    const aOrder = explicit.get(a.id);
    const bOrder = explicit.get(b.id);
    if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;
    return (source.get(a.id) ?? 0) - (source.get(b.id) ?? 0);
  });
}

export function visiblePropertiesForView(
  properties: readonly WorkspaceProperty[],
  columns: readonly ColumnState[],
): readonly WorkspaceProperty[] {
  return orderPropertiesForView(properties, columns).filter((property) => (
    property.type === 'title'
    || !columns.find((column) => column.propertyId === property.id)?.hidden
  ));
}
