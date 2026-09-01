import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { generateOrderKey } from '../../shared/order-key';
import { WorkspaceDomainError } from '../../shared/workspace-contract';
import type {
  WorkflowExecutionInput,
  WorkflowExecutionResult,
  WorkflowInputSchema,
  WorkflowStep,
  WorkspaceWorkflow,
  WorkspaceWorkflowDraft,
} from '../../shared/workflow-contract';
import type { DatabaseUnitOfWork } from './database-unit-of-work';
import type { RecordRepository } from './record-repository';
import type { RelationRepository } from './relation-repository';
import type { PricingRepository } from './pricing-repository';
import { calculatePricing } from '../../shared/pricing-contract';
import { FormulaParser } from './formula/parser';
import { evaluateFormula } from './formula/evaluator';
import { parseStoredJson, valueToText } from './value-utils';

type WorkflowRow = Readonly<{
  archived_at: string | null;
  created_at: string;
  icon: string | null;
  id: string;
  input_schema_json: string;
  kind: WorkspaceWorkflow['kind'];
  name: string;
  position_key: string;
  result_schema_json: string | null;
  steps_json: string;
  updated_at: string;
  version: number;
}>;

function workflowFromRow(row: WorkflowRow): WorkspaceWorkflow {
  return {
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    icon: row.icon,
    id: row.id,
    inputSchema: parseStoredJson<WorkflowInputSchema>(row.input_schema_json, { fields: [] }),
    kind: row.kind,
    name: row.name,
    positionKey: row.position_key,
    resultSchema: parseStoredJson<Readonly<Record<string, unknown>> | undefined>(row.result_schema_json, undefined),
    steps: parseStoredJson<readonly WorkflowStep[]>(row.steps_json, []),
    updatedAt: row.updated_at,
    version: row.version,
  };
}

export class WorkflowService {
  readonly #database: DatabaseSync;
  readonly #unitOfWork: DatabaseUnitOfWork;
  readonly #recordRepo: RecordRepository;
  readonly #relationRepo: RelationRepository;
  readonly #pricingRepo: PricingRepository;
  readonly #formulaParser: FormulaParser;

  constructor(
    database: DatabaseSync,
    unitOfWork: DatabaseUnitOfWork,
    recordRepo: RecordRepository,
    relationRepo: RelationRepository,
    pricingRepo: PricingRepository,
  ) {
    this.#database = database;
    this.#unitOfWork = unitOfWork;
    this.#recordRepo = recordRepo;
    this.#relationRepo = relationRepo;
    this.#pricingRepo = pricingRepo;
    this.#formulaParser = new FormulaParser();
  }

  createWorkflow(draft: WorkspaceWorkflowDraft): WorkspaceWorkflow {
    const name = draft.name.trim();
    if (!name || name.length > 120) {
      throw new WorkspaceDomainError('invalid-input', 'Workflow name must be 1–120 characters.');
    }

    const id = draft.id ?? randomUUID();
    const now = new Date().toISOString();
    const positionKey = draft.positionKey ?? this.#nextPositionKey();
    const steps: readonly WorkflowStep[] = (draft.steps ?? []).map((s) => ({
      config: s.config,
      id: s.id ?? randomUUID(),
      type: s.type,
    }));
    const inputSchemaJson = JSON.stringify(draft.inputSchema ?? { fields: [] });
    const stepsJson = JSON.stringify(steps);
    const resultSchemaJson = draft.resultSchema ? JSON.stringify(draft.resultSchema) : null;
    const kind = draft.kind ?? 'custom';

    this.#database
      .prepare(`
        INSERT INTO workspace_workflows (
          id, name, icon, kind, input_schema_json, steps_json, result_schema_json, version, position_key, created_at, updated_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, NULL)
      `)
      .run(id, name, draft.icon ?? null, kind, inputSchemaJson, stepsJson, resultSchemaJson, positionKey, now, now);

    // Save initial revision
    this.#database
      .prepare(`
        INSERT INTO workspace_workflow_revisions (workflow_id, version, definition_json, created_at)
        VALUES (?, 1, ?, ?)
      `)
      .run(id, JSON.stringify({ ...draft, steps }), now);

    return {
      archivedAt: null,
      createdAt: now,
      icon: draft.icon ?? null,
      id,
      inputSchema: draft.inputSchema ?? { fields: [] },
      kind,
      name,
      positionKey,
      resultSchema: draft.resultSchema,
      steps,
      updatedAt: now,
      version: 1,
    };
  }

