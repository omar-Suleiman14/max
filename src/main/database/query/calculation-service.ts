import type { AggregateCalculation, CalculationResult } from '../../../shared/query-contract';
import type { WorkspaceProperty, WorkspaceRecord } from '../../../shared/property-contract';
import { dateValueToText } from '../value-utils';

export class CalculationService {
  computeCalculations(
    records: readonly WorkspaceRecord[],
    calculations: readonly AggregateCalculation[],
    properties: readonly WorkspaceProperty[],
  ): readonly CalculationResult[] {
    const propMap = new Map<string, WorkspaceProperty>();
    for (const p of properties) {
      propMap.set(p.id, p);
    }

    const results: CalculationResult[] = [];

    for (const calc of calculations) {
      const prop = propMap.get(calc.propertyId);
      const isTitle = prop?.type === 'title' || calc.propertyId === 'title' || calc.propertyId === 'Name';

      const rawValues = records.map((r) => (isTitle ? r.title : r.properties[calc.propertyId]));
      const nonNullValues = rawValues.filter((v) => v !== null && v !== undefined && v !== '');

      let value: number | string | null = null;
      let formattedValue = '';

      switch (calc.calculation) {
        case 'count':
          value = records.length;
          formattedValue = String(value);
          break;

        case 'count_values':
          value = nonNullValues.length;
          formattedValue = String(value);
          break;

        case 'count_empty':
          value = records.length - nonNullValues.length;
          formattedValue = String(value);
          break;

        case 'count_unique':
          value = new Set(nonNullValues).size;
          formattedValue = String(value);
          break;

        case 'sum': {
          let sum = 0;
          for (const v of nonNullValues) {
            sum += Number(v) || 0;
          }
          value = Math.round(sum * 100) / 100;
          formattedValue = value.toFixed(2);
          break;
        }

        case 'avg': {
          if (nonNullValues.length === 0) {
            value = 0;
            formattedValue = '0.00';
          } else {
            let sum = 0;
            for (const v of nonNullValues) {
              sum += Number(v) || 0;
            }
            value = Math.round((sum / nonNullValues.length) * 100) / 100;
            formattedValue = value.toFixed(2);
          }
          break;
        }

        case 'min': {
          const nums = nonNullValues.map((v) => Number(v)).filter((n) => Number.isFinite(n));
          value = nums.length > 0 ? Math.min(...nums) : null;
          formattedValue = value !== null ? String(value) : '';
          break;
        }

        case 'max': {
          const nums = nonNullValues.map((v) => Number(v)).filter((n) => Number.isFinite(n));
          value = nums.length > 0 ? Math.max(...nums) : null;
          formattedValue = value !== null ? String(value) : '';
          break;
        }

        case 'checked': {
          const count = rawValues.filter((v) => Boolean(v)).length;
          value = count;
          formattedValue = String(count);
          break;
        }

        case 'unchecked': {
          const count = rawValues.filter((v) => !v).length;
          value = count;
          formattedValue = String(count);
          break;
        }

        case 'percent_checked': {
          if (records.length === 0) {
            value = 0;
            formattedValue = '0%';
          } else {
            const count = rawValues.filter((v) => Boolean(v)).length;
            const pct = Math.round((count / records.length) * 100);
            value = pct;
            formattedValue = `${pct}%`;
          }
          break;
        }

        case 'earliest': {
          const dateStrs = nonNullValues.map(dateValueToText).filter(Boolean).sort();
          value = dateStrs[0] ?? null;
          formattedValue = value ? String(value).slice(0, 10) : '';
          break;
        }

        case 'latest': {
          const dateStrs = nonNullValues.map(dateValueToText).filter(Boolean).sort();
          value = dateStrs[dateStrs.length - 1] ?? null;
          formattedValue = value ? String(value).slice(0, 10) : '';
          break;
        }

        default:
          break;
      }

      results.push({
        calculation: calc.calculation,
        formattedValue,
        propertyId: calc.propertyId,
        value,
      });
    }

    return results;
  }
}
