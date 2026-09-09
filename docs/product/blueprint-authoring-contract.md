# Max generic blueprint authoring contract (version 2)

Settings → Danger → Blueprint → Import accepts this format. Choose a JSON file or paste JSON, click Preview blueprint, then Import and Apply. Preview runs the actual importer inside a rolled-back savepoint. Import is atomic and adds new objects to the current workspace; it does not merge by name or execute workflows. Export in the same dialog produces version 2 including active seed records. The legacy version 1 format is not accepted by this dialog.

## Canonical schema

The following are the exact current TypeScript definitions. Readonly has no JSON equivalent. Fields with ? are optional; all others are required. Use JSON arrays and objects, with no undefined values. PropertyType, FilterNode, WorkflowStep and other referenced types are defined below.

```ts
/**
 * Blueprint v2 and Workspace Template contracts for Max v0.2.0.
 */

import type { PropertyType, StatusCategory } from './property-contract';
import type { ViewLayout, PropertyViewState } from './view-contract';
import type { FilterNode, GroupRule, SortRule } from './query-contract';
import type { WorkflowInputField, WorkflowStep } from './workflow-contract';

export type TemplateProperty = Readonly<{
  config?: Readonly<Record<string, unknown>>;
  defaultValue?: unknown;
  key: string;
  name: string;
  options?: readonly Readonly<{ key?: string; label: string; statusGroupKey?: string; style?: { background?: string; color?: string } }>[];
  statusGroups?: readonly Readonly<{ key: string; label: string; category: StatusCategory }>[];
  required?: boolean;
  type: PropertyType;
  uniqueValue?: boolean;
}>;

export type TemplateView = Readonly<{
  filterAst?: FilterNode | null;
  group?: GroupRule | null;
  key: string;
  layout: ViewLayout;
  layoutConfig?: Readonly<Record<string, unknown>>;
  name: string;
  propertyKeys?: readonly string[];
  propertyState?: PropertyViewState;
  sorts?: readonly SortRule[];
}>;

export type TemplateRecordTemplate = Readonly<{
  contentJson?: string;
  databaseKey: string;
  defaults?: Readonly<Record<string, unknown>>;
  icon?: string;
  key: string;
  name: string;
}>;

export type TemplateDatabase = Readonly<{
  parentPageKey?: string;
  positionKey?: string;
  defaultViewKey?: string;
  icon?: string;
  key: string;
  properties: readonly TemplateProperty[];
  title: string;
  views: readonly TemplateView[];
  visibility?: 'normal' | 'advanced';
}>;

export type TemplateRelation = Readonly<{
  inversePropertyKey?: string;
  inversePropertyName?: string;
  key: string;
  sourceCardinality?: 'one' | 'many';
  sourceDatabaseKey: string;
  sourcePropertyKey: string;
  targetCardinality?: 'one' | 'many';
  targetDatabaseKey: string;
}>;

export type TemplateWorkflow = Readonly<{
  enabled?: boolean;
  icon?: string;
  inputSchema: WorkflowInputSchema;
  key: string;
  name: string;
  steps: readonly WorkflowStep[];
}>;

export type TemplatePage = Readonly<{
  parentPageKey?: string;
  positionKey?: string;
  contentJson: string;
  /** Emoji, or a Lucide icon encoded as lucide:IconName#RRGGBB. */
  icon?: string;
  key: string;
  title: string;
}>;

export type TemplateRecord = Readonly<{
  key: string;
  databaseKey: string;
  title: string;
  icon?: string;
  contentJson?: string;
  properties?: Readonly<Record<string, unknown>>;
}>;

export type WorkspaceTemplateV2 = Readonly<{
  author?: string;
  databases: readonly TemplateDatabase[];
  description?: string;
  name: string;
  pages?: readonly TemplatePage[];
  recordTemplates?: readonly TemplateRecordTemplate[];
  records?: readonly TemplateRecord[];
  relations: readonly TemplateRelation[];
  version: 2;
  workflows?: readonly TemplateWorkflow[];
}>;

export type TemplateImportResult = Readonly<{
  databaseCount: number;
  databases: readonly { id: string; key: string; title: string }[];
  pageCount: number;
  pages: readonly { id: string; key: string; title: string }[];
  propertyCount: number;
  recordCount: number;
  relationCount: number;
  workflowCount: number;
}>;

```

