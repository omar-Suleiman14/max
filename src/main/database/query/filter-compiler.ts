import type { SQLInputValue } from 'node:sqlite';

import type { FilterNode, PropertyFilterNode, RelationFilterNode } from '../../../shared/query-contract';
import type { WorkspaceProperty } from '../../../shared/property-contract';
import { resolveRelativeDate } from './date-resolver';
import { valueToText } from '../value-utils';

export type CompiledFilter = Readonly<{
  params: readonly SQLInputValue[];
  whereSql: string;
}>;

/** The record columns behind the property types that have no stored value. */
const TIMESTAMP_COLUMNS: Record<string, string | undefined> = {
  created_time: 'r.created_at',
  last_edited_time: 'r.updated_at',
};

/** The instant a plain calendar day begins and ends on this machine's clock. */
function localDayBounds(day: string): { end: string; start: string } {
  const [year, month, date] = day.split('-').map(Number);
  const start = new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1);
  return { end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1).toISOString(), start: start.toISOString() };
}

export class FilterCompiler {
  readonly #propertiesMap: ReadonlyMap<string, WorkspaceProperty>;

  constructor(properties: readonly WorkspaceProperty[]) {
    const map = new Map<string, WorkspaceProperty>();
    for (const p of properties) {
      map.set(p.id, p);
    }
    this.#propertiesMap = map;
  }

  compile(filter: FilterNode | null | undefined): CompiledFilter {
    if (!filter) {
      return { params: [], whereSql: '1 = 1' };
    }
    return this.#compileNode(filter);
  }

  #compileNode(node: FilterNode): CompiledFilter {
    if (node.kind === 'group') {
      if (node.conditions.length === 0) {
        return { params: [], whereSql: '1 = 1' };
      }
      const compiledList = node.conditions.map((c) => this.#compileNode(c));
      const clauses = compiledList.map((c) => `(${c.whereSql})`);
      const allParams = compiledList.flatMap((c) => c.params);
      const op = node.operator === 'OR' ? ' OR ' : ' AND ';
      return {
        params: allParams,
        whereSql: clauses.join(op),
      };
    }

    if (node.kind === 'relation') {
      return this.#compileRelationFilter(node);
    }

    return this.#compilePropertyFilter(node);
  }

  #compilePropertyFilter(node: PropertyFilterNode): CompiledFilter {
    const prop = this.#propertiesMap.get(node.propertyId);
    const propId = node.propertyId;

    // Handle Title property
    if (prop?.type === 'title' || propId === 'title' || propId === 'Name') {
      return this.#compileTitleFilter(node);
    }

    // Created time and Last edited time are read off the record itself and were
    // never written to the property value table, so every filter on one used to
    // match nothing at all.
    const timestamp = TIMESTAMP_COLUMNS[prop?.type ?? ''];
    if (timestamp) return this.#compileTimestampFilter(node, timestamp);

    if (prop?.type === 'auto_id') return this.#compileSequenceFilter(node);

    const type = prop?.type ?? 'text';
    if (type === 'checkbox' && typeof node.value === 'boolean' && ['equals', 'not_equals'].includes(node.operator)) {
      const checked = node.operator === 'equals' ? node.value : !node.value;
      return this.#compilePropertyFilter({ ...node, operator: checked ? 'is_checked' : 'is_not_checked' });
    }

