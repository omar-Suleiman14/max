import type { DatabaseSync } from 'node:sqlite';

import type { AggregateCalculation, DatabaseQueryParams, DatabaseQueryResult, GroupRule, RecordGroup } from '../../../shared/query-contract';
import type { WorkspaceProperty, WorkspaceRecord } from '../../../shared/property-contract';
import type { PropertyRepository } from '../property-repository';
import type { RecordRepository } from '../record-repository';
import type { ComputedPropertyService } from '../computed-property-service';
import { FilterCompiler } from './filter-compiler';
import { SortCompiler } from './sort-compiler';
import { CalculationService } from './calculation-service';
import { dateValueToText, valueToText } from '../value-utils';

type RecordRow = Readonly<{
  archived_at: string | null;
  created_at: string;
  database_id: string;
  icon: string | null;
  id: string;
  parent_node_id: string | null;
  position_key: string;
  revision: number;
  sequence: number;
  template_id: string | null;
  title: string;
  updated_at: string;
}>;

export class DatabaseQueryService {
  readonly #database: DatabaseSync;
  readonly #propertyRepo: PropertyRepository;
  readonly #recordRepo: RecordRepository;
  readonly #computedService: ComputedPropertyService;
  readonly #calculationService: CalculationService;

  constructor(
    database: DatabaseSync,
    propertyRepo: PropertyRepository,
    recordRepo: RecordRepository,
    computedService: ComputedPropertyService,
  ) {
    this.#database = database;
    this.#propertyRepo = propertyRepo;
    this.#recordRepo = recordRepo;
    this.#computedService = computedService;
    this.#calculationService = new CalculationService();
  }

  query(params: DatabaseQueryParams): DatabaseQueryResult {
    const propertyDefs = this.#propertyRepo.listProperties(params.databaseId);
    const filterCompiler = new FilterCompiler(propertyDefs);
    const sortCompiler = new SortCompiler(propertyDefs);

    const compiledFilter = filterCompiler.compile(params.filter);
    const orderClause = sortCompiler.compile(params.sorts);

    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.cursor ? Number(params.cursor) || 0 : 0;
    const searchText = params.search?.trim();
    const searchClause = searchText
      ? `AND (
          max_search_normalize(n.title) LIKE max_search_normalize(?) OR EXISTS (
            SELECT 1 FROM workspace_property_values search_value
            WHERE search_value.record_id = r.id AND (
              max_search_normalize(COALESCE(search_value.text_value, '')) LIKE max_search_normalize(?) OR
              max_search_normalize(COALESCE(search_value.json_value, '')) LIKE max_search_normalize(?) OR
              CAST(search_value.number_value AS TEXT) LIKE ? OR
              CAST(search_value.money_minor_value AS TEXT) LIKE ?
            )
          )
        )`
      : '';
    const searchParams = searchText
      ? [`%${searchText}%`, `%${searchText}%`, `%${searchText}%`, `%${searchText}%`, `%${searchText}%`]
      : [];

    // 1. Get total matching count
    const countSql = `
      SELECT COUNT(*) AS total_count
      FROM workspace_records r
      JOIN workspace_nodes n ON n.id = r.id
      WHERE r.database_id = ? AND r.archived_at IS NULL AND (${compiledFilter.whereSql})
      ${searchClause}
    `;
    const countRow = this.#database
      .prepare(countSql)
      .get(params.databaseId, ...compiledFilter.params, ...searchParams) as { total_count: number };
    const totalCount = countRow.total_count;

    // 2. Fetch page records
    const recordSql = `
      SELECT r.*, n.title, n.icon, n.parent_node_id, n.revision
      FROM workspace_records r
      JOIN workspace_nodes n ON n.id = r.id
      WHERE r.database_id = ? AND r.archived_at IS NULL AND (${compiledFilter.whereSql})
      ${searchClause}
      ORDER BY ${orderClause}
      LIMIT ? OFFSET ?
    `;
    const rows = this.#database
      .prepare(recordSql)
      .all(params.databaseId, ...compiledFilter.params, ...searchParams, limit, offset) as RecordRow[];

    if (rows.length === 0) {
      return {
        calculations: [],
        databaseId: params.databaseId,
        hasMore: false,
        records: [],
        totalCount,
      };
    }

    const recordIds = rows.map((r) => r.id);
    const rawProperties = this.#recordRepo.batchLoadProperties(recordIds, propertyDefs);

    const records: WorkspaceRecord[] = [];
    for (const row of rows) {
      const record: WorkspaceRecord = {
        archivedAt: row.archived_at,
        createdAt: row.created_at,
        databaseId: row.database_id,
        icon: row.icon,
        id: row.id,
        positionKey: row.position_key,
        properties: rawProperties.get(row.id) ?? {},
        revision: row.revision,
        sequence: row.sequence,
        templateId: row.template_id,
        title: row.title,
        updatedAt: row.updated_at,
      };

      // Compute dynamic formulas and rollups
      const computedProps = this.#computedService.computeForRecord(record, propertyDefs);
      records.push({
        ...record,
        properties: computedProps,
      });
    }

    // 3. Compute calculations
    const calculations = params.calculations && params.calculations.length > 0
      ? this.#calculationService.computeCalculations(records, params.calculations, propertyDefs)
      : [];

    // 4. Compute groups if requested
    let groups: RecordGroup[] | undefined;
    if (params.group) {
      groups = this.#groupRecords(records, params.group, propertyDefs, params.calculations);
    }

    const hasMore = offset + records.length < totalCount;
    const nextCursor = hasMore ? String(offset + records.length) : null;

    return {
      calculations,
      databaseId: params.databaseId,
      groups,
      hasMore,
      nextCursor,
      records,
      totalCount,
    };
  }