## Property types and configuration

```ts
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


```

Property names and view/action names must be 1–120 characters (repository limit). Database/page titles are nonempty strings up to 500 characters. Keys are nonempty strings up to 120 characters. Provide one title property per database to refer to it; the importer creates a title property automatically if omitted. Non-title properties retain array order. Do not write values to formulas, rollups, timestamps, actor metadata or buttons in seed records or action mappings. Number values have no currency semantics.

Options need key when referenced in seed data, defaults, filters or action literals. Select/status values use the option key, never the label. Multi-select values are arrays of option keys. Status options can name a statusGroupKey from the same property. A property defaultValue is a literal JSON value, not a workflow reference. A record-template defaults object maps property keys to literal JSON values.

## IDs and references

- All database/property/option/status-group/view/relation/page/record/record-template/workflow keys must be globally unique. Prefer descriptive prefixed keys such as db_stations, prop_station_units, record_station_a. Avoid schema field names as keys.
- The importer generates fresh UUIDs. Use blueprint keys wherever runtime schemas say databaseId, propertyId, relationPropertyId, targetPropertyId, viewId, workflowId, etc. Object keys in property mappings are also remapped. No installed workspace ID is required.
- Strings equal to a key and bracketed formula references [key] are remapped; larger IDs and ordinary prose are not subject to substring replacement. contentJson is parsed as JSON for recursive reference replacement.
- Relation sourcePropertyKey must identify a relation property in sourceDatabaseKey. inversePropertyKey must identify a relation property in targetDatabaseKey. Alternatively inversePropertyName generates an inverse property; use an explicit inverse key if other objects must reference it. Each property can participate in only one relation definition.
- targetCardinality one limits each source record to one target. sourceCardinality one limits each target record to one source. Both default to many. Violating seed cardinality rejects the whole import.
- Seed properties for a relation are an array of target seed record keys (a single key or null is also accepted). Forward/circular record references are supported because all records are created before edges.
- Workflow outputs are referenced by outputVariable, not by step id. Input identifiers and step identifiers are local to the workflow; step order matters. Inputs use key, falling back to id, then input_1/input_2/etc. Prefer explicit keys.
- Pages and databases can use parentPageKey to refer to another blueprint page. Cycles and missing parents are rejected. positionKey is optional; omit it to append in import order. There is no home/default-page field. Importing a page named Home does not replace the application Home.

## Saved views, filters, sorts and groups

```ts
/**
 * Workspace views and layout state contracts for Max v0.2.0.
 */

import type { FilterNode, GroupRule, SortRule } from './query-contract';

export type ViewLayout =
  | 'table'
  | 'list'
  | 'board'
  | 'calendar'
  | 'gallery'
  | 'timeline'
  | 'chart'
  | 'map'
  | 'form';

export type ColumnState = Readonly<{
  hidden?: boolean;
  propertyId: string;
  width?: number;
  wrap?: boolean;
}>;

export type PropertyViewState = Readonly<{
  columns: readonly ColumnState[];
  coverPropertyId?: string | null;
  datePropertyId?: string | null;
  groupPropertyId?: string | null;
}>;


```

```ts
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


```

propertyKeys lists visible properties in order; other properties are appended hidden. Alternatively propertyState preserves explicit column hidden/width/wrap settings and date/cover/group property choices; it takes precedence. Omitted propertyState columns are appended visible. defaultViewKey must name a view in the same database; otherwise the first configured view becomes default. An empty views array keeps the automatically generated table view.

Use layoutConfig.calculations: [{propertyId: "prop_units", calculation: "sum"}] for view totals. layoutConfig.pageMode is center, side or full. layoutConfig.defaultTemplateId can reference a record-template key. Saved filter values are literals; workflow lookup filter values can be WorkflowValue references.

