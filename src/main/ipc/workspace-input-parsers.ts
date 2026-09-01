import type { WorkspaceDatabaseDraft, WorkspaceDatabasePatch } from '../../shared/database-contract';
import {
  PROPERTY_TYPES,
  type PropertyOptionDraft,
  type PropertyType,
  type StatusGroupDraft,
  type TypeConversionStrategy,
  type WorkspacePropertyDraft,
  type WorkspacePropertyPatch,
  type WorkspaceRecordDraft,
  type WorkspaceRecordPatch,
} from '../../shared/property-contract';
import type {
  DatabaseQueryParams,
  FilterNode,
  GroupRule,
  SortRule,
} from '../../shared/query-contract';
import type { WorkspaceRelationDraft } from '../../shared/relation-contract';
import type { WorkspaceTemplateV2 } from '../../shared/template-v2-contract';
import type {
  PropertyViewState,
  ViewLayout,
  WorkspaceViewDraft,
  WorkspaceViewPatch,
} from '../../shared/view-contract';
import type {
  WorkflowExecutionInput,
  WorkflowInputField,
  WorkflowStepDraft,
  WorkspaceWorkflowDraft,
} from '../../shared/workflow-contract';
import {
  WorkspaceDomainError,
  type WorkspaceNodeDraft,
  type WorkspaceNodePatch,
} from '../../shared/workspace-contract';

type JsonRecord = Record<string, unknown>;

const VIEW_LAYOUTS: readonly ViewLayout[] = [
  'table', 'list', 'board', 'calendar', 'gallery', 'timeline', 'chart', 'map', 'form',
];
const FILTER_OPERATORS = [
  'equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with',
  'greater_than', 'greater_than_or_equal', 'less_than', 'less_than_or_equal',
  'is_empty', 'is_not_empty', 'is_checked', 'is_not_checked', 'relative_date',
  'before_date', 'after_date', 'between_dates', 'in_options', 'not_in_options',
] as const;
const RELATIVE_PERIODS = [
  'TODAY', 'YESTERDAY', 'TOMORROW', 'THIS_WEEK', 'LAST_WEEK', 'NEXT_WEEK',
  'THIS_MONTH', 'LAST_MONTH', 'NEXT_MONTH', 'THIS_QUARTER', 'LAST_QUARTER',
  'NEXT_QUARTER', 'THIS_YEAR', 'LAST_YEAR', 'NEXT_YEAR', 'LAST_N_DAYS',
  'NEXT_N_DAYS', 'LAST_N_WEEKS', 'NEXT_N_WEEKS', 'LAST_N_MONTHS',
  'NEXT_N_MONTHS', 'WEEKDAY',
] as const;
const CALCULATIONS = [
  'sum', 'avg', 'min', 'max', 'count', 'count_values', 'count_empty', 'count_unique',
  'checked', 'unchecked', 'percent_checked', 'earliest', 'latest',
] as const;
const WORKFLOW_STEP_TYPES = [
  'VALIDATE', 'COMPUTE', 'CREATE_RECORD', 'SET_PROPERTY', 'CREATE_RELATION',
  'REMOVE_RELATION', 'ARCHIVE_RECORD', 'IF', 'CALCULATE_FEES', 'RETURN_RESULT',
] as const;
const WORKFLOW_INPUT_TYPES = ['number', 'money', 'text', 'string', 'boolean', 'date', 'record', 'select'] as const;

function invalid(message: string): never {
  throw new WorkspaceDomainError('invalid-input', message);
}

function isObject(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertObject(value: unknown, label: string): asserts value is JsonRecord {
  if (!isObject(value)) invalid(`${label} must be an object.`);
}

function assertString(value: unknown, label: string, options: { max?: number; optional?: boolean } = {}): void {
  if (options.optional && value === undefined) return;
  if (typeof value !== 'string' || value.length < 1 || value.length > (options.max ?? 500)) {
    invalid(`${label} must be a non-empty string.`);
  }
}

function assertNullableString(value: unknown, label: string): void {
  if (value !== undefined && value !== null) assertString(value, label);
}

function assertOptionalBoolean(value: unknown, label: string): void {
  if (value !== undefined && typeof value !== 'boolean') invalid(`${label} must be a boolean.`);
}

function assertOptionalFiniteNumber(value: unknown, label: string): void {
  if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
    invalid(`${label} must be a finite number.`);
  }
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && options.some((option) => option === value);
}

