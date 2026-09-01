import type { FormulaNode } from './parser';
import { valueToText } from '../value-utils';

export type FormulaEvaluationContext = Readonly<{
  now?: string;
  properties: Readonly<Record<string, unknown>>;
  recordTitle?: string;
}>;

export function evaluateFormula(node: FormulaNode, context: FormulaEvaluationContext): unknown {
  switch (node.kind) {
    case 'literal':
      return node.value;

    case 'property_ref': {
      if (node.propertyId === 'title' || node.propertyId === 'Name') {
        return context.recordTitle ?? context.properties[node.propertyId] ?? null;
      }
      return context.properties[node.propertyId] ?? null;
    }

    case 'unary_op': {
      const val = evaluateFormula(node.argument, context);
      if (node.operator === '-' || node.operator === 'not') {
        if (node.operator === '-') {
          return typeof val === 'number' ? -val : 0;
        }
        return !isTruthy(val);
      }
      return !isTruthy(val);
    }

    case 'binary_op': {
      const left = evaluateFormula(node.left, context);
      const right = evaluateFormula(node.right, context);
      const op = node.operator.toLowerCase();

      switch (op) {
        case '+':
          if (typeof left === 'string' || typeof right === 'string') {
            return valueToText(left) + valueToText(right);
          }
          return (Number(left) || 0) + (Number(right) || 0);
        case '-':
          return (Number(left) || 0) - (Number(right) || 0);
        case '*':
          return (Number(left) || 0) * (Number(right) || 0);
        case '/': {
          const denom = Number(right);
          if (!denom) return 0;
          return (Number(left) || 0) / denom;
        }
        case '%': {
          const denom = Number(right);
          if (!denom) return 0;
          return (Number(left) || 0) % denom;
        }
        case '==':
        case '=':
          return left === right;
        case '!=':
          return left !== right;
        case '<':
          return (Number(left) || 0) < (Number(right) || 0);
        case '<=':
          return (Number(left) || 0) <= (Number(right) || 0);
        case '>':
          return (Number(left) || 0) > (Number(right) || 0);
        case '>=':
          return (Number(left) || 0) >= (Number(right) || 0);
        case 'and':
        case '&&':
          return isTruthy(left) && isTruthy(right);
        case 'or':
        case '||':
          return isTruthy(left) || isTruthy(right);
        default:
          return null;
      }
    }

    case 'function_call': {
      const fnName = node.name.toLowerCase();
      const args = node.args.map((a) => evaluateFormula(a, context));

      switch (fnName) {
        case 'if':
          return isTruthy(args[0]) ? args[1] : args[2];

        case 'coalesce':
          for (const arg of args) {
            if (arg !== null && arg !== undefined && arg !== '') return arg;
          }
          return null;

        case 'empty':
          return args[0] === null || args[0] === undefined || args[0] === '' || (Array.isArray(args[0]) && args[0].length === 0);

        case 'round': {
          const num = Number(args[0]) || 0;
          const precision = Number(args[1]) || 0;
          const factor = 10 ** precision;
          return Math.round(num * factor) / factor;
        }

        case 'floor':
          return Math.floor(Number(args[0]) || 0);

        case 'ceil':
          return Math.ceil(Number(args[0]) || 0);

        case 'abs':
          return Math.abs(Number(args[0]) || 0);

        case 'min': {
          const numbers = args.map((a) => Number(a)).filter((n) => Number.isFinite(n));
          return numbers.length > 0 ? Math.min(...numbers) : 0;
        }

        case 'max': {
          const numbers = args.map((a) => Number(a)).filter((n) => Number.isFinite(n));
          return numbers.length > 0 ? Math.max(...numbers) : 0;
        }

        case 'concat':
          return args.map(valueToText).join('');

        case 'lower':
          return valueToText(args[0]).toLowerCase();

        case 'upper':
          return valueToText(args[0]).toUpperCase();

        case 'trim':
          return valueToText(args[0]).trim();

        case 'length':
          return valueToText(args[0]).length;

        case 'contains':
          return valueToText(args[0]).toLowerCase().includes(valueToText(args[1]).toLowerCase());

        case 'today':
          return (context.now ?? new Date().toISOString()).slice(0, 10);

        case 'now':
          return context.now ?? new Date().toISOString();

        case 'year': {
          const d = parseDate(args[0]);
          return d ? d.getUTCFullYear() : null;
        }

        case 'month': {
          const d = parseDate(args[0]);
          return d ? d.getUTCMonth() + 1 : null;
        }

        case 'quarter': {
          const d = parseDate(args[0]);
          return d ? Math.floor(d.getUTCMonth() / 3) + 1 : null;
        }

        case 'weekday': {
          const d = parseDate(args[0]);
          return d ? d.getUTCDay() : null;
        }

        case 'dateadd': {
          const d = parseDate(args[0]);
          if (!d) return null;
          const amount = Number(args[1]) || 0;
          const unit = valueToText(args[2]) || 'day';
          const next = new Date(d);
          if (unit === 'day' || unit === 'days') next.setUTCDate(next.getUTCDate() + amount);
          else if (unit === 'month' || unit === 'months') next.setUTCMonth(next.getUTCMonth() + amount);
          else if (unit === 'year' || unit === 'years') next.setUTCFullYear(next.getUTCFullYear() + amount);
          return next.toISOString();
        }

        case 'datesubtract': {
          const d = parseDate(args[0]);
          if (!d) return null;
          const amount = Number(args[1]) || 0;
          const unit = valueToText(args[2]) || 'day';
          const next = new Date(d);
          if (unit === 'day' || unit === 'days') next.setUTCDate(next.getUTCDate() - amount);
          else if (unit === 'month' || unit === 'months') next.setUTCMonth(next.getUTCMonth() - amount);
          else if (unit === 'year' || unit === 'years') next.setUTCFullYear(next.getUTCFullYear() - amount);
          return next.toISOString();
        }

        case 'datebetween': {
          const d1 = parseDate(args[0]);
          const d2 = parseDate(args[1]);
          if (!d1 || !d2) return 0;
          const unit = valueToText(args[2]) || 'day';
          const diffMs = d1.getTime() - d2.getTime();
          if (unit === 'day' || unit === 'days') return Math.floor(diffMs / (1000 * 60 * 60 * 24));
          if (unit === 'hour' || unit === 'hours') return Math.floor(diffMs / (1000 * 60 * 60));
          return diffMs;
        }

        default:
          return null;
      }
    }
  }
}

function isTruthy(val: unknown): boolean {
  if (val === false || val === 0 || val === null || val === undefined || val === '') {
    return false;
  }
  return true;
}

function parseDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