Relative date periods TODAY/THIS_WEEK/THIS_MONTH/THIS_YEAR and the other enumerated periods are accepted. The current resolver uses UTC and Sunday-start weeks. WEEKDAY is in the type but has no dedicated resolver: do not use it. Relative filters currently compare YYYY-MM-DD bounds; prefer date-only stored values for these filters. The view type enum is broader than the polished renderer layouts; table/list/board/calendar/gallery are the ordinary UI choices.

## Formulas and rollups

Canonical formula config: {"formula":{"expression":"[prop_units] * 2","returnType":"number"}}. A formula string is also accepted as config.formula. Use bracketed property keys, not display names and not Notion prop("Name") syntax. Formula values are calculated when records are queried; they are not seed values. astJson is optional and not needed; the expression is parsed at evaluation.

Operators: + - * / %, = == != < <= > >=, and/&&, or/||, not/!, unary minus, parentheses. Literals: numbers, quoted strings, true, false, null. No JavaScript, dotted member access, array literals or arbitrary scripts. Functions are case-insensitive: if(condition,yes,no), coalesce(...values), empty(value), round(number,precision), floor(number), ceil(number), abs(number), min(...numbers), max(...numbers), concat(...values), lower(text), upper(text), trim(text), length(text), contains(text,substring), today(), now(), year(date), month(date), quarter(date), weekday(date), dateadd(date,amount,unit), datesubtract(date,amount,unit), datebetween(first,second,unit). Date addition/subtraction units: day/days, month/months, year/years. datebetween supports day/days and hour/hours; other units return milliseconds.

Examples: [prop_units] * [prop_factor]; round([prop_units] / 3, 2); if([prop_units] > 0, "Ready", "Empty"). Functions evaluate all arguments, so if does not guard division by zero in workflow expressions. Do not rely on short-circuit boolean evaluation. Workflow division/modulo by zero fails atomically; ordinary computed properties currently return zero. Formula dependencies on other computed properties should appear earlier in property order.

Rollup config: {"rollup":{"relationPropertyId":"prop_station","targetPropertyId":"prop_units","aggregation":"sum"}}. The relation property belongs to the current database; the target property belongs to the related database. Use ordinary stored target values. Recursive rollups and rolling up computed target values are not supported by the current evaluator. filterAstJson is declared but not applied by the rollup evaluator. Relation traversal via dot syntax is not supported in formulas; create a rollup or use workflow property references.

## Quick Actions / workflows