function assertJsonValue(value: unknown, label: string, depth = 0): void {
  if (depth > 30) invalid(`${label} is nested too deeply.`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid(`${label} contains a non-finite number.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonValue(entry, `${label}[${index}]`, depth + 1));
    return;
  }
  if (isObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (key.length > 200) invalid(`${label} contains an invalid key.`);
      assertJsonValue(entry, `${label}.${key}`, depth + 1);
    }
    return;
  }
  invalid(`${label} must contain only JSON values.`);
}

function assertJsonObject(value: unknown, label: string): asserts value is JsonRecord {
  assertObject(value, label);
  assertJsonValue(value, label);
}

function assertOptionalId(value: unknown, label: string): void {
  if (value !== undefined && value !== null) assertString(value, label, { max: 120 });
}

function assertSortRules(value: unknown, label: string): asserts value is readonly SortRule[] {
  if (!Array.isArray(value)) invalid(`${label} must be an array.`);
  value.forEach((rule, index) => {
    assertObject(rule, `${label}[${index}]`);
    assertString(rule.propertyId, `${label}[${index}].propertyId`, { max: 120 });
    if (!isOneOf(rule.direction, ['asc', 'desc'])) invalid(`${label}[${index}].direction is invalid.`);
    assertOptionalBoolean(rule.nullsFirst, `${label}[${index}].nullsFirst`);
  });
}

function assertGroupRule(value: unknown, label: string): asserts value is GroupRule {
  assertObject(value, label);
  assertString(value.propertyId, `${label}.propertyId`, { max: 120 });
  assertOptionalBoolean(value.collapsed, `${label}.collapsed`);
  if (value.dateGranularity !== undefined && !isOneOf(value.dateGranularity, ['day', 'week', 'month', 'quarter', 'year'])) {
    invalid(`${label}.dateGranularity is invalid.`);
  }
}

function assertFilterNode(value: unknown, label: string, depth = 0): asserts value is FilterNode {
  if (depth > 20) invalid(`${label} is nested too deeply.`);
  assertObject(value, label);
  if (value.kind === 'group') {
    if (!isOneOf(value.operator, ['AND', 'OR'])) invalid(`${label}.operator is invalid.`);
    if (!Array.isArray(value.conditions) || value.conditions.length > 100) invalid(`${label}.conditions is invalid.`);
    value.conditions.forEach((condition, index) => assertFilterNode(condition, `${label}.conditions[${index}]`, depth + 1));
    return;
  }
  if (value.kind === 'property') {
    assertString(value.propertyId, `${label}.propertyId`, { max: 120 });
    if (!isOneOf(value.operator, FILTER_OPERATORS)) invalid(`${label}.operator is invalid.`);
    if (value.relativePeriod !== undefined && !isOneOf(value.relativePeriod, RELATIVE_PERIODS)) {
      invalid(`${label}.relativePeriod is invalid.`);
    }
    assertOptionalFiniteNumber(value.relativeValue, `${label}.relativeValue`);
    if (value.value !== undefined) assertJsonValue(value.value, `${label}.value`);
    if (value.valueTo !== undefined) assertJsonValue(value.valueTo, `${label}.valueTo`);
    return;
  }
  if (value.kind === 'relation') {
    assertString(value.relationPropertyId, `${label}.relationPropertyId`, { max: 120 });
    if (!isOneOf(value.quantifier, ['ANY', 'ALL', 'NONE'])) invalid(`${label}.quantifier is invalid.`);
    assertFilterNode(value.targetFilter, `${label}.targetFilter`, depth + 1);
    return;
  }
  invalid(`${label}.kind is invalid.`);
}

function assertPropertyOptions(value: unknown, label: string): asserts value is readonly PropertyOptionDraft[] {
  if (!Array.isArray(value)) invalid(`${label} must be an array.`);
  value.forEach((option, index) => {
    assertObject(option, `${label}[${index}]`);
    assertOptionalId(option.id, `${label}[${index}].id`);
    assertString(option.label, `${label}[${index}].label`, { max: 200 });
    if (option.positionKey !== undefined) assertString(option.positionKey, `${label}[${index}].positionKey`, { max: 120 });
    assertOptionalId(option.statusGroupId, `${label}[${index}].statusGroupId`);
    if (option.style !== undefined) {
      assertObject(option.style, `${label}[${index}].style`);
      assertNullableString(option.style.background, `${label}[${index}].style.background`);
      assertNullableString(option.style.color, `${label}[${index}].style.color`);
    }
  });
}

function assertStatusGroups(value: unknown, label: string): asserts value is readonly StatusGroupDraft[] {
  if (!Array.isArray(value)) invalid(`${label} must be an array.`);
  value.forEach((group, index) => {
    assertObject(group, `${label}[${index}]`);
    if (!isOneOf(group.category, ['NOT_STARTED', 'ACTIVE', 'COMPLETE'])) invalid(`${label}[${index}].category is invalid.`);
    assertOptionalId(group.id, `${label}[${index}].id`);
    assertString(group.label, `${label}[${index}].label`, { max: 200 });
    if (group.positionKey !== undefined) assertString(group.positionKey, `${label}[${index}].positionKey`, { max: 120 });
  });
}

function assertPropertyBody(value: JsonRecord, label: string): void {
  if (value.config !== undefined) assertJsonObject(value.config, `${label}.config`);
  assertNullableString(value.defaultValueJson, `${label}.defaultValueJson`);
  if (value.name !== undefined) assertString(value.name, `${label}.name`, { max: 200 });
  if (value.options !== undefined) assertPropertyOptions(value.options, `${label}.options`);
  if (value.positionKey !== undefined) assertString(value.positionKey, `${label}.positionKey`, { max: 120 });
  assertOptionalBoolean(value.required, `${label}.required`);
  if (value.statusGroups !== undefined) assertStatusGroups(value.statusGroups, `${label}.statusGroups`);
  assertOptionalBoolean(value.uniqueValue, `${label}.uniqueValue`);
}

function assertRecordBody(value: JsonRecord, label: string): void {
  assertNullableString(value.contentJson, `${label}.contentJson`);
  assertNullableString(value.icon, `${label}.icon`);
  if (value.positionKey !== undefined) assertString(value.positionKey, `${label}.positionKey`, { max: 120 });
  if (value.properties !== undefined) assertJsonObject(value.properties, `${label}.properties`);
  assertOptionalId(value.templateId, `${label}.templateId`);
  if (value.title !== undefined) assertString(value.title, `${label}.title`, { max: 500 });
}

function assertPropertyViewState(value: unknown, label: string): asserts value is PropertyViewState {
  assertObject(value, label);
  if (!Array.isArray(value.columns)) invalid(`${label}.columns must be an array.`);
  value.columns.forEach((column, index) => {
    assertObject(column, `${label}.columns[${index}]`);
    assertString(column.propertyId, `${label}.columns[${index}].propertyId`, { max: 120 });
    assertOptionalBoolean(column.hidden, `${label}.columns[${index}].hidden`);
    assertOptionalBoolean(column.wrap, `${label}.columns[${index}].wrap`);
    assertOptionalFiniteNumber(column.width, `${label}.columns[${index}].width`);
  });
  assertOptionalId(value.coverPropertyId, `${label}.coverPropertyId`);
  assertOptionalId(value.datePropertyId, `${label}.datePropertyId`);
  assertOptionalId(value.groupPropertyId, `${label}.groupPropertyId`);
}

function assertViewBody(value: JsonRecord, label: string): void {
  if (value.filterAst !== undefined && value.filterAst !== null) assertFilterNode(value.filterAst, `${label}.filterAst`);
  if (value.group !== undefined && value.group !== null) assertGroupRule(value.group, `${label}.group`);
  if (value.layout !== undefined && !isOneOf(value.layout, VIEW_LAYOUTS)) invalid(`${label}.layout is invalid.`);
  if (value.layoutConfig !== undefined) assertJsonObject(value.layoutConfig, `${label}.layoutConfig`);
  if (value.name !== undefined) assertString(value.name, `${label}.name`, { max: 200 });
  if (value.positionKey !== undefined) assertString(value.positionKey, `${label}.positionKey`, { max: 120 });
  if (value.propertyState !== undefined) assertPropertyViewState(value.propertyState, `${label}.propertyState`);
  if (value.sorts !== undefined) assertSortRules(value.sorts, `${label}.sorts`);
}

function assertWorkflowInputField(value: unknown, label: string): asserts value is WorkflowInputField {
  assertObject(value, label);
  assertOptionalId(value.databaseId, `${label}.databaseId`);
  if (value.defaultValue !== undefined) assertJsonValue(value.defaultValue, `${label}.defaultValue`);
  assertOptionalId(value.id, `${label}.id`);
  if (value.key !== undefined) assertString(value.key, `${label}.key`, { max: 120 });
  assertString(value.label, `${label}.label`, { max: 200 });
  if (!isOneOf(value.type, WORKFLOW_INPUT_TYPES)) invalid(`${label}.type is invalid.`);
  assertOptionalBoolean(value.required, `${label}.required`);
  if (value.options !== undefined) {
    if (!Array.isArray(value.options)) invalid(`${label}.options must be an array.`);
    value.options.forEach((option, index) => {
      assertObject(option, `${label}.options[${index}]`);
      assertString(option.label, `${label}.options[${index}].label`, { max: 200 });
      assertString(option.value, `${label}.options[${index}].value`, { max: 500 });
    });
  }
  if (value.propertySource !== undefined) {
    assertObject(value.propertySource, `${label}.propertySource`);
    assertString(value.propertySource.databaseId, `${label}.propertySource.databaseId`, { max: 120 });
    assertString(value.propertySource.propertyId, `${label}.propertySource.propertyId`, { max: 120 });
  }
}

function assertWorkflowStep(value: unknown, label: string): asserts value is WorkflowStepDraft {
  assertObject(value, label);
  assertOptionalId(value.id, `${label}.id`);
  if (!isOneOf(value.type, WORKFLOW_STEP_TYPES)) invalid(`${label}.type is invalid.`);
  assertJsonObject(value.config, `${label}.config`);
}

function assertWorkflowBody(value: JsonRecord, label: string): void {
  assertNullableString(value.icon, `${label}.icon`);
  if (value.inputSchema !== undefined) {
    assertObject(value.inputSchema, `${label}.inputSchema`);
    if (!Array.isArray(value.inputSchema.fields)) invalid(`${label}.inputSchema.fields must be an array.`);
    value.inputSchema.fields.forEach((field, index) => assertWorkflowInputField(field, `${label}.inputSchema.fields[${index}]`));
  }
  if (value.kind !== undefined && !isOneOf(value.kind, ['built_in', 'custom'])) invalid(`${label}.kind is invalid.`);
  if (value.name !== undefined) assertString(value.name, `${label}.name`, { max: 200 });
  if (value.positionKey !== undefined) assertString(value.positionKey, `${label}.positionKey`, { max: 120 });
  if (value.resultSchema !== undefined) assertJsonObject(value.resultSchema, `${label}.resultSchema`);
  if (value.steps !== undefined) {
    if (!Array.isArray(value.steps)) invalid(`${label}.steps must be an array.`);
    value.steps.forEach((step, index) => assertWorkflowStep(step, `${label}.steps[${index}]`));
  }
}

export function parseWorkspaceNodeDraft(value: unknown): WorkspaceNodeDraft {
  assertObject(value, 'Workspace node');
  if (!isOneOf(value.kind, ['page', 'database', 'record'])) invalid('Workspace node kind is invalid.');
  assertString(value.title, 'Workspace node title', { max: 500 });
  assertOptionalId(value.id, 'Workspace node id');
  assertOptionalId(value.parentNodeId, 'Workspace node parent');
  assertNullableString(value.icon, 'Workspace node icon');
  if (value.contentJson !== undefined) assertString(value.contentJson, 'Workspace node content', { max: 2_000_000 });
  if (value.positionKey !== undefined) assertString(value.positionKey, 'Workspace node position', { max: 120 });
  return value as WorkspaceNodeDraft;
}

export function parseWorkspaceNodePatch(value: unknown): WorkspaceNodePatch {
  assertObject(value, 'Workspace node patch');
  assertOptionalId(value.parentNodeId, 'Workspace node parent');
  assertNullableString(value.icon, 'Workspace node icon');
  if (value.contentJson !== undefined) assertString(value.contentJson, 'Workspace node content', { max: 2_000_000 });
  if (value.positionKey !== undefined) assertString(value.positionKey, 'Workspace node position', { max: 120 });
  if (value.title !== undefined) assertString(value.title, 'Workspace node title', { max: 500 });
  return value;
}

export function parseWorkspaceDatabaseDraft(value: unknown): WorkspaceDatabaseDraft {
  assertObject(value, 'Database');
  assertString(value.title, 'Database title', { max: 500 });
  assertOptionalId(value.id, 'Database id');
  assertOptionalId(value.defaultViewId, 'Database default view');
  assertOptionalId(value.parentNodeId, 'Database parent');
  assertNullableString(value.icon, 'Database icon');
  if (value.positionKey !== undefined) assertString(value.positionKey, 'Database position', { max: 120 });
  if (value.visibility !== undefined && !isOneOf(value.visibility, ['normal', 'advanced'])) invalid('Database visibility is invalid.');
  return value as WorkspaceDatabaseDraft;
}

export function parseWorkspaceDatabasePatch(value: unknown): WorkspaceDatabasePatch {
  assertObject(value, 'Database patch');
  assertOptionalId(value.defaultViewId, 'Database default view');
  assertNullableString(value.icon, 'Database icon');
  if (value.title !== undefined) assertString(value.title, 'Database title', { max: 500 });
  if (value.visibility !== undefined && !isOneOf(value.visibility, ['normal', 'advanced'])) invalid('Database visibility is invalid.');
  return value;
}

export function parseWorkspacePropertyDraft(value: unknown): WorkspacePropertyDraft {
  assertObject(value, 'Property');
  assertPropertyBody(value, 'Property');
  assertString(value.databaseId, 'Property database id', { max: 120 });
  assertOptionalId(value.id, 'Property id');
  assertString(value.name, 'Property name', { max: 200 });
  if (!isOneOf(value.type, PROPERTY_TYPES)) invalid('Property type is invalid.');
  return value as WorkspacePropertyDraft;
}

export function parseWorkspacePropertyPatch(value: unknown): WorkspacePropertyPatch {
  assertObject(value, 'Property patch');
  assertPropertyBody(value, 'Property patch');
  return value;
}

export function parseWorkspaceRecordDraft(value: unknown): WorkspaceRecordDraft {
  assertObject(value, 'Record');
  assertRecordBody(value, 'Record');
  assertString(value.databaseId, 'Record database id', { max: 120 });
  assertOptionalId(value.id, 'Record id');
  assertString(value.title, 'Record title', { max: 500 });
  return value as WorkspaceRecordDraft;
}

export function parseWorkspaceRecordPatch(value: unknown): WorkspaceRecordPatch {
  assertObject(value, 'Record patch');
  assertRecordBody(value, 'Record patch');
  return value;
}

export function parseWorkspaceRecordDrafts(value: unknown): readonly WorkspaceRecordDraft[] {
  if (!Array.isArray(value) || value.length > 10_000) invalid('Records must be an array of at most 10,000 entries.');
  return value.map((record) => parseWorkspaceRecordDraft(record));
}

export function parseWorkspaceRelationDraft(value: unknown): WorkspaceRelationDraft {
  assertObject(value, 'Relation');
  assertOptionalId(value.id, 'Relation id');
  assertOptionalId(value.inversePropertyId, 'Relation inverse property id');
  assertString(value.sourceDatabaseId, 'Relation source database id', { max: 120 });
  assertString(value.sourcePropertyId, 'Relation source property id', { max: 120 });
  assertString(value.targetDatabaseId, 'Relation target database id', { max: 120 });
  assertNullableString(value.inversePropertyName, 'Relation inverse property name');
  if (value.sourceCardinality !== undefined && !isOneOf(value.sourceCardinality, ['one', 'many'])) invalid('Source cardinality is invalid.');
  if (value.targetCardinality !== undefined && !isOneOf(value.targetCardinality, ['one', 'many'])) invalid('Target cardinality is invalid.');
  return value as WorkspaceRelationDraft;
}

export function parseWorkspaceViewDraft(value: unknown): WorkspaceViewDraft {
  assertObject(value, 'View');
  assertViewBody(value, 'View');
  assertString(value.databaseId, 'View database id', { max: 120 });
  assertOptionalId(value.id, 'View id');
  assertString(value.name, 'View name', { max: 200 });
  assertOptionalId(value.ownerId, 'View owner id');
  if (value.ownerType !== undefined && !isOneOf(value.ownerType, ['database', 'block'])) invalid('View owner type is invalid.');
  return value as WorkspaceViewDraft;
}

export function parseWorkspaceViewPatch(value: unknown): WorkspaceViewPatch {
  assertObject(value, 'View patch');
  assertViewBody(value, 'View patch');
  return value;
}

export function parseDatabaseQueryParams(value: unknown): DatabaseQueryParams {
  assertObject(value, 'Database query');
  assertString(value.databaseId, 'Database query id', { max: 120 });
  assertNullableString(value.cursor, 'Database query cursor');
  if (value.filter !== undefined && value.filter !== null) assertFilterNode(value.filter, 'Database query filter');
  if (value.group !== undefined && value.group !== null) assertGroupRule(value.group, 'Database query group');
  if (value.limit !== undefined && (typeof value.limit !== 'number' || !Number.isInteger(value.limit) || value.limit < 1 || value.limit > 500)) {
    invalid('Database query limit must be between 1 and 500.');
  }
  if (value.requestedPropertyIds !== undefined) {
    if (!Array.isArray(value.requestedPropertyIds)) invalid('Requested property ids must be an array.');
    value.requestedPropertyIds.forEach((id, index) => assertString(id, `Requested property id ${index}`, { max: 120 }));
  }
  if (value.search !== undefined && (typeof value.search !== 'string' || value.search.length > 500)) invalid('Database search is invalid.');
  if (value.sorts !== undefined) assertSortRules(value.sorts, 'Database query sorts');
  if (value.calculations !== undefined) {
    if (!Array.isArray(value.calculations)) invalid('Database calculations must be an array.');
    value.calculations.forEach((calculation, index) => {
      assertObject(calculation, `Database calculation ${index}`);
      assertString(calculation.propertyId, `Database calculation ${index} property`, { max: 120 });
      if (!isOneOf(calculation.calculation, CALCULATIONS)) invalid(`Database calculation ${index} is invalid.`);
    });
  }
  return value as DatabaseQueryParams;
}

export function parseWorkspaceWorkflowDraft(value: unknown): WorkspaceWorkflowDraft {
  assertObject(value, 'Workflow');
  assertWorkflowBody(value, 'Workflow');
  assertOptionalId(value.id, 'Workflow id');
  assertString(value.name, 'Workflow name', { max: 200 });
  if (value.inputSchema === undefined || value.steps === undefined) invalid('Workflow input schema and steps are required.');
  return value as WorkspaceWorkflowDraft;
}

export function parseWorkspaceWorkflowPatch(value: unknown): Partial<WorkspaceWorkflowDraft> {
  assertObject(value, 'Workflow patch');
  assertWorkflowBody(value, 'Workflow patch');
  assertOptionalId(value.id, 'Workflow id');
  return value;
}

export function parseWorkflowExecutionInput(value: unknown): WorkflowExecutionInput {
  assertObject(value, 'Workflow execution');
  assertString(value.workflowId, 'Workflow id', { max: 120 });
  assertOptionalId(value.actorId, 'Workflow actor id');
  assertOptionalBoolean(value.testMode, 'Workflow test mode');
  assertJsonObject(value.inputs, 'Workflow inputs');
  return value as WorkflowExecutionInput;
}

export function parsePropertyType(value: unknown): PropertyType {
  if (!isOneOf(value, PROPERTY_TYPES)) invalid('Property type is invalid.');
  return value;
}

export function parseTypeConversionStrategy(value: unknown): TypeConversionStrategy | undefined {
  if (value === undefined) return undefined;
  if (!isOneOf(value, ['convert_all', 'first_value', 'set_null'])) invalid('Type conversion strategy is invalid.');
  return value;
}

export function parseDuplicateDatabaseOptions(value: unknown): { includeRecords?: boolean; title?: string } | undefined {
  if (value === undefined) return undefined;
  assertObject(value, 'Database duplication options');
  assertOptionalBoolean(value.includeRecords, 'Include records');
  if (value.title !== undefined) assertString(value.title, 'Duplicate database title', { max: 500 });
  return value;
}

export function parseWorkspaceTemplateV2(value: unknown): WorkspaceTemplateV2 {
  assertObject(value, 'Workspace template');
  if (value.version !== 2) invalid('Workspace template version must be 2.');
  assertString(value.name, 'Workspace template name', { max: 200 });
  assertNullableString(value.author, 'Workspace template author');
  assertNullableString(value.description, 'Workspace template description');
  if (!Array.isArray(value.databases) || !Array.isArray(value.relations)) invalid('Workspace template databases and relations are required.');
  value.databases.forEach((database, databaseIndex) => {
    assertObject(database, `Template database ${databaseIndex}`);
    assertString(database.key, `Template database ${databaseIndex} key`, { max: 120 });
    assertString(database.title, `Template database ${databaseIndex} title`, { max: 500 });
    assertNullableString(database.icon, `Template database ${databaseIndex} icon`);
    if (database.visibility !== undefined && !isOneOf(database.visibility, ['normal', 'advanced'])) invalid('Template database visibility is invalid.');
    if (!Array.isArray(database.properties) || !Array.isArray(database.views)) invalid('Template database properties and views are required.');
    database.properties.forEach((property, propertyIndex) => {
      assertObject(property, `Template property ${databaseIndex}.${propertyIndex}`);
      assertString(property.key, `Template property ${databaseIndex}.${propertyIndex} key`, { max: 120 });
      assertString(property.name, `Template property ${databaseIndex}.${propertyIndex} name`, { max: 200 });
      if (!isOneOf(property.type, PROPERTY_TYPES)) invalid('Template property type is invalid.');
      if (property.config !== undefined) assertJsonObject(property.config, 'Template property config');
      if (property.defaultValue !== undefined) assertJsonValue(property.defaultValue, 'Template property default value');
      assertOptionalBoolean(property.required, 'Template property required');
      assertOptionalBoolean(property.uniqueValue, 'Template property unique');
      if (property.options !== undefined) {
        if (!Array.isArray(property.options)) invalid('Template property options must be an array.');
        property.options.forEach((option) => {
          assertObject(option, 'Template property option');
          assertString(option.label, 'Template property option label', { max: 200 });
          if (option.style !== undefined) assertJsonObject(option.style, 'Template property option style');
        });
      }
    });
    database.views.forEach((view, viewIndex) => {
      assertObject(view, `Template view ${databaseIndex}.${viewIndex}`);
      assertString(view.key, 'Template view key', { max: 120 });
      assertString(view.name, 'Template view name', { max: 200 });
      if (!isOneOf(view.layout, VIEW_LAYOUTS)) invalid('Template view layout is invalid.');
      if (view.filterAst !== undefined && view.filterAst !== null) assertFilterNode(view.filterAst, 'Template view filter');
      if (view.sorts !== undefined) assertSortRules(view.sorts, 'Template view sorts');
      if (view.layoutConfig !== undefined) assertJsonObject(view.layoutConfig, 'Template view layout config');
      if (view.propertyKeys !== undefined) {
        if (!Array.isArray(view.propertyKeys)) invalid('Template view property keys must be an array.');
        view.propertyKeys.forEach((key) => assertString(key, 'Template view property key', { max: 120 }));
      }
    });
  });
  value.relations.forEach((relation, index) => {
    assertObject(relation, `Template relation ${index}`);
    ['key', 'sourceDatabaseKey', 'sourcePropertyKey', 'targetDatabaseKey'].forEach((field) => {
      assertString(relation[field], `Template relation ${index} ${field}`, { max: 120 });
    });
    assertNullableString(relation.inversePropertyKey, `Template relation ${index} inverse property key`);
    assertNullableString(relation.inversePropertyName, `Template relation ${index} inverse property name`);
    if (relation.sourceCardinality !== undefined && !isOneOf(relation.sourceCardinality, ['one', 'many'])) invalid('Template source cardinality is invalid.');
    if (relation.targetCardinality !== undefined && !isOneOf(relation.targetCardinality, ['one', 'many'])) invalid('Template target cardinality is invalid.');
  });
  if (value.pages !== undefined) {
    if (!Array.isArray(value.pages)) invalid('Template pages must be an array.');
    value.pages.forEach((page, index) => {
      assertObject(page, `Template page ${index}`);
      assertString(page.key, `Template page ${index} key`, { max: 120 });
      assertString(page.title, `Template page ${index} title`, { max: 500 });
      assertString(page.contentJson, `Template page ${index} content`, { max: 2_000_000 });
      assertNullableString(page.icon, `Template page ${index} icon`);
    });
  }
  if (value.workflows !== undefined) {
    if (!Array.isArray(value.workflows)) invalid('Template workflows must be an array.');
    value.workflows.forEach((workflow, index) => {
      assertObject(workflow, `Template workflow ${index}`);
      assertString(workflow.key, `Template workflow ${index} key`, { max: 120 });
      assertString(workflow.name, `Template workflow ${index} name`, { max: 200 });
      assertNullableString(workflow.icon, `Template workflow ${index} icon`);
      assertWorkflowBody(workflow, `Template workflow ${index}`);
      if (workflow.inputSchema === undefined || workflow.steps === undefined) invalid('Template workflow input schema and steps are required.');
    });
  }
  return value as WorkspaceTemplateV2;
}
