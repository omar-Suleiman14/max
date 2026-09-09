/**
 * Property definitions, options, values, and schema types for Max v0.2.0.
 */

export const PROPERTY_TYPES = [
  'title',
  'text',
  'number',
  'select',
  'multi_select',
  'status',
  'checkbox',
  'date',
  'relation',
  'rollup',
  'formula',
  'url',
  'email',
  'phone',
  'file',
  'user',
  'created_time',
  'created_by',
  'last_edited_time',
  'last_edited_by',
  'auto_id',
  'button',
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

export type StatusCategory = 'NOT_STARTED' | 'ACTIVE' | 'COMPLETE';

export type StatusGroup = Readonly<{
  category: StatusCategory;
  id: string;
  label: string;
  positionKey: string;
  propertyId: string;
}>;

export type PropertyOption = Readonly<{
  archivedAt?: string | null;
  id: string;
  label: string;
  positionKey: string;
  propertyId: string;
  statusGroupId?: string | null;
  style: Readonly<{
    background?: string;
    color?: string;
  }>;
}>;

export type FormulaConfig = Readonly<{
  astJson?: string;
  expression: string;
  returnType?: 'boolean' | 'date' | 'number' | 'text';
}>;

export type RollupAggregation =
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'count'
  | 'count_values'
  | 'count_empty'
  | 'count_unique'
  | 'earliest'
  | 'latest';

export type RollupConfig = Readonly<{
  aggregation: RollupAggregation;
  filterAstJson?: string | null;
  relationPropertyId: string;
  targetPropertyId: string;
}>;

export type NumberConfig = Readonly<{
  format?: 'number' | 'percent' | 'compact';
  precision?: number;
}>;

export type AutoIdConfig = Readonly<{
  prefix?: string;
  zeroPadding?: number;
}>;

export type PropertyConfig = Readonly<{
  autoId?: AutoIdConfig;
  formula?: FormulaConfig | string | { expression: string };
  number?: NumberConfig;
  relationId?: string;
  rollup?: RollupConfig;
  [key: string]: unknown;
}>;

export type WorkspaceProperty = Readonly<{
  archivedAt?: string | null;
  config: PropertyConfig;
  createdAt: string;
  databaseId: string;
  defaultValueJson?: string | null;
  id: string;
  name: string;
  options?: readonly PropertyOption[];
  positionKey: string;
  required: boolean;
  statusGroups?: readonly StatusGroup[];
  type: PropertyType;
  uniqueValue: boolean;
  updatedAt: string;
}>;

export type PropertyOptionDraft = Readonly<{
  id?: string;
  label: string;
  positionKey?: string;
  statusGroupId?: string | null;
  style?: Readonly<{ background?: string; color?: string }>;
}>;

export type StatusGroupDraft = Readonly<{
  category: StatusCategory;
  id?: string;
  label: string;
  positionKey?: string;
}>;

export type PropertyDraft = Readonly<{
  config?: PropertyConfig;
  databaseId: string;
  defaultValueJson?: string | null;
  id?: string;
  name: string;
  options?: readonly PropertyOptionDraft[];
  positionKey?: string;
  required?: boolean;
  statusGroups?: readonly StatusGroupDraft[];
  type: PropertyType;
  uniqueValue?: boolean;
}>;

export type PropertyPatch = Readonly<{
  config?: PropertyConfig;
  defaultValueJson?: string | null;
  name?: string;
  options?: readonly PropertyOptionDraft[];
  positionKey?: string;
  required?: boolean;
  statusGroups?: readonly StatusGroupDraft[];
  uniqueValue?: boolean;
}>;

export type TypeConversionPreview = Readonly<{
  availableStrategies: readonly ('convert_all' | 'first_value' | 'set_null' | 'cancel')[];
  convertibleCount: number;
  dependencies: readonly Readonly<{ id: string; name: string; type: string }>[];
  invalidCount: number;
  sampleFailures: readonly Readonly<{ current: unknown; error: string; recordId: string; recordTitle: string }>[];
  totalRecords: number;
}>;

export type TypeConversionStrategy = 'convert_all' | 'first_value' | 'set_null';

export type WorkspaceRecord = Readonly<{
  archivedAt?: string | null;
  contentJson?: string | null;
  createdAt: string;
  databaseId: string;
  icon?: string | null;
  id: string;
  positionKey: string;
  properties: Readonly<Record<string, unknown>>;
  revision: number;
  sequence: number;
  templateId?: string | null;
  title: string;
  updatedAt: string;
}>;

export type WorkspaceRecordDraft = Readonly<{
  contentJson?: string | null;
  databaseId: string;
  icon?: string | null;
  id?: string;
  positionKey?: string;
  properties?: Readonly<Record<string, unknown>>;
  templateId?: string | null;
  title: string;
}>;

export type WorkspaceRecordTemplate = Readonly<{
  contentJson: string;
  createdAt: string;
  databaseId: string;
  defaults: Readonly<Record<string, unknown>>;
  icon?: string | null;
  id: string;
  name: string;
  positionKey: string;
  updatedAt: string;
}>;

export type WorkspaceRecordPatch = Readonly<{
  contentJson?: string | null;
  icon?: string | null;
  positionKey?: string;
  properties?: Readonly<Record<string, unknown>>;
  templateId?: string | null;
  title?: string;
}>;

export type WorkspacePropertyDraft = PropertyDraft;
export type WorkspacePropertyPatch = PropertyPatch;