```ts
/**
 * Workflow engine definitions, steps, runs, and execution contracts for Max v0.2.0.
 */

export type WorkflowStepType =
  | 'FOR_EACH'
  | 'SUM'
  | 'VALIDATE'
  | 'COMPUTE'
  | 'CREATE_RECORD'
  | 'FIND_RECORD'
  | 'UPDATE_RECORD'
  | 'RETURN_RESULT';

export type WorkflowStep = Readonly<{
  config: Readonly<Record<string, unknown>>;
  id: string;
  type: WorkflowStepType;
}>;

export type WorkflowInputType = 'number' | 'text' | 'string' | 'boolean' | 'date' | 'datetime' | 'record' | 'select' | 'collection';

/** Serializable references; database/property IDs are remappable workspace data. */
export type WorkflowValue =
  | Readonly<{ source: 'item'; field?: string }>
  | Readonly<{ source: 'index' }>
  | Readonly<{ source: 'literal'; value: unknown }>
  | Readonly<{ source: 'variable'; key: string }>
  | Readonly<{ source: 'property'; record: WorkflowValue; databaseId: string; propertyId: string }>
  | Readonly<{ source: 'expression'; expression: string; bindings: Readonly<Record<string, WorkflowValue>> }>;

export type WorkflowInputField = Readonly<{
  derived?: Readonly<{ value: WorkflowValue; allowOverride?: boolean }>;
  visibleWhen?: WorkflowValue;
  requiredWhen?: WorkflowValue;
  disabledWhen?: WorkflowValue;
  pickerFilter?: FilterNode;
  displayPropertyIds?: readonly string[];
  allowCreate?: boolean;
  fields?: readonly WorkflowInputField[]; // Scalar children only, for collection inputs
  minItems?: number;
  maxItems?: number; // Hard ceiling: 100
  prefill?: Readonly<{ inputKey: string; databaseId: string; propertyId: string }>;
  databaseId?: string; // For record pickers
  defaultValue?: unknown;
  id?: string;
  key?: string;
  label: string;
  options?: readonly Readonly<{ label: string; value: string }>[];
  propertySource?: Readonly<{ databaseId: string; propertyId: string }>;
  required?: boolean;
  type: WorkflowInputType;
}>;

export type WorkflowStepDraft = Readonly<{
  config: Readonly<Record<string, unknown>>;
  id?: string;
  type: WorkflowStepType;
}>;

export type WorkflowInputSchema = Readonly<{
  rules?: readonly WorkflowFormRule[];
  summary?: readonly Readonly<{ label: string; value: WorkflowValue }>[];
  fields: readonly WorkflowInputField[];
}>;

export type WorkspaceWorkflow = Readonly<{
  enabled: boolean;
  archivedAt?: string | null;
  createdAt: string;
  icon?: string | null;
  id: string;
  inputSchema: WorkflowInputSchema;
  kind: 'built_in' | 'custom';
  name: string;
  positionKey: string;
  resultSchema?: Readonly<Record<string, unknown>>;
  steps: readonly WorkflowStep[];
  updatedAt: string;
  version: number;
}>;

export type WorkspaceWorkflowDraft = Readonly<{
  enabled?: boolean;
  icon?: string | null;
  id?: string;
  inputSchema: WorkflowInputSchema;
  kind?: 'built_in' | 'custom';
  name: string;
  positionKey?: string;
  resultSchema?: Readonly<Record<string, unknown>>;
  steps: readonly (WorkflowStep | WorkflowStepDraft)[];
}>;

export type WorkflowRunStatus = 'completed' | 'failed' | 'rolled_back';

export type WorkspaceWorkflowRun = Readonly<{
  actorId: string;
  completedAt?: string | null;
  errorJson?: string | null;
  id: string;
  inputJson: string;
  resultJson?: string | null;
  startedAt: string;
  status: WorkflowRunStatus;
  workflowId: string;
  workflowVersion: number;
}>;

export type WorkflowExecutionInput = Readonly<{
  actorId?: string;
  inputs: Readonly<Record<string, unknown>>;
  testMode?: boolean;
  overrides?: readonly string[];
  evaluationToken?: string;
  confirmedWarnings?: readonly string[];
  workflowId: string;
}>;

export type WorkflowExecutionResult = Readonly<{
  completedAt: string;
  createdRecordIds: readonly string[];
  error?: string;
  result: Readonly<Record<string, unknown>>;
  runId: string;
  status: WorkflowRunStatus;
  workflowId: string;
}>;

export const WORKFLOW_MAX_ITEMS = 100;
export const WORKFLOW_MAX_EXECUTED_STEPS = 1000;

export type WorkflowFormRule = Readonly<{ id: string; condition: WorkflowValue; severity: 'INFO' | 'WARNING' | 'BLOCK'; message: string; collection?: WorkflowValue }>;
export type WorkflowFieldState = Readonly<{ visible: boolean; required: boolean; disabled: boolean; overridden: boolean; calculated?: unknown; error?: string; options?: readonly Readonly<{ id: string; title: string; secondary: string }>[] }>;
export type WorkflowFormEvaluation = Readonly<{
  values: Readonly<Record<string, unknown>>;
  fields: Readonly<Record<string, WorkflowFieldState>>;
  messages: readonly Readonly<{ id: string; severity: 'INFO' | 'WARNING' | 'BLOCK'; message: string }>[];
  summary: readonly Readonly<{ label: string; value: unknown }>[];
  token: string;
}>;
```

