import type { FilterNode } from './query-contract';
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
