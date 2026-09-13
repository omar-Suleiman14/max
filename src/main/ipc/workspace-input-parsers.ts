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
import { pageLinkTargets } from '../../shared/page-links';
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
  'table', 'list', 'board', 'calendar', 'gallery', 'timeline', 'chart', 'dashboard', 'map', 'form',
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
const WORKFLOW_STEP_TYPES = ['FOR_EACH', 'SUM',
  'VALIDATE', 'COMPUTE', 'CREATE_RECORD',
  'FIND_RECORD', 'UPDATE_RECORD', 'RETURN_RESULT',
] as const;
const WORKFLOW_INPUT_TYPES = ['number', 'text', 'string', 'boolean', 'date', 'datetime', 'record', 'select', 'collection'] as const;

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

function assertFormValue(value: unknown, depth = 0): void {
  if (depth > 12) invalid('Form value is too deeply nested.');
  assertObject(value, 'Form value');
  if (value.source === 'literal') assertJsonValue(value.value, 'Literal');
  else if (value.source === 'variable') assertString(value.key, 'Input reference', { max: 120 });
  else if (value.source === 'item') { if (value.field !== undefined) assertString(value.field, 'Row field', { max: 120 }); }
  else if (value.source === 'index') { /* Zero-based row index. */ }
  else if (value.source === 'property') { assertString(value.databaseId, 'Database', { max: 120 }); assertString(value.propertyId, 'Property', { max: 120 }); assertFormValue(value.record, depth + 1); }
  else if (value.source === 'expression') { assertString(value.expression, 'Expression', { max: 4000 }); assertObject(value.bindings, 'Bindings'); Object.values(value.bindings).forEach(v => assertFormValue(v, depth + 1)); }
  else invalid('Invalid form value source.');
}