TemplateWorkflow is the serialized action shape; WorkspaceWorkflow is the generated runtime result. Only TemplateWorkflow fields are authored in workflows. enabled defaults true. Inputs support number/text/string/boolean/date/datetime/record/select. A record input requires databaseId and accepts a single record ID. A record defaultValue must name a seed record from that database. A select input uses options [{label,value}], or propertySource {databaseId,propertyId} to populate choices from the imported property options. Defaults are literal JSON, not expressions. Missing/null inputs fall back to defaults; required inputs reject missing/null/empty-string values.

Every workflow supports up to 100 inputs and 100 steps. Input and output variable names must be unique; now and actor_id are reserved built-ins. Reference only inputs or earlier outputs. Value references may nest at most 12 levels. Steps execute in array order.

Actual config fields by step:

```ts
// V means WorkflowValue; unwrapped strings are expressions ($name is a variable shortcut).
VALIDATE: { condition: string, errorMessage?: string }
FIND_RECORD: { databaseId: string, filter?: FilterNode, outputVariable: string, multiple?: boolean, required?: boolean }
COMPUTE: { outputVariable: string, value: V }
// Alternatives: { outputVariable: string, expression: string }, or { assignments: { [variable: string]: string } }
CREATE_RECORD: { databaseId: string, title?: V, properties?: { [propertyId: string]: V }, outputVariable?: string }
// titleExpression aliases title; propertyValues aliases properties. Default title: Untitled.
UPDATE_RECORD: { databaseId: string, record: V, properties?: { [propertyId: string]: V }, increments?: { [propertyId: string]: V }, outputVariable?: string }
RETURN_RESULT: { resultExpression: V }
// Alternative: { fieldName: "$variable", anotherField: "literal text" }.
```

Lookups support property filters and AND/OR groups, not relation-quantifier filters. Filter value/valueTo can be V. multiple defaults false: output is one record ID (null if no match and required:false). multiple:true outputs an ID array, capped at 10,000 matches. required defaults true. No lookup sorting or indexed access to a multiple-result array is implemented. Use a one-result lookup for property reads or updates.

COMPUTE expression bindings resolve selected/looked-up properties without dotted syntax. Example: {"source":"expression","expression":"[units] * [factor]","bindings":{"factor":{"source":"property","record":{"source":"variable","key":"selected"},"databaseId":"db_stations","propertyId":"prop_station_factor"}}}.

Create/update relation mappings accept a record ID, ID array, or null; these replace the related-record set. A prior CREATE_RECORD output is a record ID and can be used directly. Increment/decrement uses UPDATE_RECORD.increments with positive/negative finite numbers. UPDATE_RECORD.properties is the supported setter (do not use its create-only alias propertyValues). There are no loops, triggers, webhooks or external API steps. All action writes roll back on a failed later step; failure history is retained separately. Import stores actions but never executes them.

## Pages and seed data

contentJson is a JSON-encoded string, not a nested JSON object. It can contain an array of blocks or the current page envelope {blocks: [...], properties: [...], favorite: boolean, wiki: boolean}. The simplest empty page is "[]".

```ts
export type BlockType =
  | 'quote'
  | 'code'
  | 'toggle'
  | 'bullet'
  | 'callout'
  | 'columns'
  | 'database-view'
  | 'divider'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'number'
  | 'text'
  | 'todo';

export type NotionBlock = {
  calloutIcon?: string;
  checked?: boolean; // For todo items
  col1Blocks?: readonly NotionBlock[]; // For columns block (left)
  col2Blocks?: readonly NotionBlock[]; // For columns block (right)
  content: string;
  databaseId?: string;
  databaseKind?: 'accounts' | 'items' | 'people' | 'reconciliation' | 'transactions';
  id: string;
  type: BlockType;
  viewId?: string;
};


```

For a database block use {id:"block_entries",type:"database-view",content:"",databaseId:"db_entries",viewId:"view_entries"}. Omit legacy databaseKind entirely. Database visibility advanced is supported; it is not a security/access-control boundary. External attachment bytes, preferences, credentials and workspace permissions are not bundled.