    switch (node.operator) {
      case 'is_empty':
        return {
          params: [propId],
          whereSql: `NOT EXISTS (
            SELECT 1 FROM workspace_property_values pv
            WHERE pv.record_id = r.id AND pv.property_id = ? AND (
              pv.text_value IS NOT NULL OR pv.number_value IS NOT NULL OR
              pv.money_minor_value IS NOT NULL OR pv.option_id IS NOT NULL OR
              pv.date_start IS NOT NULL OR pv.boolean_value IS NOT NULL
            )
          )`,
        };

      case 'is_not_empty':
        return {
          params: [propId],
          whereSql: `EXISTS (
            SELECT 1 FROM workspace_property_values pv
            WHERE pv.record_id = r.id AND pv.property_id = ? AND (
              pv.text_value IS NOT NULL OR pv.number_value IS NOT NULL OR
              pv.money_minor_value IS NOT NULL OR pv.option_id IS NOT NULL OR
              pv.date_start IS NOT NULL OR pv.boolean_value IS NOT NULL
            )
          )`,
        };

      case 'is_checked':
        return {
          params: [propId],
          whereSql: `EXISTS (
            SELECT 1 FROM workspace_property_values pv
            WHERE pv.record_id = r.id AND pv.property_id = ? AND pv.boolean_value = 1
          )`,
        };

      case 'is_not_checked':
        return {
          params: [propId],
          whereSql: `NOT EXISTS (
            SELECT 1 FROM workspace_property_values pv
            WHERE pv.record_id = r.id AND pv.property_id = ? AND pv.boolean_value = 1
          )`,
        };

      case 'relative_date': {
        const period = node.relativePeriod || 'THIS_MONTH';
        const range = resolveRelativeDate(period, node.relativeValue);
        // A date that carries a time still belongs to its own day, so the day
        // is compared rather than the whole stored string.
        return {
          params: [propId, range.startDate, range.endDate],
          whereSql: `EXISTS (
            SELECT 1 FROM workspace_property_values pv
            WHERE pv.record_id = r.id AND pv.property_id = ? AND substr(pv.date_start, 1, 10) >= ? AND substr(pv.date_start, 1, 10) <= ?
          )`,
        };
      }

      case 'before_date': {
        const dStr = valueToText(node.value);
        return {
          params: [propId, dStr],
          whereSql: `EXISTS (
            SELECT 1 FROM workspace_property_values pv
            WHERE pv.record_id = r.id AND pv.property_id = ? AND substr(pv.date_start, 1, 10) < ?
          )`,
        };
      }

      case 'after_date': {
        const dStr = valueToText(node.value);
        return {
          params: [propId, dStr],
          whereSql: `EXISTS (
            SELECT 1 FROM workspace_property_values pv
            WHERE pv.record_id = r.id AND pv.property_id = ? AND substr(pv.date_start, 1, 10) > ?
          )`,
        };
      }

      case 'between_dates': {
        const start = valueToText(node.value);
        const end = valueToText(node.valueTo);
        return {
          params: [propId, start, end],
          whereSql: `EXISTS (
            SELECT 1 FROM workspace_property_values pv
            WHERE pv.record_id = r.id AND pv.property_id = ? AND substr(pv.date_start, 1, 10) >= ? AND substr(pv.date_start, 1, 10) <= ?
          )`,
        };
      }

      case 'in_options': {
        const options = (Array.isArray(node.value) ? node.value : [node.value]).map(valueToText);
        if (options.length === 0) return { params: [], whereSql: '1 = 0' };
        const placeholders = options.map(() => '?').join(',');
        return {
          params: [propId, ...options],
          whereSql: `EXISTS (
            SELECT 1 FROM workspace_property_values pv
            WHERE pv.record_id = r.id AND pv.property_id = ? AND pv.option_id IN (${placeholders})
          )`,
        };
      }

      case 'not_in_options': {
        const options = (Array.isArray(node.value) ? node.value : [node.value]).map(valueToText);
        if (options.length === 0) return { params: [], whereSql: '1 = 1' };
        const placeholders = options.map(() => '?').join(',');
        return {
          params: [propId, ...options],
          whereSql: `NOT EXISTS (
            SELECT 1 FROM workspace_property_values pv
            WHERE pv.record_id = r.id AND pv.property_id = ? AND pv.option_id IN (${placeholders})
          )`,
        };
      }

      default:
        break;
    }

    // Number comparisons
    if (type === 'number') {
      const num = Number(node.value || 0);
      const sqlOp = sqlComparisonOperator(node.operator);
      return {
        params: [propId, num],
        whereSql: `EXISTS (
          SELECT 1 FROM workspace_property_values pv
          WHERE pv.record_id = r.id AND pv.property_id = ? AND pv.number_value ${sqlOp} ?
        )`,
      };
    }