function assertWorkflowInputField(value: unknown, label: string, child = false): asserts value is WorkflowInputField {
  assertObject(value, label);
  assertOptionalId(value.databaseId, `${label}.databaseId`);
  if (value.defaultValue !== undefined) assertJsonValue(value.defaultValue, `${label}.defaultValue`);
  assertOptionalId(value.id, `${label}.id`);
  if (value.key !== undefined) assertString(value.key, `${label}.key`, { max: 120 });
  assertString(value.label, `${label}.label`, { max: 200 });
  if (!isOneOf(value.type, WORKFLOW_INPUT_TYPES)) invalid(`${label}.type is invalid.`);
  assertOptionalBoolean(value.required, `${label}.required`);
  for (const key of ['visibleWhen', 'requiredWhen', 'disabledWhen']) if (value[key] !== undefined) assertFormValue(value[key]);
  if (value.derived !== undefined) { assertObject(value.derived, 'Derived field'); assertFormValue(value.derived.value); assertOptionalBoolean(value.derived.allowOverride, 'Override'); if (value.type === 'collection' || value.prefill) invalid('Derived values require scalar fields without legacy prefill.'); }
  assertOptionalBoolean(value.allowCreate, 'Allow create');
  if (value.displayPropertyIds !== undefined) { if (!Array.isArray(value.displayPropertyIds) || value.displayPropertyIds.length > 3) invalid('Choose at most three display properties.'); value.displayPropertyIds.forEach(id => assertString(id, 'Display property', { max: 120 })); }
  if (value.pickerFilter !== undefined) assertJsonObject(value.pickerFilter, 'Picker filter');
  if (value.type !== 'record' && (value.pickerFilter || value.displayPropertyIds || value.allowCreate)) invalid('Picker options require a record input.');
  if (value.type === 'collection') {
    if (child || !Array.isArray(value.fields) || !value.fields.length || value.fields.length > 100) invalid('Collections require 1–100 scalar fields.');
    value.fields.forEach((field, i) => assertWorkflowInputField(field, label + '.fields[' + i + ']', true));
    for (const key of ['minItems', 'maxItems']) if (value[key] !== undefined && (typeof value[key] !== 'number' || !Number.isInteger(value[key]) || Number(value[key]) < 0 || Number(value[key]) > 100)) invalid('Collection limits must be integers between 0 and 100.');
    if (Number(value.minItems ?? 0) > Number(value.maxItems ?? 100)) invalid('Collection minimum exceeds maximum.');
  } else if (value.fields !== undefined) invalid('Only collections have child fields.');
  if (value.prefill !== undefined) {
    assertObject(value.prefill, 'Prefill');
    for (const key of ['inputKey', 'databaseId', 'propertyId']) assertString(value.prefill[key], 'Prefill ' + key, { max: 120 });
    if (value.type === 'collection') invalid('Collection prefill is not supported.');
  }
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

function assertWorkflowStep(value: unknown, label: string, depth = 0): asserts value is WorkflowStepDraft {
  assertObject(value, label);
  assertOptionalId(value.id, `${label}.id`);
  if (!isOneOf(value.type, WORKFLOW_STEP_TYPES)) invalid(`${label}.type is invalid.`);
  assertJsonObject(value.config, `${label}.config`);
  if (depth > 3) invalid('Iteration nesting exceeds three levels.');
  if (value.type === 'FOR_EACH') {
    if (!Array.isArray(value.config.steps) || value.config.steps.length > 100) invalid('Iteration steps must be an array of at most 100 steps.');
    value.config.steps.forEach((step, index) => assertWorkflowStep(step, label + '.steps[' + index + ']', depth + 1));
  }
}

function assertWorkflowBody(value: JsonRecord, label: string): void {
  assertOptionalBoolean(value.enabled, 'Action enabled');
  assertNullableString(value.icon, `${label}.icon`);
  if (value.inputSchema !== undefined) {
    assertObject(value.inputSchema, `${label}.inputSchema`);
    if (!Array.isArray(value.inputSchema.fields)) invalid(`${label}.inputSchema.fields must be an array.`);
    value.inputSchema.fields.forEach((field, index) => assertWorkflowInputField(field, `${label}.inputSchema.fields[${index}]`));
    for (const key of ['rules', 'summary']) if (value.inputSchema[key] !== undefined) {
      const items = value.inputSchema[key]; if (!Array.isArray(items) || items.length > 30) invalid('At most 30 rules or summary items.');
      items.forEach(item => { assertObject(item, key); if (key === 'rules') {
        assertString(item.id, 'Rule id', { max: 120 }); assertString(item.message, 'Rule message', { max: 500 });
        if (!isOneOf(item.severity, ['INFO', 'WARNING', 'BLOCK'])) invalid('Invalid rule severity.'); assertFormValue(item.condition); if (item.collection !== undefined) assertFormValue(item.collection);
      } else { assertString(item.label, 'Summary label', { max: 200 }); assertFormValue(item.value); } });
    }
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
  if (JSON.stringify(value.inputs).length > 500000) invalid('Workflow inputs are too large.');
  for (const key of ['overrides', 'confirmedWarnings']) if (value[key] !== undefined) { if (!Array.isArray(value[key]) || value[key].length > 10000) invalid('Invalid confirmation metadata.'); (value[key] as unknown[]).forEach(v => assertString(v, key, { max: 500 })); }
  if (value.evaluationToken !== undefined) assertString(value.evaluationToken, 'Evaluation token', { max: 100 });
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
    assertOptionalId(database.parentPageKey, 'Template database parent page');
    assertOptionalId(database.positionKey, 'Template database position');
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
          assertOptionalId(option.key, 'Template property option key');
          assertOptionalId(option.statusGroupKey, 'Template option status group');
          if (option.style !== undefined) assertJsonObject(option.style, 'Template property option style');
        });
      }
      if (property.statusGroups !== undefined) {
        if (property.type !== 'status' || !Array.isArray(property.statusGroups)) invalid('Only status properties support status groups.');
        for (const group of property.statusGroups) {
          assertObject(group, 'Template status group');
          assertString(group.key, 'Template status group key', { max: 120 });
          assertString(group.label, 'Template status group label', { max: 120 });
          if (!isOneOf(group.category, ['NOT_STARTED', 'ACTIVE', 'COMPLETE'])) invalid('Invalid status group category.');
        }
      }
    });
    database.views.forEach((view, viewIndex) => {
      assertObject(view, `Template view ${databaseIndex}.${viewIndex}`);
      assertString(view.key, 'Template view key', { max: 120 });
      assertString(view.name, 'Template view name', { max: 200 });
      if (!isOneOf(view.layout, VIEW_LAYOUTS)) invalid('Template view layout is invalid.');
      if (view.filterAst !== undefined && view.filterAst !== null) assertFilterNode(view.filterAst, 'Template view filter');
      if (view.group !== undefined && view.group !== null) assertGroupRule(view.group, 'Template view group');
      if (view.sorts !== undefined) assertSortRules(view.sorts, 'Template view sorts');
      if (view.layoutConfig !== undefined) assertJsonObject(view.layoutConfig, 'Template view layout config');
      if (view.propertyState !== undefined) assertPropertyViewState(view.propertyState, 'Template view property state');
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
      assertOptionalId(page.parentPageKey, 'Template page parent');
      assertOptionalId(page.positionKey, 'Template page position');
    });
  }
  if (value.recordTemplates !== undefined) {
    if (!Array.isArray(value.recordTemplates)) invalid('Template record templates must be an array.');
    value.recordTemplates.forEach((template, index) => {
      assertObject(template, `Template record template ${index}`);
      assertString(template.key, `Template record template ${index} key`, { max: 120 });
      assertString(template.databaseKey, `Template record template ${index} database`, { max: 120 });
      assertString(template.name, `Template record template ${index} name`, { max: 200 });
      assertNullableString(template.icon, `Template record template ${index} icon`);
      if (template.defaults !== undefined) assertJsonObject(template.defaults, `Template record template ${index} defaults`);
      if (template.contentJson !== undefined) assertString(template.contentJson, `Template record template ${index} content`, { max: 2_000_000 });
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
  if (value.records !== undefined) {
    if (!Array.isArray(value.records) || value.records.length > 10_000) invalid('Blueprint records must be an array of at most 10,000 entries.');
    value.records.forEach((record) => {
      assertObject(record, 'Seed record');
      assertString(record.key, 'Seed record key', { max: 120 });
      assertString(record.databaseKey, 'Seed record database', { max: 120 });
      assertString(record.title, 'Seed record title', { max: 500 });
      assertNullableString(record.icon, 'Seed record icon');
      if (record.contentJson !== undefined) assertString(record.contentJson, 'Seed record content', { max: 2_000_000 });
      if (record.properties !== undefined) assertJsonObject(record.properties, 'Seed record properties');
    });
  }
  const allowedFields = ['author', 'databases', 'description', 'name', 'pages', 'recordTemplates', 'records', 'relations', 'version', 'workflows'];
  for (const key of Object.keys(value)) if (!allowedFields.includes(key)) invalid(`Unsupported blueprint field: ${key}`);
  const template = value as WorkspaceTemplateV2;
  const keys = new Set<string>();
  const addKey = (key: string) => {
    if (keys.has(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) invalid(`Blueprint key must be unique: ${key}`);
    keys.add(key);
  };
  const databases = new Map(template.databases.map((db) => [db.key, db]));
  const propertyOwners = new Map(template.databases.flatMap((db) => db.properties.map((p) => [p.key, db.key] as const)));
  for (const db of template.databases) {
    addKey(db.key);
    if (db.properties.filter((p) => p.type === 'title').length > 1) invalid('A database can only have one title property.');
    for (const property of db.properties) {
      addKey(property.key);
      for (const group of property.statusGroups ?? []) addKey(group.key);
      for (const option of property.options ?? []) {
        if (option.key) addKey(option.key);
        if (option.statusGroupKey && !property.statusGroups?.some((g) => g.key === option.statusGroupKey)) invalid('Option status group must belong to the same property.');
      }
    }
    for (const view of db.views) addKey(view.key);
    if (db.defaultViewKey && !db.views.some((v) => v.key === db.defaultViewKey)) invalid('Default view must belong to its database.');
    for (const view of db.views) {
      for (const key of view.propertyKeys ?? []) if (propertyOwners.get(key) !== db.key) invalid('View references an unavailable property.');
      for (const column of view.propertyState?.columns ?? []) if (propertyOwners.get(column.propertyId) !== db.key) invalid('View column references an unavailable property.');
      for (const sort of view.sorts ?? []) if (propertyOwners.get(sort.propertyId) !== db.key) invalid('Sort references an unavailable property.');
      if (view.group && propertyOwners.get(view.group.propertyId) !== db.key) invalid('Group references an unavailable property.');
    }
  }
  for (const relation of template.relations) {
    addKey(relation.key);
    if (!databases.has(relation.sourceDatabaseKey) || !databases.has(relation.targetDatabaseKey) || propertyOwners.get(relation.sourcePropertyKey) !== relation.sourceDatabaseKey) invalid('Relation references an unavailable database or property.');
    if (databases.get(relation.sourceDatabaseKey)?.properties.find((p) => p.key === relation.sourcePropertyKey)?.type !== 'relation') invalid('Relation source must be a relation property.');
    if (relation.inversePropertyKey && (propertyOwners.get(relation.inversePropertyKey) !== relation.targetDatabaseKey || databases.get(relation.targetDatabaseKey)?.properties.find((p) => p.key === relation.inversePropertyKey)?.type !== 'relation')) invalid('Inverse relation property is invalid.');
  }
  const usedRelations = new Set<string>();
  for (const relation of template.relations) for (const key of [relation.sourcePropertyKey, relation.inversePropertyKey].filter((k): k is string => !!k)) {
    if (usedRelations.has(key)) invalid('A relation property cannot belong to multiple relations.');
    usedRelations.add(key);
  }
  const checkProperty = (key: string, databaseKey: string) => { if (propertyOwners.get(key) !== databaseKey) invalid(`Property ${key} is unavailable in database ${databaseKey}.`); };
  const checkFilter = (node: FilterNode, databaseKey: string): void => {
    if (node.kind === 'group') node.conditions.forEach((child) => checkFilter(child, databaseKey));
    else if (node.kind === 'property') checkProperty(node.propertyId, databaseKey);
    else {
      checkProperty(node.relationPropertyId, databaseKey);
      const relation = template.relations.find((r) => r.sourcePropertyKey === node.relationPropertyId || r.inversePropertyKey === node.relationPropertyId);
      if (!relation) invalid('Filter relation is unavailable.');
      checkFilter(node.targetFilter, relation.sourcePropertyKey === node.relationPropertyId ? relation.targetDatabaseKey : relation.sourceDatabaseKey);
    }
  };
  for (const db of template.databases) for (const view of db.views) {
    if (view.filterAst) checkFilter(view.filterAst, db.key);
    for (const key of [view.propertyState?.datePropertyId, view.propertyState?.coverPropertyId, view.propertyState?.groupPropertyId]) if (key) checkProperty(key, db.key);
    if (view.layoutConfig?.calculations !== undefined) {
      if (!Array.isArray(view.layoutConfig.calculations)) invalid('View calculations must be an array.');
      for (const calculation of view.layoutConfig.calculations) {
        assertObject(calculation, 'View calculation');
        if (!isOneOf(calculation.calculation, CALCULATIONS)) invalid('Invalid view calculation.');
        checkProperty(String(calculation.propertyId), db.key);
      }
    }
  }
  const content = (text: string) => {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!Array.isArray(parsed) && (!isObject(parsed) || !Array.isArray(parsed.blocks))) invalid('Page content must contain an array of blocks.');
    } catch { invalid('Page content must be valid JSON containing an array of blocks.'); }
  };
  for (const page of template.pages ?? []) { addKey(page.key); content(page.contentJson); }
  const pages = new Map((template.pages ?? []).map((p) => [p.key, p]));
  for (const node of [...template.databases, ...(template.pages ?? [])]) {
    const visited = new Set([node.key]);
    let parent = node.parentPageKey;
    while (parent) {
      if (!pages.has(parent) || visited.has(parent)) invalid('Parent pages must exist in the blueprint and cannot form a cycle.');
      visited.add(parent); parent = pages.get(parent)?.parentPageKey;
    }
  }
  for (const record of [...(template.records ?? []), ...(template.recordTemplates ?? [])]) {
    addKey(record.key);
    if (!databases.has(record.databaseKey)) invalid('Record or template references an unavailable database.');
    if (record.contentJson !== undefined) content(record.contentJson);
  }
  for (const record of template.records ?? []) for (const key of Object.keys(record.properties ?? {})) checkProperty(key, record.databaseKey);
  for (const record of template.recordTemplates ?? []) for (const key of Object.keys(record.defaults ?? {})) checkProperty(key, record.databaseKey);
  const checkBlocks = (text: string) => {
    for (const id of pageLinkTargets(text)) if (!pages.has(id)) invalid('Page link must reference a page in the blueprint.');
    const walk = (entry: unknown): void => {
      if (Array.isArray(entry)) { entry.forEach(walk); return; }
      if (!isObject(entry)) return;
      if (entry.type === 'database-view') {
        const db = databases.get(String(entry.databaseId));
        if (!db || (entry.viewId && !db.views.some((v) => v.key === entry.viewId))) invalid('Page database block references an unavailable database or view.');
      }
      Object.values(entry).forEach(walk);
    };
    walk(JSON.parse(text));
  };
  for (const entry of [...(template.pages ?? []), ...(template.records ?? []), ...(template.recordTemplates ?? [])]) if (entry.contentJson) checkBlocks(entry.contentJson);
  for (const workflow of template.workflows ?? []) {
    addKey(workflow.key);
    const walk = (entry: unknown): void => {
      if (Array.isArray(entry)) { entry.forEach(walk); return; }
      if (!entry || typeof entry !== 'object') return;
      const object = entry as Record<string, unknown>;
      if (object.databaseId !== undefined && (typeof object.databaseId !== 'string' || !databases.has(object.databaseId))) invalid('Action database must be included in the blueprint.');
      if (object.propertyId !== undefined && (typeof object.propertyId !== 'string' || !propertyOwners.has(object.propertyId))) invalid('Action property must be included in the blueprint.');
      Object.values(object).forEach(walk);
    };
    walk(workflow);
    const checkDefaults = (fields: readonly WorkflowInputField[], defaults?: Record<string, unknown>) => {
      for (const [index, field] of fields.entries()) {
        const value = defaults?.[field.key ?? field.id ?? 'input_' + (index + 1)] ?? field.defaultValue;
        if (field.type === 'record' && value != null && value !== '' && !template.records?.some(r => r.key === value && r.databaseKey === field.databaseId)) invalid('Record input defaults must reference a seed record from the selected database.');
        if (field.fields) {
          checkDefaults(field.fields);
          if (Array.isArray(value)) for (const row of value) { if (!isObject(row)) invalid('Collection default row must be an object.'); checkDefaults(field.fields, row); }
        }
      }
    };
    checkDefaults(workflow.inputSchema.fields);
  }
  return value as WorkspaceTemplateV2;
}