Seed records use records: [{key,databaseKey,title,properties?,contentJson?,icon?}]. title is the record title, and properties maps property keys to values. Number: JSON number; checkbox: boolean; text/url/email/phone: string; select/status: option key; multi_select: option-key array; date: YYYY-MM-DD or {start:string,end?:string,hasTime?:boolean}; relation: seed record key(s). Required/unique properties and option ownership use normal record validation. Relations are connected after all records exist. Do not put workflow V wrappers in seed values. Do not provide computed values.

## Example and implementation references

Complete generic example: docs/examples/generic-workspace.max-blueprint.json. It contains two databases, three seeded records, a relation, select options, a formula, a filtered/sorted view with a total, a page, a record template and an action with validation, lookup, calculation, create, update and result steps. It is not a phone-shop template.

Authoritative files: src/shared/template-v2-contract.ts; src/shared/property-contract.ts; src/shared/view-contract.ts; src/shared/query-contract.ts; src/shared/workflow-contract.ts; src/main/ipc/workspace-input-parsers.ts (parseWorkspaceTemplateV2); src/main/database/workspace-template-service.ts; src/main/database/workflow-service.ts; src/main/database/formula/{tokenizer,parser,evaluator}.ts; src/main/database/computed-property-service.ts. No Prisma models or Zod schemas define this format: TypeScript types and imperative validators do.

## BLUEPRINT AUTHORING CONTRACT

Use the exact Template* types and enums above. Settings accepts version 2. Canonical top level: {version:2,name:string,databases:TemplateDatabase[],relations:TemplateRelation[],author?:string,description?:string,pages?:TemplatePage[],records?:TemplateRecord[],recordTemplates?:TemplateRecordTemplate[],workflows?:TemplateWorkflow[]}. No other top-level fields. Keys are globally unique and remapped to fresh IDs. Use [property_key] in formulas. Use WorkflowValue for dynamic action mappings and outputVariable names for prior results. Seed records are literal property maps, relations reference other seed keys, options reference option keys. Import never executes actions.

Minimal valid generic file:
```json
{"version":2,"name":"Blank structure","databases":[],"relations":[]}
```

### Page links and additional content blocks

Page content remains a JSON-encoded block array (or the existing blocks envelope). Each block has `id`, `type`, and `content`. Additional supported types are `page-link`, `embed`, `bookmark`, `image`, `video`, `audio`, `file`, `simple-table`, and `table-of-contents`.

- `page-link`: `pageId` references a page key in the blueprint. Import remaps it to the created page ID.
- Inline page link: `[Label](max-page:pageKey)` in text content; URL-encode the page key. Import remaps this reference. Referenced pages must be included in the blueprint.
- Media, bookmark and file blocks: `url` is an HTTP(S) URL; optional `caption` is text. Remote media requires explicit loading and an internet connection; it is not bundled in the blueprint.
- `simple-table`: `cells` is an array of arrays of strings.
- `table-of-contents`: generated from the page heading blocks.

Backlinks and graph edges are derived from page links; never serialize them as independent blueprint objects.

### Page icons and icon colors

`TemplatePage.icon` is optional and round-trips through Blueprint v2 export/import. It accepts either an emoji string or the same Lucide encoding used by Max's page icon picker:

```json
{
  "key": "page_projects",
  "title": "Projects",
  "icon": "lucide:Folder#337ea9",
  "contentJson": "[]"
}
```

Use `lucide:IconName` for an uncoloured Lucide icon, or append `#RRGGBB` for its color. The picker palette values are `9b9a97` (gray), `937264` (brown), `e8a24b` (yellow), `d9730d` (orange), `4d9b68` (green), `337ea9` (blue), `9065b0` (purple), `c14c8a` (pink), and `d44c47` (red). Emoji icons do not have a separate color field. Do not add `iconColor`; the color belongs in the `icon` string.

## Current UI and import compatibility

