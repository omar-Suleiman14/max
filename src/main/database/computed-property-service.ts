import type { DatabaseSync } from 'node:sqlite';

import type { WorkspaceProperty, WorkspaceRecord } from '../../shared/property-contract';
import type { FormulaParser } from './formula/parser';
import { evaluateFormula } from './formula/evaluator';
import type { PropertyRepository } from './property-repository';
import type { RecordRepository } from './record-repository';
import type { RelationRepository } from './relation-repository';

export class ComputedPropertyService {
  readonly #database: DatabaseSync;
  readonly #propertyRepo: PropertyRepository;
  readonly #recordRepo: RecordRepository;
  readonly #relationRepo: RelationRepository;
  readonly #formulaParser: FormulaParser;

  constructor(
    database: DatabaseSync,
    propertyRepo: PropertyRepository,
    recordRepo: RecordRepository,
    relationRepo: RelationRepository,
    formulaParser: FormulaParser,
  ) {
    this.#database = database;
    this.#propertyRepo = propertyRepo;
    this.#recordRepo = recordRepo;
    this.#relationRepo = relationRepo;
    this.#formulaParser = formulaParser;
  }

  computeForRecord(
    record: WorkspaceRecord,
    properties: readonly WorkspaceProperty[],
  ): Record<string, unknown> {
    const computedValues: Record<string, unknown> = { ...record.properties };

    for (const prop of properties) {
      if (prop.type === 'formula') {
        const formula = prop.config?.formula;
        const expression = typeof formula === 'string' ? formula : formula && typeof formula === 'object' ? formula.expression : undefined;
        if (expression?.trim()) {
          try {
            const ast = this.#formulaParser.parse(expression);
            const val = evaluateFormula(ast, {
              properties: computedValues,
              recordTitle: record.title,
            });
            computedValues[prop.id] = val;
          } catch {
            computedValues[prop.id] = null;
          }
        }
      } else if (prop.type === 'rollup') {
        const rollupConfig = prop.config?.rollup;
        if (rollupConfig?.relationPropertyId && rollupConfig?.targetPropertyId) {
          const val = this.#computeRollup(
            record.id,
            rollupConfig.relationPropertyId,
            rollupConfig.targetPropertyId,
            rollupConfig.aggregation,
          );
          computedValues[prop.id] = val;
        }
      }
    }

    return computedValues;
  }

  #computeRollup(
    recordId: string,
    relationPropertyId: string,
    targetPropertyId: string,
    aggregation: string,
  ): number | string | null {
    const relation = this.#relationRepo.getRelationByPropertyId(relationPropertyId);
    if (!relation) return null;

    const isSource = relation.sourcePropertyId === relationPropertyId;
    const matchCol = isSource ? 'source_record_id' : 'target_record_id';
    const targetCol = isSource ? 'target_record_id' : 'source_record_id';

    const edgeRows = this.#database
      .prepare(`
        SELECT ${targetCol} AS target_id
        FROM workspace_relation_edges
        WHERE relation_id = ? AND ${matchCol} = ? AND archived_at IS NULL
      `)
      .all(relation.id, recordId) as { target_id: string }[];

    if (edgeRows.length === 0) {
      return aggregation === 'count' ? 0 : null;
    }

    const targetRecordIds = edgeRows.map((r) => r.target_id);
    const targetProp = this.#propertyRepo.getProperty(targetPropertyId);
    if (!targetProp) return null;

    const targetPropsMap = this.#recordRepo.batchLoadProperties(targetRecordIds, [targetProp]);
    const values: unknown[] = [];
    for (const tid of targetRecordIds) {
      const pData = targetPropsMap.get(tid);
      if (pData && pData[targetPropertyId] !== undefined && pData[targetPropertyId] !== null) {
        values.push(pData[targetPropertyId]);
      }
    }

    switch (aggregation) {
      case 'count':
        return targetRecordIds.length;
      case 'count_values':
        return values.length;
      case 'count_empty':
        return targetRecordIds.length - values.length;
      case 'count_unique':
        return new Set(values).size;
      case 'sum': {
        let total = 0;
        for (const v of values) {
          total += Number(v) || 0;
        }
        return total;
      }
      case 'avg': {
        if (values.length === 0) return 0;
        let total = 0;
        for (const v of values) {
          total += Number(v) || 0;
        }
        return total / values.length;
      }
      case 'min': {
        const nums = values.map((v) => Number(v)).filter((n) => Number.isFinite(n));
        return nums.length > 0 ? Math.min(...nums) : null;
      }
      case 'max': {
        const nums = values.map((v) => Number(v)).filter((n) => Number.isFinite(n));
        return nums.length > 0 ? Math.max(...nums) : null;
      }
      case 'earliest': {
        const dates = values.map((v) => String(v)).sort();
        return dates[0] ?? null;
      }
      case 'latest': {
        const dates = values.map((v) => String(v)).sort();
        return dates[dates.length - 1] ?? null;
      }
      default:
        return null;
    }
  }
}
