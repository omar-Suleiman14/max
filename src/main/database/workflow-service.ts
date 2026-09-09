import { assertDerivedOrder, evaluateWorkflowForm } from './workflow-form-evaluator';
import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { generateOrderKey } from '../../shared/order-key';
import { WorkspaceDomainError } from '../../shared/workspace-contract';
import type {
  WorkflowExecutionInput,
  WorkflowExecutionResult,
  WorkflowFormEvaluation,
  WorkflowFieldState,
  WorkflowInputSchema,
  WorkflowInputField,
  WorkflowStep,
  WorkspaceWorkflow,
  WorkspaceWorkflowDraft,
} from '../../shared/workflow-contract';
import type { DatabaseUnitOfWork } from './database-unit-of-work';
import type { RecordRepository } from './record-repository';
import type { RelationRepository } from './relation-repository';
import type { PropertyRepository } from './property-repository';
import type { DatabaseQueryService } from './query/database-query-service';
import type { ComputedPropertyService } from './computed-property-service';
import type { WorkflowValue } from '../../shared/workflow-contract';
import type { FilterNode } from '../../shared/query-contract';
import { extractFormulaDependencies } from './formula/dependency-extractor';
import { parseDatabaseQueryParams, parseWorkspaceWorkflowDraft } from '../ipc/workspace-input-parsers';
import { FormulaParser } from './formula/parser';
import { evaluateFormula } from './formula/evaluator';
import { parseStoredJson, valueToText } from './value-utils';

