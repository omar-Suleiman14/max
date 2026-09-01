import type { SortRule } from '../../../shared/query-contract';
import type { WorkspaceProperty } from '../../../shared/property-contract';

export class SortCompiler {
  readonly #propertiesMap: ReadonlyMap<string, WorkspaceProperty>;

  constructor(properties: readonly WorkspaceProperty[]) {
    const map = new Map<string, WorkspaceProperty>();
    for (const p of properties) {
      map.set(p.id, p);
    }
    this.#propertiesMap = map;
  }

  compile(sorts?: readonly SortRule[]): string {
    if (!sorts || sorts.length === 0) {
      return 'r.position_key ASC';
    }

    const clauses: string[] = [];

    for (const sort of sorts) {
      const prop = this.#propertiesMap.get(sort.propertyId);
      const dir = sort.direction === 'desc' ? 'DESC' : 'ASC';

      if (prop?.type === 'title' || sort.propertyId === 'title' || sort.propertyId === 'Name') {
        clauses.push(`n.title ${dir}`);
        continue;
      }

      if (prop?.type === 'number') {
        clauses.push(`(
          SELECT pv.number_value FROM workspace_property_values pv
          WHERE pv.record_id = r.id AND pv.property_id = '${sort.propertyId}'
        ) ${dir}`);
      } else if (prop?.type === 'money') {
        clauses.push(`(
          SELECT pv.money_minor_value FROM workspace_property_values pv
          WHERE pv.record_id = r.id AND pv.property_id = '${sort.propertyId}'
        ) ${dir}`);
      } else if (prop?.type === 'date') {
        clauses.push(`(
          SELECT pv.date_start FROM workspace_property_values pv
          WHERE pv.record_id = r.id AND pv.property_id = '${sort.propertyId}'
        ) ${dir}`);
      } else if (prop?.type === 'checkbox') {
        clauses.push(`(
          SELECT pv.boolean_value FROM workspace_property_values pv
          WHERE pv.record_id = r.id AND pv.property_id = '${sort.propertyId}'
        ) ${dir}`);
      } else {
        clauses.push(`(
          SELECT pv.text_value FROM workspace_property_values pv
          WHERE pv.record_id = r.id AND pv.property_id = '${sort.propertyId}'
        ) ${dir}`);
      }
    }

    clauses.push('r.position_key ASC');
    return clauses.join(', ');
  }
}