    // Text / Select / Status comparisons
    if (node.operator === 'contains') {
      const term = `%${valueToText(node.value).toLowerCase()}%`;
      return {
        params: [propId, term],
        whereSql: `EXISTS (
          SELECT 1 FROM workspace_property_values pv
          WHERE pv.record_id = r.id AND pv.property_id = ? AND lower(pv.text_value) LIKE ?
        )`,
      };
    }

    if (node.operator === 'not_contains') {
      const term = `%${valueToText(node.value).toLowerCase()}%`;
      return {
        params: [propId, term],
        whereSql: `NOT EXISTS (
          SELECT 1 FROM workspace_property_values pv
          WHERE pv.record_id = r.id AND pv.property_id = ? AND lower(pv.text_value) LIKE ?
        )`,
      };
    }

    if (node.operator === 'starts_with') {
      const term = `${valueToText(node.value).toLowerCase()}%`;
      return {
        params: [propId, term],
        whereSql: `EXISTS (
          SELECT 1 FROM workspace_property_values pv
          WHERE pv.record_id = r.id AND pv.property_id = ? AND lower(pv.text_value) LIKE ?
        )`,
      };
    }

    if (node.operator === 'ends_with') {
      const term = `%${valueToText(node.value).toLowerCase()}`;
      return {
        params: [propId, term],
        whereSql: `EXISTS (
          SELECT 1 FROM workspace_property_values pv
          WHERE pv.record_id = r.id AND pv.property_id = ? AND lower(pv.text_value) LIKE ?
        )`,
      };
    }

    if (node.operator === 'not_equals') {
      return {
        params: [propId, valueToText(node.value), valueToText(node.value)],
        whereSql: `NOT EXISTS (
          SELECT 1 FROM workspace_property_values pv
          WHERE pv.record_id = r.id AND pv.property_id = ? AND (pv.text_value = ? OR pv.option_id = ?)
        )`,
      };
    }