- Import/export lives in **Settings → Danger → Blueprint**. Choose Import blueprint, load or paste the JSON, preview it, then import. Preview runs the real importer inside a rollback boundary.
- The ready-to-use generic example is `docs/examples/generic-workspace.max-blueprint.json`. It is not a phone-shop template.
- Record templates are authored in the `recordTemplates` array. Their array order within each database is their import order. Export emits them in saved display order; do not add a `positionKey` field to a record-template definition.
- Select/multi-select option array order is preserved. Saved-view property order and visibility remain in `propertyState.columns`; UI reordering does not change IDs.
- Page links, additional media blocks, template block content, template defaults, formulas, relations, seed records, and configured actions use the reference rules above.
- Graph visibility, graph filters/colors/zoom, appearance, and device UI preferences are local settings, not blueprint fields. Graph filters can query imported page titles, paths, properties and content, but their current filter/group selections are device-local. Backlinks and node sizes are derived; never author those into the blueprint. A page node uses its imported page-icon color unless a local graph color group overrides it.
- URL, email, and phone are ordinary supported property types. A type appearing in the engine enum does not establish a complete editing UI: user/person assignment, attachments, button actions, generated IDs, and author/time metadata need further product support. Place is not supported. Do not invent Notion-compatible schemas for these features.

Verification: the included generic example passed the current parser, transactional preview, real import into a disposable SQLite workspace, export, and import into a second disposable workspace. Each imported 2 databases, 10 properties, 3 records, 1 page, 1 relation and 1 workflow. This verifies that scenario, not every possible blueprint.


## Repeatable Quick Actions (Blueprint v2)

No blueprint version bump or database migration is required. Existing scalar actions keep their format.

A collection input has type "collection", fields (1–100 scalar child inputs), optional minItems/maxItems (integers 0–100; default maximum 100), and optional defaultValue (array of row objects keyed by child key). required implies at least one row. Nested collection inputs are not supported. Child types: text, string, number, boolean, date, datetime, select, record. Each child supports existing defaults/options/databaseId/required.

A scalar child may set prefill: {inputKey, databaseId, propertyId}. inputKey must identify an earlier sibling record input in that database. Missing or empty values are filled from its selected record property. Changing the picker in the form refreshes dependent fields; users may then override them. References and seeded record defaults are remapped on blueprint import, including nested child fields.

WorkflowValue additionally accepts {"source":"item"} (whole current item), {"source":"item","field":"quantity"} (direct child key), and {"source":"index"} (zero-based index). These are valid only inside iteration/SUM expressions. There is no dotted-path evaluation.

FOR_EACH config: {collection: WorkflowValue, steps: WorkflowStep[], outputVariable?: string, yield?: WorkflowValue}. Child steps see outer inputs and earlier outer outputs. Each iteration has isolated local outputs. yield is evaluated after its child steps; when outputVariable is supplied, yield is required and the output is the ordered array of yielded values. Collect record IDs to assign a later relation. Only the innermost item/index is directly accessible.

SUM config: {collection: WorkflowValue, value: WorkflowValue, outputVariable: string}. value must resolve to a finite number for every item; an empty array produces 0. For example:

```json
{"id":"sum","type":"SUM","config":{"collection":{"source":"variable","key":"rows"},"outputVariable":"grandTotal","value":{"source":"expression","expression":"q * r","bindings":{"q":{"source":"item","field":"quantity"},"r":{"source":"item","field":"rate"}}}}}
```

All iterations and outer steps share one transaction. A failure rolls back every record/relation mutation; failed-run audit may still be recorded. Limits: 100 items per collection, 100 configured steps including children, loop depth 3, and 1,000 executed steps/item evaluations across the entire run. Invalid collection shapes, missing required row values, deleted database/property references and out-of-scope variables reject execution. Use unique step IDs and safe unique input/output names; __proto__, constructor, prototype, __item and __index are reserved.

Executable generic proof: src/main/database/workflow-collections.integration.test.ts defines Nodes, Entries and Summaries with record/quantity/rate rows, per-row computation and creation, collected relations, a grand total, rollback and blueprint roundtrip. Runtime picker/default/add/remove coverage is in src/renderer/workflows/workflow-input-form.unit.test.tsx.