type WorkflowRow = Readonly<{
  enabled: number;
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
    enabled: Boolean(row.enabled),
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
  readonly #properties: PropertyRepository;
  readonly #query: DatabaseQueryService;
  readonly #computed: ComputedPropertyService;
  readonly #formulaParser: FormulaParser;
  readonly #formTimes = new Map<string, { now: string; expires: number; workflowId: string }>();

  constructor(
    database: DatabaseSync,
    unitOfWork: DatabaseUnitOfWork,
    recordRepo: RecordRepository,
    relationRepo: RelationRepository,
    properties: PropertyRepository,
    query: DatabaseQueryService,
    computed: ComputedPropertyService,
  ) {
    this.#database = database;
    this.#unitOfWork = unitOfWork;
    this.#recordRepo = recordRepo;
    this.#relationRepo = relationRepo;
    this.#properties = properties;
    this.#query = query;
    this.#computed = computed;
    this.#formulaParser = new FormulaParser();
  }

  createWorkflow(draft: WorkspaceWorkflowDraft): WorkspaceWorkflow {
    this.validate(draft);
    return this.#unitOfWork.run(() => this.#create(draft));
  }

  #create(draft: WorkspaceWorkflowDraft): WorkspaceWorkflow {
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
          id, name, icon, kind, input_schema_json, steps_json, result_schema_json, version, position_key, created_at, updated_at, enabled, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, NULL)
      `)
      .run(id, name, draft.icon ?? null, kind, inputSchemaJson, stepsJson, resultSchemaJson, positionKey, now, now, draft.enabled === false ? 0 : 1);

    // Save initial revision
    this.#database
      .prepare(`
        INSERT INTO workspace_workflow_revisions (workflow_id, version, definition_json, created_at)
        VALUES (?, 1, ?, ?)
      `)
      .run(id, JSON.stringify({ ...draft, steps }), now);

    return {
      enabled: draft.enabled !== false,
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
    return this.#unitOfWork.run(() => this.#update(id, patch));
  }

  #update(id: string, patch: Partial<WorkspaceWorkflowDraft>): WorkspaceWorkflow {
    const current = this.getWorkflow(id);
    if (!current) {
      throw new WorkspaceDomainError('not-found', `Workflow not found: ${id}`);
    }

    this.validate({ ...current, ...patch });
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
            version = ?, position_key = ?, updated_at = ?, enabled = ?
        WHERE id = ?
      `)
      .run(name, icon ?? null, kind, inputSchemaJson, stepsJson, resultSchemaJson, nextVersion, positionKey, now, (patch.enabled ?? current.enabled) ? 1 : 0, id);

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

  #hasFormBehavior(schema: WorkflowInputSchema): boolean {
    const fields = (items: readonly WorkflowInputField[]): boolean => items.some(f => f.derived || f.visibleWhen || f.requiredWhen || f.disabledWhen || f.pickerFilter || f.displayPropertyIds || f.allowCreate || (f.fields && fields(f.fields)));
    return !!(schema.rules?.length || schema.summary?.length || fields(schema.fields));
  }

  evaluateForm(input: WorkflowExecutionInput): WorkflowFormEvaluation {
    const workflow = this.getWorkflow(input.workflowId);
    if (!workflow || workflow.archivedAt || !workflow.enabled) throw new WorkspaceDomainError('not-found', 'Action is unavailable.');
    this.validate(workflow);
    const storedTime = input.evaluationToken ? this.#formTimes.get(input.evaluationToken) : undefined;
    const prior = storedTime && storedTime.workflowId === workflow.id && storedTime.expires > Date.now() ? storedTime : undefined;
    const now = prior?.now ?? new Date().toISOString();
    const formScope = (scope: Record<string, unknown>) => ({ now, actor_id: input.actorId ?? 'local-user', ...scope });
    const cache = new Map<string, NonNullable<WorkflowFieldState['options']>>();
    const result = evaluateWorkflowForm(workflow.inputSchema, input, {
      resolve: (value, scope) => this.#resolveValue(value, formScope(scope), true),
      check: (field, value) => { this.#inputs([{ ...field, key: 'value', defaultValue: undefined, prefill: undefined }], { value }); },
      options: (field, scope) => {
        const resolveFilter = (node: FilterNode): FilterNode => {
          if (node.kind === 'group') return { ...node, conditions: node.conditions.map(resolveFilter) };
          if (node.kind !== 'property') throw new WorkspaceDomainError('invalid-input', 'Picker filters support property conditions and groups.');
          const resolve = (v: unknown) => v && typeof v === 'object' && 'source' in v ? this.#resolveValue(v, formScope(scope), true) : v;
          return { ...node, value: resolve(node.value), valueTo: resolve(node.valueTo) };
        };
        const filter = field.pickerFilter ? resolveFilter(field.pickerFilter) : undefined;
        const key = JSON.stringify([field.databaseId, filter, field.displayPropertyIds]); const saved = cache.get(key); if (saved) return saved;
        const displayProperties = (field.displayPropertyIds ?? []).map(id => this.#property(field.databaseId!, id));
        const options: {id: string; title: string; secondary: string}[] = []; let cursor: string | undefined;
        do { const page = this.#query.query({ databaseId: field.databaseId!, filter, limit: 200, cursor });
          for (const r of page.records) options.push({ id: r.id, title: r.title, secondary: displayProperties.map(property => {
            const value = property.type === 'title' ? r.title : r.properties[property.id];
            if (property.options?.length) return (Array.isArray(value) ? value : [value]).map(v => property.options?.find(o => o.id === v)?.label ?? valueToText(v)).join(', ');
            return valueToText(value);
          }).filter(Boolean).join(' · ') });
          cursor = page.nextCursor ?? undefined;
          if (cursor && options.length >= 10000) throw new WorkspaceDomainError('invalid-input', 'Narrow this picker filter to fewer than 10,000 records.');
        } while (cursor);
        cache.set(key, options); return options;
      },
    });
    // Includes the displayed values/rules and schema version. No database mutation or workflow steps run here.
    const token = createHash('sha256').update(JSON.stringify([workflow.id, workflow.version, result.values, result.messages, result.summary, Object.entries(result.fields).map(([key, state]) => [key, state.visible, state.required, state.disabled, state.calculated])])).digest('hex');
    this.#formTimes.set(token, { now, expires: prior?.expires ?? Date.now() + 30 * 60 * 1000, workflowId: workflow.id });
    while (this.#formTimes.size > 128) this.#formTimes.delete(this.#formTimes.keys().next().value!);
    return { ...result, token };
  }

  execute(input: WorkflowExecutionInput): WorkflowExecutionResult {
    const workflow = this.getWorkflow(input.workflowId);
    if (!workflow || workflow.archivedAt) {
      throw new WorkspaceDomainError('not-found', `Workflow not found: ${input.workflowId}`);
    }

    if (!workflow.enabled) throw new WorkspaceDomainError('invalid-input', 'This action is disabled.');
    this.validate(workflow);
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const actorId = input.actorId ?? 'local-user';
    let normalizedInputs: Readonly<Record<string, unknown>>;
    if (this.#hasFormBehavior(workflow.inputSchema)) {
      const evaluation = this.evaluateForm(input);
      const blocked = evaluation.messages.find(m => m.severity === 'BLOCK');
      if (blocked) throw new WorkspaceDomainError('invalid-input', blocked.message);
      if (input.evaluationToken !== evaluation.token) throw new WorkspaceDomainError('invalid-input', 'Review the updated action preview before submitting.');
      if (evaluation.messages.some(m => m.severity === 'WARNING' && !input.confirmedWarnings?.includes(m.id))) throw new WorkspaceDomainError('invalid-input', 'Confirm the action warnings before submitting.');
      normalizedInputs = evaluation.values;
    } else normalizedInputs = this.#inputs(workflow.inputSchema.fields, input.inputs);

    const perform = (persistRun: boolean): WorkflowExecutionResult => {
        const variables: Record<string, unknown> = {
          ...normalizedInputs,
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
      const errMessage = error instanceof WorkspaceDomainError ? error.message : 'Action failed. No changes were saved.';
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
      throw new WorkspaceDomainError('workflow-failed', errMessage);
    }
  }

  #executeSteps(
    steps: readonly WorkflowStep[],
    variables: Record<string, unknown>,
    createdRecordIds: string[],
    budget = { count: 0 },
  ): void {
    for (const step of steps) {
      try { if (++budget.count > 1000) throw new WorkspaceDomainError('invalid-input', 'Action exceeds 1,000 executed steps.'); this.#executeSingleStep(step, variables, createdRecordIds, budget); } catch (error) {
        throw new WorkspaceDomainError('workflow-failed', `Step ${steps.indexOf(step) + 1}: ${error instanceof WorkspaceDomainError ? error.message : 'Action failed. Check the configured values.'}`);
      }
    }
  }

  #executeSingleStep(
    step: WorkflowStep,
    variables: Record<string, unknown>,
    createdRecordIds: string[],
    budget: { count: number },
  ): void {
    const config = step.config ?? {};

    switch (step.type) {
      case 'FOR_EACH':
      case 'SUM': {
        const items = this.#resolveValue(config.collection, variables);
        if (!Array.isArray(items) || items.length > 100) throw new WorkspaceDomainError('invalid-input', 'Iteration requires a collection of at most 100 items.');
        const results: unknown[] = []; let sum = 0;
        for (const [index, item] of (items as unknown[]).entries()) {
          const scope = { ...variables, __item: item, __index: index };
          if (step.type === 'FOR_EACH') {
            this.#executeSteps(config.steps as WorkflowStep[], scope, createdRecordIds, budget);
            if (config.yield !== undefined) results.push(this.#resolveValue(config.yield, scope));
          } else {
            if (++budget.count > 1000) throw new WorkspaceDomainError('invalid-input', 'Action exceeds 1,000 executed steps.');
            const value = this.#resolveValue(config.value, scope);
            if (typeof value !== 'number' || !Number.isFinite(value)) throw new WorkspaceDomainError('invalid-input', 'Sum requires finite numeric values.');
            sum += value;
            if (!Number.isFinite(sum)) throw new WorkspaceDomainError('invalid-input', 'Sum is too large.');
          }
        }
        if (config.outputVariable) variables[valueToText(config.outputVariable)] = step.type === 'SUM' ? sum : results;
        break;
      }
      case 'FIND_RECORD': {
        const resolveFilter = (node: FilterNode): FilterNode => node.kind === 'group'
          ? { ...node, conditions: node.conditions.map(resolveFilter) }
          : node.kind === 'property' ? { ...node, value: this.#resolveValue(node.value, variables), valueTo: this.#resolveValue(node.valueTo, variables) } : node;
        const filter = config.filter ? resolveFilter(config.filter as FilterNode) : undefined;
        const rows: { id: string }[] = [];
        let cursor: string | undefined;
        do {
          const result = this.#query.query({ databaseId: String(config.databaseId), filter, limit: config.multiple ? 200 : 1, cursor });
          rows.push(...result.records);
          cursor = config.multiple ? result.nextCursor ?? undefined : undefined;
          if (rows.length > 10000) throw new WorkspaceDomainError('invalid-input', 'Lookup exceeds 10,000 records. Narrow the filters.');
        } while (cursor);
        if (!rows.length && config.required !== false) throw new WorkspaceDomainError('not-found', 'Lookup returned no record.');
        variables[valueToText(config.outputVariable)] = config.multiple ? rows.map((row) => row.id) : rows[0]?.id ?? null;
        break;
      }
      case 'UPDATE_RECORD': {
        const record = this.#record(this.#resolveValue(config.record, variables), String(config.databaseId));
        for (const [id, value] of Object.entries((config.properties ?? {}) as Record<string, unknown>)) this.#write(record.id, id, this.#resolveValue(value, variables));
        for (const [id, value] of Object.entries((config.increments ?? {}) as Record<string, unknown>)) this.#write(record.id, id, this.#resolveValue(value, variables), true);
        if (config.outputVariable) variables[valueToText(config.outputVariable)] = record.id;
        break;
      }
      case 'VALIDATE': {
        const condition = config.condition as string | undefined;
        const errorMessage = config.errorMessage as string | undefined;
        if (condition) {
          const isValid = this.#expression(condition, variables);
          if (!isValid) {
            throw new WorkspaceDomainError('constraint-violation', errorMessage || 'Workflow validation failed.');
          }
        }
        break;
      }

      case 'COMPUTE': {
        const expression = config.expression as string | undefined;
        const outputVariable = config.outputVariable as string | undefined;
        if ((expression || config.value !== undefined) && outputVariable) {
          const val = config.value !== undefined ? this.#resolveValue(config.value, variables) : this.#expression(expression!, variables);
          variables[outputVariable] = val;
        } else if (config.assignments && typeof config.assignments === 'object') {
          for (const [varName, expr] of Object.entries(config.assignments as Record<string, string>)) {
            const val = this.#expression(expr, variables);
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
              const prop = this.#property(databaseId, pId);
              if (prop.type === 'number' && props[pId] !== null && (typeof props[pId] !== 'number' || !Number.isFinite(props[pId]))) throw new WorkspaceDomainError('invalid-input', 'A finite number is required.');
            }
          }

          const created = this.#recordRepo.createRecord({
            databaseId,
            properties: Object.fromEntries(Object.entries(props).filter(([id]) => this.#properties.getProperty(id)?.type !== 'relation')),
            title: valueToText(title) || 'Untitled',
          });

          for (const [id, value] of Object.entries(props)) if (this.#properties.getProperty(id)?.type === 'relation') this.#write(created.id, id, value);
          createdRecordIds.push(created.id);
          if (outputVariable) {
            variables[outputVariable] = created.id;
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

  #resolveValue(value: unknown, variables: Record<string, unknown>, form = false): unknown {
    if (value && typeof value === 'object' && 'source' in value) {
      const ref = value as WorkflowValue;
      switch (ref.source) {
        case 'index':
          if (!Object.hasOwn(variables, '__index')) throw new WorkspaceDomainError('invalid-input', 'Current index is unavailable.');
          return variables.__index;
        case 'item': {
          if (!Object.hasOwn(variables, '__item')) throw new WorkspaceDomainError('invalid-input', 'Current item is unavailable.');
          const item = variables.__item;
          if (!ref.field) return item;
          if (!item || typeof item !== 'object' || Array.isArray(item) || !Object.hasOwn(item, ref.field)) throw new WorkspaceDomainError('invalid-input', 'Current item field is unavailable.');
          return (item as Record<string, unknown>)[ref.field];
        }
        case 'literal': return ref.value;
        case 'variable':
          if (!Object.hasOwn(variables, ref.key)) throw new WorkspaceDomainError('invalid-input', 'Referenced value is unavailable.');
          return variables[ref.key];
        case 'property': {
          const selected = this.#resolveValue(ref.record, variables, form);
          if (form && (selected === null || selected === undefined || selected === '')) return null;
          const record = this.#record(selected, ref.databaseId);
          const property = this.#property(ref.databaseId, ref.propertyId);
          if (property.type === 'title') return record.title;
          if (property.type === 'relation') {
            const relation = this.#relationRepo.getRelationByPropertyId(property.id);
            if (!relation || relation.archivedAt) throw new WorkspaceDomainError('not-found', 'Referenced relation no longer exists.');
            return this.#relationRepo.getRelatedRecords(record.id, relation.id).map((row) => row.id);
          }
          return this.#computed.computeForRecord(record, this.#properties.listProperties(record.databaseId), form && typeof variables.now === 'string' ? variables.now : undefined)[ref.propertyId] ?? null;
        }
        case 'expression': return this.#expression(ref.expression, { ...variables, ...Object.fromEntries(Object.entries(ref.bindings).map(([key, binding]) => [key, this.#resolveValue(binding, variables, form)])) });
      }
    }
    if (typeof value !== 'string') return value;
    if (value.startsWith('$')) {
      const key = value.slice(1);
      if (!Object.hasOwn(variables, key)) throw new WorkspaceDomainError('invalid-input', 'Referenced value is unavailable.');
      return variables[key];
    }
    return this.#expression(value, variables);
  }

  #expression(expression: string, variables: Record<string, unknown>): unknown {
    try {
      const ast = this.#formulaParser.parse(expression);
      for (const key of extractFormulaDependencies(ast)) if (!Object.hasOwn(variables, key)) throw new Error('Missing value');
      const value = evaluateFormula(ast, { properties: variables, strict: true, now: typeof variables.now === 'string' ? variables.now : undefined });
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite value');
      return value;
    } catch { throw new WorkspaceDomainError('invalid-input', 'Expression is invalid or references an unavailable value.'); }
  }

  #databaseExists(id: unknown): asserts id is string {
    if (typeof id !== 'string' || !this.#database.prepare('SELECT 1 FROM workspace_databases d JOIN workspace_nodes n ON n.id = d.id WHERE d.id = ? AND n.archived_at IS NULL').get(id))
      throw new WorkspaceDomainError('not-found', 'Referenced database no longer exists in this workspace.');
  }

  #property(databaseId: string, id: string) {
    this.#databaseExists(databaseId);
    const property = this.#properties.getProperty(id);
    if (!property || property.archivedAt || property.databaseId !== databaseId) throw new WorkspaceDomainError('not-found', 'Referenced property was deleted or is outside this database.');
    return property;
  }

  #record(id: unknown, databaseId?: string) {
    const record = typeof id === 'string' ? this.#recordRepo.getRecord(id) : null;
    if (!record || record.archivedAt || (databaseId && record.databaseId !== databaseId)) throw new WorkspaceDomainError('not-found', 'Selected record is unavailable in this database.');
    this.#databaseExists(record.databaseId);
    return record;
  }

  #write(recordId: string, propertyId: string, value: unknown, increment = false) {
    const record = this.#record(recordId);
    const property = this.#property(record.databaseId, propertyId);
    const before = JSON.stringify({ ...record, relationValues: property.type === 'relation' ? this.#relationRepo.getRelatedRecords(recordId, this.#relationRepo.getRelationByPropertyId(propertyId)?.id ?? '').map((r) => r.id) : undefined });
    if (increment) {
      if (property.type !== 'number' || typeof value !== 'number' || !Number.isFinite(value)) throw new WorkspaceDomainError('invalid-input', 'Selected property does not support numeric adjustment.');
      value = Number(record.properties[propertyId] ?? 0) + value;
    }
    if (property.type === 'number' && value !== null && (typeof value !== 'number' || !Number.isFinite(value))) throw new WorkspaceDomainError('invalid-input', 'A finite number is required.');
    if (property.type === 'relation') {
      const relation = this.#relationRepo.getRelationByPropertyId(propertyId);
      if (!relation || relation.archivedAt) throw new WorkspaceDomainError('not-found', 'Referenced relation no longer exists.');
      const ids = value === null ? [] : Array.isArray(value) ? value : [value];
      const source = relation.sourcePropertyId === propertyId;
      for (const id of ids) this.#record(id, source ? relation.targetDatabaseId : relation.sourceDatabaseId);
      const old = this.#relationRepo.getRelatedRecords(recordId, relation.id);
      for (const row of old) this.#relationRepo.disconnect(relation.id, source ? recordId : row.id, source ? row.id : recordId);
      for (const id of ids as string[]) this.#relationRepo.connect(relation.id, source ? recordId : id, source ? id : recordId);
    } else if (property.type === 'title') this.#recordRepo.updateRecord(recordId, { title: valueToText(value) });
    else this.#recordRepo.updateProperty(recordId, propertyId, value);
    this.#database.prepare("INSERT INTO workspace_audit_log (entity_kind, entity_id, action, actor_id, before_json, after_json, metadata_json, created_at) VALUES ('record', ?, 'updated', 'local-user', ?, ?, ?, ?)").run(recordId, before, JSON.stringify(this.#recordRepo.getRecord(recordId)), JSON.stringify({ source: 'quick-action', propertyId, value }), new Date().toISOString());
  }

  validate(draft: WorkspaceWorkflowDraft): void {
    try { parseWorkspaceWorkflowDraft(draft); } catch { throw new WorkspaceDomainError('invalid-input', 'Action configuration is invalid.'); }
    if (draft.steps.length > 100 || draft.inputSchema.fields.length > 100) throw new WorkspaceDomainError('invalid-input', 'An action supports up to 100 inputs and steps.');
    let keys = new Set<string>(['now', 'actor_id']);
    const forbidden = (key: string) => ['__proto__', 'constructor', 'prototype', '__item', '__index'].includes(key);
    const checkFields = (fields: readonly WorkflowInputField[], names: Set<string>) => {
      for (const [index, field] of fields.entries()) {
        const key = field.key ?? field.id ?? 'input_' + (index + 1);
        if (names.has(key) || forbidden(key)) throw new WorkspaceDomainError('invalid-input', 'Input identifiers must be unique and safe.');
        if (field.prefill) {
          const source = fields.find((f, i) => (f.key ?? f.id ?? 'input_' + (i + 1)) === field.prefill!.inputKey);
          if (!names.has(field.prefill.inputKey) || source?.type !== 'record' || source.databaseId !== field.prefill.databaseId) throw new WorkspaceDomainError('invalid-input', 'Prefill must reference an earlier record input in the same row.');
          this.#property(field.prefill.databaseId, field.prefill.propertyId);
        }
        names.add(key);
        if (field.type === 'record') this.#databaseExists(field.databaseId);
        if (field.propertySource) this.#property(field.propertySource.databaseId, field.propertySource.propertyId);
        if (field.defaultValue !== undefined && !field.derived && !field.requiredWhen) this.#inputs([{ ...field, key, required: false }], { [key]: field.defaultValue });
        if (field.type === 'collection') checkFields(field.fields ?? [], new Set());
      }
    };
    checkFields(draft.inputSchema.fields, keys);
    let itemFields: Set<string> | null | undefined;
    const checkValue = (value: unknown, depth = 0): void => {
      if (depth > 12) throw new WorkspaceDomainError('invalid-input', 'Value references are too deeply nested.');
      if (value && typeof value === 'object' && 'source' in value) {
        const ref = value as WorkflowValue;
        if (ref.source === 'item' || ref.source === 'index') {
          if (itemFields === undefined) throw new WorkspaceDomainError('invalid-input', 'Current item is only available inside iteration or sum.');
          if (ref.source === 'item' && ref.field && (forbidden(ref.field) || (itemFields && !itemFields.has(ref.field)))) throw new WorkspaceDomainError('invalid-input', 'Unknown current item field.');
        }
        else if (ref.source === 'property') { this.#property(ref.databaseId, ref.propertyId); checkValue(ref.record, depth + 1); }
        else if (ref.source === 'variable') { if (!keys.has(ref.key)) throw new WorkspaceDomainError('invalid-input', 'Referenced value is unavailable at this step.'); }
        else if (ref.source === 'expression') {
          const names = new Set([...keys, ...Object.keys(ref.bindings ?? {})]);
          for (const binding of Object.values(ref.bindings ?? {})) checkValue(binding, depth + 1);
          for (const dep of extractFormulaDependencies(this.#formulaParser.parse(ref.expression))) if (!names.has(dep)) throw new WorkspaceDomainError('invalid-input', 'Expression references an unavailable value.');
        } else if (ref.source !== 'literal') throw new WorkspaceDomainError('invalid-input', 'Invalid value reference.');
      } else if (typeof value === 'string') {
        if (value.startsWith('$')) { if (!keys.has(value.slice(1))) throw new WorkspaceDomainError('invalid-input', 'Referenced value is unavailable at this step.'); }
        else for (const dep of extractFormulaDependencies(this.#formulaParser.parse(value))) if (!keys.has(dep)) throw new WorkspaceDomainError('invalid-input', 'Expression references an unavailable value.');
      }
    };
    try {
      const ids = new Set<string>();
      let stepCount = 0;
      const checkSteps = (steps: WorkspaceWorkflowDraft['steps'], depth = 0): void => {
      if (depth > 3) throw new WorkspaceDomainError('invalid-input', 'Iteration nesting exceeds three levels.');
      for (const step of steps) {
        if (++stepCount > 100) throw new WorkspaceDomainError('invalid-input', 'An action supports at most 100 configured steps.');
        if (step.id && ids.has(step.id)) throw new WorkspaceDomainError('invalid-input', 'Step identifiers must be unique.');
        if (step.id) ids.add(step.id);
        const c = step.config;
        const required = (key: string) => { if (c[key] === undefined || c[key] === null || c[key] === '') throw new WorkspaceDomainError('invalid-input', 'Step ' + (draft.steps.indexOf(step) + 1) + ': ' + key + ' is required.'); };
        if (['FIND_RECORD', 'COMPUTE', 'SUM'].includes(step.type) && !c.assignments) required('outputVariable');
        if (step.type === 'FOR_EACH' || step.type === 'SUM') {
          required('collection'); checkValue(c.collection);
          const savedFields = itemFields; const savedKeys = keys; keys = new Set(keys);
          const ref = c.collection as WorkflowValue;
          const field = ref?.source === 'variable' ? draft.inputSchema.fields.find(f => (f.key ?? f.id) === ref.key) : undefined;
          if (field && field.type !== 'collection') throw new WorkspaceDomainError('invalid-input', 'Iteration requires a collection input.');
          itemFields = field?.fields ? new Set(field.fields.map((f, i) => f.key ?? f.id ?? 'input_' + (i + 1))) : null;
          if (step.type === 'FOR_EACH') {
            checkSteps(c.steps as WorkflowStep[], depth + 1);
            if (c.outputVariable && c.yield === undefined) throw new WorkspaceDomainError('invalid-input', 'Iteration output requires a yield value.');
            if (c.yield !== undefined) checkValue(c.yield);
          } else { required('value'); checkValue(c.value); }
          keys = savedKeys; itemFields = savedFields;
        }
        if (step.type === 'UPDATE_RECORD') required('record');
        if (step.type === 'COMPUTE' && c.value === undefined && !c.assignments) required('expression');
        if (step.type === 'VALIDATE') { required('condition'); checkValue(c.condition); }
        if (step.type === 'RETURN_RESULT') { if (c.resultExpression) checkValue(c.resultExpression); else for (const value of Object.values(c)) if (typeof value === 'string' && value.charCodeAt(0) === 36) checkValue(value); }
        for (const key of ['properties', 'propertyValues', 'increments', 'assignments']) if (c[key] !== undefined && (!c[key] || typeof c[key] !== 'object' || Array.isArray(c[key]))) throw new WorkspaceDomainError('invalid-input', 'Property mappings must be an object.');
        for (const key of ['multiple', 'required']) if (c[key] !== undefined && typeof c[key] !== 'boolean') throw new WorkspaceDomainError('invalid-input', 'Lookup options must be boolean.');
        if (['CREATE_RECORD', 'FIND_RECORD', 'UPDATE_RECORD'].includes(step.type)) this.#databaseExists(c.databaseId);
        if (step.type === 'CREATE_RECORD' || step.type === 'UPDATE_RECORD') {
          const mappings = (c.propertyValues ?? c.properties ?? {}) as Record<string, unknown>;
          for (const [id, value] of Object.entries(mappings)) {
            const property = this.#property(String(c.databaseId), id);
            if (['formula', 'rollup', 'created_time', 'created_by', 'last_edited_time', 'last_edited_by', 'auto_id', 'button'].includes(property.type)) throw new WorkspaceDomainError('invalid-input', 'Selected property does not support this operation.');
            checkValue(value);
          }
          for (const [id, value] of Object.entries((c.increments ?? {}) as Record<string, unknown>)) {
            if (this.#property(String(c.databaseId), id).type !== 'number') throw new WorkspaceDomainError('invalid-input', 'Selected property does not support numeric adjustment.');
            checkValue(value);
          }
          if (step.type === 'CREATE_RECORD') checkValue(c.titleExpression ?? c.title ?? "'Untitled'");
          else checkValue(c.record);
        }
        if (step.type === 'FIND_RECORD') {
          parseDatabaseQueryParams({ databaseId: c.databaseId, filter: c.filter });
          const filter = c.filter as FilterNode | undefined;
          const walk = (node: FilterNode, depth = 0): void => {
            if (depth > 8) throw new WorkspaceDomainError('invalid-input', 'Filter is too deeply nested.');
            if (node.kind === 'group') node.conditions.forEach((child) => walk(child, depth + 1));
            else if (node.kind === 'property') { this.#property(String(c.databaseId), node.propertyId); checkValue(node.value); checkValue(node.valueTo); }
            else throw new WorkspaceDomainError('invalid-input', 'Use a property filter for this lookup.');
          };
          if (filter) walk(filter);
        }
        if (step.type === 'COMPUTE') {
          if (c.value !== undefined) checkValue(c.value);
          else if (c.expression) checkValue(c.expression);
          else for (const [key, expr] of Object.entries((c.assignments ?? {}) as Record<string, unknown>)) { if (forbidden(key)) throw new WorkspaceDomainError('invalid-input', 'Reserved output identifier.'); checkValue(expr); keys.add(key); }
        }
        if (typeof c.outputVariable === 'string') { if (keys.has(c.outputVariable) || forbidden(c.outputVariable)) throw new WorkspaceDomainError('invalid-input', 'Output identifiers must be unique.'); keys.add(c.outputVariable); }
      }
      };
      assertDerivedOrder(draft.inputSchema.fields);
      const formFields = (fields: readonly WorkflowInputField[], child = false) => {
        const saved = itemFields; itemFields = child ? new Set(fields.map((f, i) => f.key ?? f.id ?? 'input_' + (i + 1))) : undefined;
        for (const f of fields) {
          for (const value of [f.derived?.value, f.visibleWhen, f.requiredWhen, f.disabledWhen]) if (value) checkValue(value);
          if (f.displayPropertyIds) for (const id of f.displayPropertyIds) this.#property(f.databaseId!, id);
          if (f.pickerFilter) {
            parseDatabaseQueryParams({ databaseId: f.databaseId, filter: f.pickerFilter });
            const walk = (node: FilterNode): void => { if (node.kind === 'group') node.conditions.forEach(walk); else if (node.kind === 'property') { this.#property(f.databaseId!, node.propertyId); for (const value of [node.value, node.valueTo]) if (value && typeof value === 'object' && 'source' in value) checkValue(value); } else throw new WorkspaceDomainError('invalid-input', 'Picker filters support property conditions and groups.'); }; walk(f.pickerFilter);
          }
          if (f.fields) formFields(f.fields, true);
        } itemFields = saved;
      };
      formFields(draft.inputSchema.fields);
      const ruleIds = new Set<string>();
      for (const rule of draft.inputSchema.rules ?? []) {
        if (ruleIds.has(rule.id)) throw new WorkspaceDomainError('invalid-input', 'Rule IDs must be unique.'); ruleIds.add(rule.id);
        if (rule.collection) { checkValue(rule.collection); itemFields = null; }
        checkValue(rule.condition); itemFields = undefined;
      }
      for (const summary of draft.inputSchema.summary ?? []) checkValue(summary.value);
      checkSteps(draft.steps);
    } catch (error) { if (error instanceof WorkspaceDomainError) throw error; throw new WorkspaceDomainError('invalid-input', 'Action configuration or expression is invalid: ' + (error instanceof Error ? error.message : 'Unknown error')); }
  }

  #inputs(fields: readonly WorkflowInputField[], inputs: Readonly<Record<string, unknown>>, path = ''): Record<string, unknown> {
    if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) throw new WorkspaceDomainError('invalid-input', 'Input row must be an object.');
    const allowed = fields.map((f, i) => f.key ?? f.id ?? 'input_' + (i + 1));
    if (path && Object.keys(inputs).some(k => !allowed.includes(k))) throw new WorkspaceDomainError('invalid-input', path + ': unknown row field.');
    const result: Record<string, unknown> = {};
    for (const [index, field] of fields.entries()) {
      const key = allowed[index]!; const label = path + field.label;
      let value = inputs[key] ?? field.defaultValue;
      if ((value === undefined || value === '') && field.prefill && result[field.prefill.inputKey]) value = this.#resolveValue({ source: 'property', record: { source: 'literal', value: result[field.prefill.inputKey] }, databaseId: field.prefill.databaseId, propertyId: field.prefill.propertyId }, {});
      if (field.type === 'collection') {
        value ??= [];
        if (!Array.isArray(value) || value.length < Math.max(field.minItems ?? 0, field.required ? 1 : 0) || value.length > (field.maxItems ?? 100)) throw new WorkspaceDomainError('invalid-input', label + ': invalid number of rows (maximum 100).');
        result[key] = value.map((row, i) => this.#inputs(field.fields ?? [], row as Record<string, unknown>, label + ' row ' + (i + 1) + ' · '));
        continue;
      }
      if (value === undefined || value === null || value === '') {
        if (field.required) throw new WorkspaceDomainError('invalid-input', label + ' is required.');
        result[key] = value; continue;
      }
      if (field.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) throw new WorkspaceDomainError('invalid-input', label + ' must be a finite number.');
      if (field.type === 'record') this.#record(value, field.databaseId);
      if (['text', 'string', 'date', 'datetime'].includes(field.type) && typeof value !== 'string') throw new WorkspaceDomainError('invalid-input', label + ' must be text.');
      if (['date', 'datetime'].includes(field.type) && !Number.isFinite(Date.parse(valueToText(value)))) throw new WorkspaceDomainError('invalid-input', label + ' must be a valid date.');
      if (field.type === 'boolean' && typeof value !== 'boolean') throw new WorkspaceDomainError('invalid-input', label + ' must be boolean.');
      if (field.type === 'select' && !field.options?.some(o => o.value === value)) throw new WorkspaceDomainError('invalid-input', label + ' is not an allowed option.');
      result[key] = value;
    }
    return result;
  }

  #nextPositionKey(): string {
    const lastRow = this.#database
      .prepare('SELECT position_key FROM workspace_workflows WHERE archived_at IS NULL ORDER BY position_key DESC LIMIT 1')
      .get() as { position_key: string } | undefined;

    return generateOrderKey(lastRow?.position_key, null);
  }
}