/**
 * Query AST, filters, sorts, groups, and calculation contracts for Max v0.2.0.
 */

import type { WorkspaceRecord } from './property-contract';

export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'is_empty'
  | 'is_not_empty'
  | 'is_checked'
  | 'is_not_checked'
  | 'relative_date'
  | 'before_date'
  | 'after_date'
  | 'between_dates'
  | 'in_options'
  | 'not_in_options';

export type RelativeDatePeriod =
  | 'TODAY'
  | 'YESTERDAY'
  | 'TOMORROW'
  | 'THIS_WEEK'
  | 'LAST_WEEK'
  | 'NEXT_WEEK'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'NEXT_MONTH'
  | 'THIS_QUARTER'
  | 'LAST_QUARTER'
  | 'NEXT_QUARTER'
  | 'THIS_YEAR'
  | 'LAST_YEAR'
  | 'NEXT_YEAR'
  | 'LAST_N_DAYS'
  | 'NEXT_N_DAYS'
  | 'LAST_N_WEEKS'
  | 'NEXT_N_WEEKS'
  | 'LAST_N_MONTHS'
  | 'NEXT_N_MONTHS'
  | 'WEEKDAY';

export type FilterGroupNode = Readonly<{
  conditions: readonly FilterNode[];
  kind: 'group';
  operator: 'AND' | 'OR';
}>;

export type PropertyFilterNode = Readonly<{
  kind: 'property';
  operator: FilterOperator;
  propertyId: string;
  relativePeriod?: RelativeDatePeriod;
  relativeValue?: number;
  value?: unknown;
  valueTo?: unknown;
}>;

export type RelationFilterNode = Readonly<{
  kind: 'relation';
  quantifier: 'ANY' | 'ALL' | 'NONE';
  relationPropertyId: string;
  targetFilter: FilterNode;
}>;

export type FilterNode = FilterGroupNode | PropertyFilterNode | RelationFilterNode;

export type SortRule = Readonly<{
  direction: 'asc' | 'desc';
  nullsFirst?: boolean;
  propertyId: string;
}>;

export type DateGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year';

export type GroupRule = Readonly<{
  collapsed?: boolean;
  dateGranularity?: DateGranularity;
  propertyId: string;
}>;

export type AggregateCalculationType =
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'count'
  | 'count_values'
  | 'count_empty'
  | 'count_unique'
  | 'checked'
  | 'unchecked'
  | 'percent_checked'
  | 'earliest'
  | 'latest';

export type AggregateCalculation = Readonly<{
  calculation: AggregateCalculationType;
  propertyId: string;
}>;

export type DatabaseQueryParams = Readonly<{
  calculations?: readonly AggregateCalculation[];
  cursor?: string | null;
  databaseId: string;
  filter?: FilterNode | null;
  group?: GroupRule | null;
  limit?: number;
  requestedPropertyIds?: readonly string[];
  search?: string;
  sorts?: readonly SortRule[];
}>;

export type CalculationResult = Readonly<{
  calculation: AggregateCalculationType;
  formattedValue: string;
  propertyId: string;
  value: number | string | null;
}>;

export type RecordGroup = Readonly<{
  calculations?: readonly CalculationResult[];
  groupKey: string;
  label: string;
  records: readonly WorkspaceRecord[];
  totalCount: number;
}>;

export type DatabaseQueryResult = Readonly<{
  calculations: readonly CalculationResult[];
  databaseId: string;
  groups?: readonly RecordGroup[];
  hasMore: boolean;
  nextCursor?: string | null;
  records: readonly WorkspaceRecord[];
  totalCount: number;
}>;

export type QueryCalculationResult = CalculationResult;
export type CompoundFilterNode = FilterGroupNode;
