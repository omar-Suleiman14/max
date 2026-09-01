/**
 * Workflow engine definitions, steps, runs, and execution contracts for Max v0.2.0.
 */

export type WorkflowStepType =
  | 'VALIDATE'
  | 'COMPUTE'
  | 'CREATE_RECORD'
  | 'SET_PROPERTY'
  | 'CREATE_RELATION'
  | 'REMOVE_RELATION'
  | 'ARCHIVE_RECORD'
  | 'IF'
  | 'CALCULATE_FEES'
  | 'RETURN_RESULT';

export type WorkflowStep = Readonly<{
  config: Readonly<Record<string, unknown>>;
  id: string;
  type: WorkflowStepType;
}>;

export type WorkflowInputType = 'number' | 'money' | 'text' | 'string' | 'boolean' | 'date' | 'record' | 'select';

export type WorkflowInputField = Readonly<{
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
  fields: readonly WorkflowInputField[];
}>;

export type WorkspaceWorkflow = Readonly<{
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
  workflowId: string;
}>;

export type WorkflowExecutionResult = Readonly<{
  createdRecordIds: readonly string[];
  error?: string;
  result: Readonly<Record<string, unknown>>;
  runId: string;
  status: WorkflowRunStatus;
  workflowId: string;
}>;