  #groupRecords(
    records: readonly WorkspaceRecord[],
    group: GroupRule,
    propertyDefs: readonly WorkspaceProperty[],
    calculations?: readonly AggregateCalculation[],
  ): RecordGroup[] {
    const groupPropertyId = group.propertyId;
    const prop = propertyDefs.find((p) => p.id === groupPropertyId);
    const groupMap = new Map<string, { displayLabel: string; groupKey: string; records: WorkspaceRecord[] }>();

    for (const record of records) {
      const val = prop?.type === 'title' || groupPropertyId === 'title' || groupPropertyId === 'Name'
        ? record.title
        : record.properties[groupPropertyId];

      let key = 'ungrouped';
      let label = 'No Value';

      if (val !== undefined && val !== null && val !== '') {
        if (prop?.options) {
          const opt = prop.options.find((o) => o.id === val);
          key = valueToText(val);
          label = opt ? opt.label : valueToText(val);
        } else if (prop?.type === 'date' && group.dateGranularity) {
          const dateText = dateValueToText(val);
          const date = new Date(dateText);
          if (!Number.isNaN(date.getTime())) {
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            if (group.dateGranularity === 'year') key = `${year}`;
            else if (group.dateGranularity === 'quarter') key = `${year}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
            else if (group.dateGranularity === 'month') key = `${year}-${month}`;
            else if (group.dateGranularity === 'week') {
              const weekStart = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate() - date.getUTCDay()));
              key = weekStart.toISOString().slice(0, 10);
            } else key = `${year}-${month}-${day}`;
            label = key;
          }
        } else if (typeof val === 'boolean') {
          key = val ? 'true' : 'false';
          label = val ? 'Yes' : 'No';
        } else {
          key = valueToText(val);
          label = valueToText(val);
        }
      }

      let grp = groupMap.get(key);
      if (!grp) {
        grp = { displayLabel: label, groupKey: key, records: [] };
        groupMap.set(key, grp);
      }
      grp.records.push(record);
    }

    return [...groupMap.values()].map((g) => ({
      calculations: calculations && calculations.length > 0
        ? this.#calculationService.computeCalculations(g.records, calculations, propertyDefs)
        : undefined,
      groupKey: g.groupKey,
      label: g.displayLabel,
      records: g.records,
      totalCount: g.records.length,
    }));
  }
}