## Reactive fields, guards and live previews (Blueprint v2)

All additions are optional and belong to the existing workflow inputSchema. No version bump or migration. WorkflowValue uses the same sources and formula syntax as workflow steps. In child fields, source:item/field addresses a sibling row value; source:variable/key addresses an outer input. Derived dependencies resolve in dependency order; cycles are rejected.

Field additions:

```ts
derived?: { value: WorkflowValue; allowOverride?: boolean };
visibleWhen?: WorkflowValue;
requiredWhen?: WorkflowValue;
disabledWhen?: WorkflowValue;
pickerFilter?: FilterNode;
displayPropertyIds?: string[]; // maximum 3; properties of databaseId
allowCreate?: boolean; // record inputs only, opt-in
```

- derived is scalar-only, mutually exclusive with legacy prefill. Without allowOverride it is read-only. With allowOverride, editing latches the override until Reset calculated value. Changing dependencies never overwrites a latched override. Existing prefill remains available unchanged.
- Conditional expressions must resolve to booleans. required and requiredWhen combine with OR. Hidden fields retain their values but skip required/type checks; hidden collections also hide child validation. Disabled fields retain their values and still validate. The ordinary workflow validates actual database writes.
- pickerFilter uses normal property filters and AND/OR groups. Its value/valueTo may be literals or WorkflowValue objects. Relation-quantifier filters are not supported in pickers. Deleted properties/databases reject configuration/execution. A selected record that ceases to match the filter blocks submission instead of silently changing selection. A picker must match fewer than 10,000 records; narrow its filter otherwise.
- allowCreate uses the normal validated record-creation API with a compact unsaved draft. The explicit Create and select action saves the new record immediately and independently of the subsequent workflow. Cancelling the Quick Action does not remove that record. Inline creation supports the existing editable scalar and option properties; relation assignment, attachments and user assignment are not added to this draft editor.

inputSchema additions:

```ts
rules?: { id: string; condition: WorkflowValue; severity: 'INFO' | 'WARNING' | 'BLOCK'; message: string; collection?: WorkflowValue }[];
summary?: { label: string; value: WorkflowValue }[];
```

At most 30 rules and 30 summary items. Rule IDs must be unique. A true condition activates the message. Optional collection evaluates a rule once per row with item/index in scope. INFO is informational; WARNING requires explicit confirmation; BLOCK never offers Continue. Summary values are read-only expression results, not proposed database writes. Examples:

```json
{
  "derived": {
    "allowOverride": true,
    "value": {"source":"expression","expression":"a * r","bindings":{
      "a":{"source":"variable","key":"amount"},
      "r":{"source":"property","record":{"source":"variable","key":"record"},"databaseId":"sources","propertyId":"rate"}
    }}
  },
  "requiredWhen": {"source":"expression","expression":"a > 10","bindings":{"a":{"source":"variable","key":"amount"}}}
}
```

Form-time evaluation is read-only backend evaluation, debounced by the UI; it never runs stored workflow steps. All writes still use the existing atomic workflow transaction. The execution API requires the returned evaluationToken for actions with new form behavior, plus confirmedWarnings containing the active warning IDs. overrides is an array of JSON-encoded field paths: ["calculated"] for a scalar, ["rows",1,"rate"] for the second row. Do not serialize these runtime tokens/override paths or evaluated field states into blueprints.

Execution re-evaluates the form and compares its token before any workflow writes. Changed derived values, summaries, conditions, schema versions or warnings require a fresh review; overrides are preserved. now()/today() use a server-held form clock for up to 30 minutes, carried by the evaluation token. Tokens are ephemeral; reopening/restarting refreshes the preview. Existing scalar actions without these additions need no token.

Blueprint import recursively remaps database/property IDs in derived values, conditions, picker filters, displayPropertyIds, guards and summaries; it preserves all inputSchema fields. All referenced databases/properties must be included. Proof fixtures: src/main/database/workflow-reactive.fixture.ts, src/main/database/workflow-reactive.integration.test.ts and tests/workflow-reactive-ui.unit.test.tsx.