  getWorkflow(id: string): WorkspaceWorkflow | null {
    const row = this.#database
      .prepare('SELECT * FROM workspace_workflows WHERE id = ?')
      .get(id) as WorkflowRow | undefined;

    return row ? workflowFromRow(row) : null;
  }

  listWorkflows(): readonly WorkspaceWorkflow[] {
    const rows = this.#database
      .prepare('SELECT * FROM workspace_workflows WHERE archived_at IS NULL ORDER BY position_key ASC')
      .all() as WorkflowRow[];

    return rows.map(workflowFromRow);
  }

  updateWorkflow(id: string, patch: Partial<WorkspaceWorkflowDraft>): WorkspaceWorkflow {
    const current = this.getWorkflow(id);
    if (!current) {
      throw new WorkspaceDomainError('not-found', `Workflow not found: ${id}`);
    }

    const name = patch.name !== undefined ? patch.name.trim() : current.name;
    if (!name || name.length > 120) {
      throw new WorkspaceDomainError('invalid-input', 'Workflow name must be 1–120 characters.');
    }

    const icon = patch.icon !== undefined ? patch.icon : current.icon;
    const kind = patch.kind !== undefined ? patch.kind : current.kind;
    const inputSchemaJson = patch.inputSchema !== undefined ? JSON.stringify(patch.inputSchema) : JSON.stringify(current.inputSchema);
    const stepsJson = patch.steps !== undefined ? JSON.stringify(patch.steps) : JSON.stringify(current.steps);
    const resultSchemaJson = patch.resultSchema !== undefined ? (patch.resultSchema ? JSON.stringify(patch.resultSchema) : null) : (current.resultSchema ? JSON.stringify(current.resultSchema) : null);
    const positionKey = patch.positionKey !== undefined ? patch.positionKey : current.positionKey;
    const nextVersion = current.version + 1;
    const now = new Date().toISOString();

    this.#database
      .prepare(`
        UPDATE workspace_workflows
        SET name = ?, icon = ?, kind = ?, input_schema_json = ?, steps_json = ?, result_schema_json = ?,
            version = ?, position_key = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(name, icon ?? null, kind, inputSchemaJson, stepsJson, resultSchemaJson, nextVersion, positionKey, now, id);

    // Save revision
    this.#database
      .prepare(`
        INSERT INTO workspace_workflow_revisions (workflow_id, version, definition_json, created_at)
        VALUES (?, ?, ?, ?)
      `)
      .run(id, nextVersion, JSON.stringify({ ...current, ...patch, version: nextVersion }), now);

    return this.getWorkflow(id)!;
  }

  archiveWorkflow(id: string): void {
    const now = new Date().toISOString();
    this.#database
      .prepare('UPDATE workspace_workflows SET archived_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
  }

  execute(input: WorkflowExecutionInput): WorkflowExecutionResult {
    const workflow = this.getWorkflow(input.workflowId);
    if (!workflow) {
      throw new WorkspaceDomainError('not-found', `Workflow not found: ${input.workflowId}`);
    }

    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const actorId = input.actorId ?? 'local-user';
    for (const field of workflow.inputSchema.fields) {
      const key = field.key ?? field.id;
      if (field.required && key && (input.inputs[key] === undefined || input.inputs[key] === null || input.inputs[key] === '')) {
        throw new WorkspaceDomainError('invalid-input', `${field.label} is required.`);
      }
    }

    const perform = (persistRun: boolean): WorkflowExecutionResult => {
        const variables: Record<string, unknown> = {
          ...input.inputs,
          actor_id: actorId,
          now: startedAt,
        };

        const createdRecordIds: string[] = [];
        let finalResult: unknown = null;

        this.#executeSteps(workflow.steps, variables, createdRecordIds);

        if (variables.result !== undefined) {
          finalResult = variables.result;
        }

        const completedAt = new Date().toISOString();

        if (persistRun) this.#database
          .prepare(`
            INSERT INTO workspace_workflow_runs (
              id, workflow_id, workflow_version, status, input_json, result_json, actor_id, started_at, completed_at, error_json
            ) VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, NULL)
          `)
          .run(
            runId,
            workflow.id,
            workflow.version,
            JSON.stringify(input.inputs),
            finalResult ? JSON.stringify(finalResult) : null,
            actorId,
            startedAt,
            completedAt,
          );

        const resultObj = (finalResult && typeof finalResult === 'object' && !Array.isArray(finalResult)
          ? finalResult
          : { value: finalResult }) as Readonly<Record<string, unknown>>;

        return {
          completedAt,
          createdRecordIds,
          result: resultObj,
          runId,
          status: persistRun ? 'completed' : 'rolled_back',
          workflowId: workflow.id,
        };
    };

    if (input.testMode) {
      const savepoint = `workflow_test_${runId.replaceAll('-', '')}`;
      this.#database.exec(`SAVEPOINT ${savepoint};`);
      try {
        const result = perform(false);
        this.#database.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint};`);
        const completedAt = new Date().toISOString();
        this.#database.prepare(`
          INSERT INTO workspace_workflow_runs (
            id, workflow_id, workflow_version, status, input_json, result_json, actor_id, started_at, completed_at, error_json
          ) VALUES (?, ?, ?, 'rolled_back', ?, ?, ?, ?, ?, NULL)
        `).run(runId, workflow.id, workflow.version, JSON.stringify(input.inputs), JSON.stringify(result.result), actorId, startedAt, completedAt);
        return { ...result, completedAt };
      } catch (error) {
        this.#database.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint};`);
        throw error;
      }
    }

    try {
      return this.#unitOfWork.run(() => perform(true));
    } catch (error) {
      const completedAt = new Date().toISOString();
      const errMessage = error instanceof Error ? error.message : String(error);
      this.#database.prepare(`
        INSERT INTO workspace_workflow_runs (
          id, workflow_id, workflow_version, status, input_json, result_json, actor_id, started_at, completed_at, error_json
        ) VALUES (?, ?, ?, 'failed', ?, NULL, ?, ?, ?, ?)
      `).run(
        runId,
        workflow.id,
        workflow.version,
        JSON.stringify(input.inputs),
        actorId,
        startedAt,
        completedAt,
        JSON.stringify({ message: errMessage }),
      );
      throw error;
    }
  }

  #executeSteps(
    steps: readonly WorkflowStep[],
    variables: Record<string, unknown>,
    createdRecordIds: string[],
  ): void {
    for (const step of steps) {
      this.#executeSingleStep(step, variables, createdRecordIds);
    }
  }

  #executeSingleStep(
    step: WorkflowStep,
    variables: Record<string, unknown>,
    createdRecordIds: string[],
  ): void {
    const config = step.config ?? {};

    switch (step.type) {
      case 'VALIDATE': {
        const condition = config.condition as string | undefined;
        const errorMessage = config.errorMessage as string | undefined;
        if (condition) {
          const ast = this.#formulaParser.parse(condition);
          const isValid = evaluateFormula(ast, { properties: variables });
          if (!isValid) {
            throw new WorkspaceDomainError('constraint-violation', errorMessage || 'Workflow validation failed.');
          }
        }
        break;
      }

      case 'COMPUTE': {
        const expression = config.expression as string | undefined;
        const outputVariable = config.outputVariable as string | undefined;
        if (expression && outputVariable) {
          const ast = this.#formulaParser.parse(expression);
          const val = evaluateFormula(ast, { properties: variables });
          variables[outputVariable] = val;
        } else if (config.assignments && typeof config.assignments === 'object') {
          for (const [varName, expr] of Object.entries(config.assignments as Record<string, string>)) {
            const ast = this.#formulaParser.parse(expr);
            const val = evaluateFormula(ast, { properties: variables });
            variables[varName] = val;
          }
        }
        break;
      }

      case 'CREATE_RECORD': {
        const databaseId = config.databaseId as string | undefined;
        const titleExpression = (config.titleExpression || config.title) as string | undefined;
        const propertyValues = (config.propertyValues || config.properties) as Record<string, string> | undefined;
        const outputVariable = config.outputVariable as string | undefined;

        if (databaseId) {
          const title = this.#resolveValue(titleExpression || "'Untitled'", variables);
          const props: Record<string, unknown> = {};

          if (propertyValues) {
            for (const [pId, expr] of Object.entries(propertyValues)) {
              props[pId] = this.#resolveValue(expr, variables);
            }
          }

          const created = this.#recordRepo.createRecord({
            databaseId,
            properties: props,
            title: valueToText(title) || 'Untitled',
          });

          createdRecordIds.push(created.id);
          if (outputVariable) {
            variables[outputVariable] = created.id;
          }
        }
        break;
      }

      case 'SET_PROPERTY': {
        const recordIdVariable = config.recordIdVariable as string | undefined;
        const propertyId = config.propertyId as string | undefined;
        const expression = config.expression as string | undefined;

        if (recordIdVariable && propertyId && expression) {
          const recId = valueToText(variables[recordIdVariable]);
          const val = this.#resolveValue(expression, variables);
          if (recId) {
            this.#recordRepo.updateProperty(recId, propertyId, val);
          }
        }
        break;
      }

      case 'CREATE_RELATION': {
        const relationId = config.relationId as string | undefined;
        const sourceRecordVariable = config.sourceRecordVariable as string | undefined;
        const targetRecordVariable = config.targetRecordVariable as string | undefined;

        if (relationId && sourceRecordVariable && targetRecordVariable) {
          const srcId = valueToText(variables[sourceRecordVariable]);
          const tgtId = valueToText(variables[targetRecordVariable]);
          if (srcId && tgtId) {
            this.#relationRepo.connect(relationId, srcId, tgtId);
          }
        }
        break;
      }

      case 'REMOVE_RELATION': {
        const relationId = config.relationId as string | undefined;
        const sourceRecordVariable = config.sourceRecordVariable as string | undefined;
        const targetRecordVariable = config.targetRecordVariable as string | undefined;

        if (relationId && sourceRecordVariable && targetRecordVariable) {
          const srcId = valueToText(variables[sourceRecordVariable]);
          const tgtId = valueToText(variables[targetRecordVariable]);
          if (srcId && tgtId) {
            this.#relationRepo.disconnect(relationId, srcId, tgtId);
          }
        }
        break;
      }

      case 'ARCHIVE_RECORD': {
        const recordIdVariable = config.recordIdVariable as string | undefined;
        if (recordIdVariable) {
          const recId = valueToText(variables[recordIdVariable]);
          if (recId) {
            this.#recordRepo.archiveRecord(recId);
          }
        }
        break;
      }

      case 'CALCULATE_FEES': {
        const baseAmount = Number(variables.baseAmount ?? variables.amount ?? 0);
        const profileId = valueToText(variables.pricingProfileId);
        const profile = profileId ? this.#pricingRepo.getProfile(profileId) : null;

        if (profile) {
          const quote = calculatePricing(
            profile,
            {
              amount: baseAmount,
              context: {
                channel: valueToText(variables.channelId),
                destinationProvider: valueToText(variables.providerId),
                service: valueToText(variables.serviceId),
              },
            },
            valueToText(variables.now) || new Date().toISOString(),
          );
          variables.calculatedFee = quote.totals.customerFee;
          variables.netAmount = quote.totals.customerTotal;
          variables.feeQuote = quote;
        } else {
          variables.calculatedFee = 0;
          variables.netAmount = baseAmount;
        }
        break;
      }

      case 'IF': {
        const condition = config.condition as string | undefined;
        const thenSteps = config.thenSteps as readonly WorkflowStep[] | undefined;
        const elseSteps = config.elseSteps as readonly WorkflowStep[] | undefined;

        if (condition) {
          const ast = this.#formulaParser.parse(condition);
          const isTrue = evaluateFormula(ast, { properties: variables });
          if (isTrue && thenSteps) {
            this.#executeSteps(thenSteps, variables, createdRecordIds);
          } else if (!isTrue && elseSteps) {
            this.#executeSteps(elseSteps, variables, createdRecordIds);
          }
        }
        break;
      }

      case 'RETURN_RESULT': {
        const resultExpression = config.resultExpression as string | undefined;
        if (resultExpression) {
          variables.result = this.#resolveValue(resultExpression, variables);
        } else {
          const resObj: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(config)) {
            if (typeof v === 'string' && v.startsWith('$')) {
              const varName = v.slice(1);
              resObj[k] = variables[varName] !== undefined ? variables[varName] : v;
            } else {
              resObj[k] = v;
            }
          }
          variables.result = resObj;
        }
        break;
      }
    }
  }

  #resolveValue(expression: string, variables: Record<string, unknown>): unknown {
    if (typeof expression === 'string' && expression.startsWith('$')) {
      const varName = expression.slice(1);
      if (variables[varName] !== undefined) {
        return variables[varName];
      }
    }
    try {
      const ast = this.#formulaParser.parse(expression);
      return evaluateFormula(ast, { properties: variables });
    } catch {
      return expression;
    }
  }

  #nextPositionKey(): string {
    const lastRow = this.#database
      .prepare('SELECT position_key FROM workspace_workflows WHERE archived_at IS NULL ORDER BY position_key DESC LIMIT 1')
      .get() as { position_key: string } | undefined;

    return generateOrderKey(lastRow?.position_key, null);
  }
}