    // Default equality (equals)
    return {
      params: [propId, valueToText(node.value), valueToText(node.value)],
      whereSql: `EXISTS (
        SELECT 1 FROM workspace_property_values pv
        WHERE pv.record_id = r.id AND pv.property_id = ? AND (pv.text_value = ? OR pv.option_id = ?)
      )`,
    };
  }

  /**
   * Created time and Last edited time are UTC instants on the record row. A
   * filter names a calendar day, so the day is turned into the pair of instants
   * that bound it on this machine's clock and compared as a half-open range:
   * anything from local midnight up to, but not including, the next one.
   */
  #compileTimestampFilter(node: PropertyFilterNode, column: string): CompiledFilter {
    switch (node.operator) {
      case 'is_empty':
        return { params: [], whereSql: '1 = 0' };
      case 'is_not_empty':
        return { params: [], whereSql: '1 = 1' };
      case 'relative_date': {
        const range = resolveRelativeDate(node.relativePeriod || 'THIS_MONTH', node.relativeValue);
        return { params: [range.startInstant, range.endInstant], whereSql: `${column} >= ? AND ${column} < ?` };
      }
      case 'before_date':
        return { params: [localDayBounds(valueToText(node.value).slice(0, 10)).start], whereSql: `${column} < ?` };
      case 'after_date':
        return { params: [localDayBounds(valueToText(node.value).slice(0, 10)).end], whereSql: `${column} >= ?` };
      case 'between_dates': {
        const from = localDayBounds(valueToText(node.value).slice(0, 10));
        const to = localDayBounds(valueToText(node.valueTo).slice(0, 10));
        return { params: [from.start, to.end], whereSql: `${column} >= ? AND ${column} < ?` };
      }
      case 'not_equals': {
        const day = localDayBounds(valueToText(node.value).slice(0, 10));
        return { params: [day.start, day.end], whereSql: `NOT (${column} >= ? AND ${column} < ?)` };
      }
      case 'contains':
      case 'starts_with':
        return { params: [`${valueToText(node.value)}%`], whereSql: `${column} LIKE ?` };
      case 'not_contains':
        return { params: [`%${valueToText(node.value)}%`], whereSql: `${column} NOT LIKE ?` };
      case 'ends_with':
        return { params: [`%${valueToText(node.value)}`], whereSql: `${column} LIKE ?` };
      default: {
        const day = localDayBounds(valueToText(node.value).slice(0, 10));
        return { params: [day.start, day.end], whereSql: `${column} >= ? AND ${column} < ?` };
      }
    }
  }

  /** Auto ID is the record's own sequence number, not a stored value either. */
  #compileSequenceFilter(node: PropertyFilterNode): CompiledFilter {
    switch (node.operator) {
      case 'is_empty':
        return { params: [], whereSql: '1 = 0' };
      case 'is_not_empty':
        return { params: [], whereSql: '1 = 1' };
      case 'contains':
      case 'not_contains':
      case 'starts_with':
      case 'ends_with': {
        const term = node.operator === 'starts_with' ? `${valueToText(node.value)}%`
          : node.operator === 'ends_with' ? `%${valueToText(node.value)}`
            : `%${valueToText(node.value)}%`;
        return { params: [term], whereSql: `CAST(r.sequence AS TEXT) ${node.operator === 'not_contains' ? 'NOT LIKE' : 'LIKE'} ?` };
      }
      default:
        return { params: [Number(node.value) || 0], whereSql: `r.sequence ${sqlComparisonOperator(node.operator)} ?` };
    }
  }

  #compileTitleFilter(node: PropertyFilterNode): CompiledFilter {
    switch (node.operator) {
      case 'contains':
        return {
          params: [`%${valueToText(node.value).toLowerCase()}%`],
          whereSql: 'lower(n.title) LIKE ?',
        };
      case 'not_contains':
        return {
          params: [`%${valueToText(node.value).toLowerCase()}%`],
          whereSql: 'lower(n.title) NOT LIKE ?',
        };
      case 'starts_with':
        return {
          params: [`${valueToText(node.value).toLowerCase()}%`],
          whereSql: 'lower(n.title) LIKE ?',
        };
      case 'ends_with':
        return {
          params: [`%${valueToText(node.value).toLowerCase()}`],
          whereSql: 'lower(n.title) LIKE ?',
        };
      case 'not_equals':
        return {
          params: [valueToText(node.value)],
          whereSql: 'n.title != ?',
        };
      case 'is_empty':
        return { params: [], whereSql: "trim(n.title) = ''" };
      case 'is_not_empty':
        return { params: [], whereSql: "trim(n.title) != ''" };
      default:
        return {
          params: [valueToText(node.value)],
          whereSql: 'n.title = ?',
        };
    }
  }

  #compileRelationFilter(node: RelationFilterNode): CompiledFilter {
    const relationProp = this.#propertiesMap.get(node.relationPropertyId);
    const relId = relationProp?.config?.relationId;
    if (typeof relId !== 'string' || !relId) {
      return { params: [], whereSql: '1 = 1' };
    }

    const sub = this.#compileNode(node.targetFilter);
    const quantifier = node.quantifier;

    if (quantifier === 'NONE') {
      return {
        params: [relId, ...sub.params],
        whereSql: `NOT EXISTS (
          SELECT 1 FROM workspace_relation_edges edge
          JOIN workspace_records target_r ON target_r.id = edge.target_record_id
          JOIN workspace_nodes n ON n.id = target_r.id
          WHERE edge.relation_id = ? AND edge.source_record_id = r.id AND edge.archived_at IS NULL AND (${sub.whereSql})
        )`,
      };
    }

    // ANY or ALL
    return {
      params: [relId, ...sub.params],
      whereSql: `EXISTS (
        SELECT 1 FROM workspace_relation_edges edge
        JOIN workspace_records target_r ON target_r.id = edge.target_record_id
        JOIN workspace_nodes n ON n.id = target_r.id
        WHERE edge.relation_id = ? AND edge.source_record_id = r.id AND edge.archived_at IS NULL AND (${sub.whereSql})
      )`,
    };
  }
}

function sqlComparisonOperator(op: string): string {
  switch (op) {
    case 'greater_than':
      return '>';
    case 'greater_than_or_equal':
    case 'greater_or_equal':
      return '>=';
    case 'less_than':
      return '<';
    case 'less_than_or_equal':
    case 'less_or_equal':
      return '<=';
    case 'not_equals':
      return '!=';
    default:
      return '=';
  }
}
