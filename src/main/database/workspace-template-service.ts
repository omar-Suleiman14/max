import { randomUUID } from 'node:crypto';

import type { TemplateImportResult, WorkspaceTemplateV2 } from '../../shared/template-v2-contract';
import type { RollupAggregation } from '../../shared/property-contract';
import type { FilterNode, GroupRule, SortRule } from '../../shared/query-contract';
import type { WorkflowInputSchema, WorkflowStep } from '../../shared/workflow-contract';
import type { DatabaseUnitOfWork } from './database-unit-of-work';
import type { DatabaseRepository } from './database-repository';
import type { PropertyRepository } from './property-repository';
import type { RelationRepository } from './relation-repository';
import type { ViewRepository } from './view-repository';
import type { WorkflowService } from './workflow-service';
import type { WorkspaceRepository } from './workspace-repository';
import type { RecordTemplateRepository } from './record-template-repository';
import type { RecordRepository } from './record-repository';
import { WorkspaceDomainError } from '../../shared/workspace-contract';
import { FormulaParser } from './formula/parser';
import { extractFormulaDependencies } from './formula/dependency-extractor';
import type { WorkspaceView } from '../../shared/view-contract';

type ImportMaps = Readonly<{
  databaseMap: Map<string, string>;
  pageMap: Map<string, string>;
  propertyMap: Map<string, string>;
  relationMap: Map<string, string>;
  viewMap: Map<string, string>;
  workflowMap: Map<string, string>;
  recordMap: Map<string, string>;
}>;

const ROLLUP_AGGREGATIONS: readonly RollupAggregation[] = [
  'sum', 'avg', 'min', 'max', 'count', 'count_values', 'count_empty',
  'count_unique', 'earliest', 'latest',
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRollupConfig(value: unknown): value is Readonly<{
  aggregation: RollupAggregation;
  relationPropertyId: string;
  targetPropertyId: string;
}> {
  return isObject(value)
    && typeof value.aggregation === 'string'
    && ROLLUP_AGGREGATIONS.some((aggregation) => aggregation === value.aggregation)
    && typeof value.relationPropertyId === 'string'
    && typeof value.targetPropertyId === 'string';
}

function remapText(value: string, references: ReadonlyMap<string, string>): string {
  // Exact IDs and bracketed formula references only. Never replace words in
  // user prose, labels, URLs or larger IDs. Serialized blocks are walked as JSON.
  if (references.has(value)) return references.get(value)!;
  if (value.trimStart().startsWith('[') || value.trimStart().startsWith('{')) {
    try { return JSON.stringify(remapValue(JSON.parse(value), references)); } catch { /* Formula, not JSON. */ }
  }
  return value.replace(/\[([^\]]+)\]/g, (token, key: string) => references.has(key.trim()) ? `[${references.get(key.trim())!}]` : token)
    .replace(/max-page:([^\s)]+)/g, (token, key: string) => { try { const id = references.get(decodeURIComponent(key)); return id ? `max-page:${encodeURIComponent(id)}` : token; } catch { return token; } });
}

function remapValue(value: unknown, references: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') return remapText(value, references);
  if (Array.isArray(value)) return value.map((entry) => remapValue(entry, references));
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [references.get(key) ?? key, remapValue(entry, references)]),
    );
  }
  return value;
}

export class WorkspaceTemplateService {
  readonly #unitOfWork: DatabaseUnitOfWork;
  readonly #databaseRepo: DatabaseRepository;
  readonly #propertyRepo: PropertyRepository;
  readonly #relationRepo: RelationRepository;
  readonly #viewRepo: ViewRepository;
  readonly #workflowService: WorkflowService;
  readonly #workspaceRepo: WorkspaceRepository;
  readonly #recordTemplateRepo: RecordTemplateRepository;
  readonly #records: RecordRepository;

  constructor(
    unitOfWork: DatabaseUnitOfWork,
    databaseRepo: DatabaseRepository,
    propertyRepo: PropertyRepository,
    relationRepo: RelationRepository,
    viewRepo: ViewRepository,
    workflowService: WorkflowService,
    workspaceRepo: WorkspaceRepository,
    recordTemplateRepo: RecordTemplateRepository,
    records: RecordRepository,
  ) {
    this.#unitOfWork = unitOfWork;
    this.#databaseRepo = databaseRepo;
    this.#propertyRepo = propertyRepo;
    this.#relationRepo = relationRepo;
    this.#viewRepo = viewRepo;
    this.#workflowService = workflowService;
    this.#workspaceRepo = workspaceRepo;
    this.#recordTemplateRepo = recordTemplateRepo;
    this.#records = records;
  }

  validateTemplate(template: WorkspaceTemplateV2): void {
    // Exercise the exact import path, including repository/workflow constraints,
    // and roll back every write before returning the preview to the renderer.
    this.#unitOfWork.preview(() => this.#importCore(template));
  }

  exportTemplate(): WorkspaceTemplateV2 {
    const databases = this.#databaseRepo.listDatabases();
    const activeDatabaseIds = new Set(databases.map((db) => db.id));
    const pages = this.#workspaceRepo.listPages();
    const records = new Map(databases.map((db) => [db.id, this.#records.listRecords(db.id)]));
    const templates = new Map(databases.map((db) => [db.id, this.#recordTemplateRepo.list(db.id)]));
    const linkedViews = new Map<string, WorkspaceView>();
    const contentMap = new Map<string, string>();
    const exportContent = (text: string | null | undefined): string => {
      if (!text) return '[]';
      const cached = contentMap.get(text);
      if (cached) return cached;
      const walk = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.filter((entry) => !isObject(entry) || entry.type !== 'database-view' || (typeof entry.databaseId === 'string' && activeDatabaseIds.has(entry.databaseId))).map(walk);
        if (!isObject(value)) return value;
        const next = { ...value };
        if (next.type === 'database-view' && typeof next.viewId === 'string') {
          const view = this.#viewRepo.getView(next.viewId);
          if (view && !view.archivedAt && view.databaseId === next.databaseId) linkedViews.set(view.id, view);
          else delete next.viewId;
        }
        return Object.fromEntries(Object.entries(next).map(([key, entry]) => [key, walk(entry)]));
      };
      const result = JSON.stringify(walk(JSON.parse(text)));
      contentMap.set(text, result);
      return result;
    };
    for (const node of [...pages, ...[...records.values()].flat(), ...[...templates.values()].flat()]) exportContent(node.contentJson);
    const relations = [...new Map(databases.flatMap((db) => this.#relationRepo.listRelations(db.id)).filter((r) => !r.archivedAt).map((r) => [r.id, r])).values()];
    return {
      version: 2, name: 'Workspace blueprint',
      databases: databases.map((db) => ({
        key: db.id, title: db.title, icon: db.icon ?? undefined, visibility: db.visibility,
        parentPageKey: this.#workspaceRepo.getNode(db.id)?.parentNodeId ?? undefined,
        positionKey: this.#workspaceRepo.getNode(db.id)?.positionKey,
        defaultViewKey: db.defaultViewId ?? undefined,
        properties: this.#propertyRepo.listProperties(db.id).map((p) => ({
          key: p.id, name: p.name, type: p.type, config: p.config, required: p.required, uniqueValue: p.uniqueValue,
          defaultValue: p.defaultValueJson ? JSON.parse(p.defaultValueJson) as unknown : undefined,
          options: p.options?.filter((o) => !o.archivedAt).map((o) => ({ key: o.id, label: o.label, style: o.style, statusGroupKey: o.statusGroupId ?? undefined })),
          statusGroups: p.statusGroups?.map((g) => ({ key: g.id, label: g.label, category: g.category })),
        })),
        views: [...new Map([...this.#viewRepo.listViews(db.id), ...[...linkedViews.values()].filter((view) => view.databaseId === db.id)].map((view) => [view.id, view])).values()].map((v) => ({ key: v.id, name: v.name, layout: v.layout, filterAst: v.filterAst, group: v.group, sorts: v.sorts, layoutConfig: v.layoutConfig, propertyState: v.propertyState })),
      })),
      relations: relations.map((r) => ({ key: r.id, sourceDatabaseKey: r.sourceDatabaseId, targetDatabaseKey: r.targetDatabaseId, sourcePropertyKey: r.sourcePropertyId, inversePropertyKey: r.inversePropertyId ?? undefined, sourceCardinality: r.sourceCardinality, targetCardinality: r.targetCardinality })),
      records: databases.flatMap((db) => (records.get(db.id) ?? []).map((record) => ({
        key: record.id, databaseKey: db.id, title: record.title, icon: record.icon ?? undefined, contentJson: exportContent(record.contentJson),
        properties: {
          ...Object.fromEntries(Object.entries(record.properties).filter(([id]) => !['formula', 'rollup', 'button', 'created_time', 'created_by', 'last_edited_time', 'last_edited_by', 'relation'].includes(this.#propertyRepo.getProperty(id)?.type ?? ''))),
          ...Object.fromEntries(relations.filter((r) => r.sourceDatabaseId === db.id).map((r) => [r.sourcePropertyId, this.#relationRepo.getRelatedRecords(record.id, r.id).map((target) => target.id)])),
        },
      }))),
      pages: pages.map((p) => ({ key: p.id, title: p.title, icon: p.icon ?? undefined, contentJson: exportContent(p.contentJson), parentPageKey: p.parentNodeId ?? undefined, positionKey: p.positionKey })),
      recordTemplates: databases.flatMap((db) => (templates.get(db.id) ?? []).map((t) => ({ key: t.id, databaseKey: db.id, name: t.name, icon: t.icon ?? undefined, defaults: t.defaults, contentJson: exportContent(t.contentJson) }))),
      workflows: this.#workflowService.listWorkflows().map((w) => ({ key: w.id, name: w.name, icon: w.icon ?? undefined, enabled: w.enabled, inputSchema: w.inputSchema, steps: w.steps })),
    };
  }

  importTemplate(template: WorkspaceTemplateV2): { databaseMap: Map<string, string>; propertyMap: Map<string, string> } {
    const maps = this.#unitOfWork.run(() => this.#importCore(template));
    return { databaseMap: maps.databaseMap, propertyMap: maps.propertyMap };
  }

  importBlueprintV2(template: WorkspaceTemplateV2): TemplateImportResult {
    return this.#unitOfWork.run(() => {
      const maps = this.#importCore(template);
      const databases = template.databases.flatMap((database) => {
        const id = maps.databaseMap.get(database.key);
        return id ? [{ id, key: database.key, title: database.title }] : [];
      });
      const pages = (template.pages ?? []).flatMap((page) => {
        const id = maps.pageMap.get(page.key);
        return id ? [{ id, key: page.key, title: page.title }] : [];
      });
      return {
        databaseCount: databases.length,
        databases,
        pageCount: pages.length,
        pages,
        propertyCount: maps.propertyMap.size,
        recordCount: maps.recordMap.size,
        relationCount: maps.relationMap.size,
        workflowCount: maps.workflowMap.size,
      };
    });
  }

  #importCore(template: WorkspaceTemplateV2): ImportMaps {
    const databaseMap = new Map<string, string>();
    const pageMap = new Map<string, string>();
    const propertyMap = new Map<string, string>();
    const relationMap = new Map<string, string>();
    const viewMap = new Map<string, string>();
    const workflowMap = new Map<string, string>();
    const recordMap = new Map<string, string>();
    const optionMap = new Map<string, string>();
    const statusGroupMap = new Map<string, string>();
    const recordTemplateMap = new Map<string, string>();

    for (const record of template.records ?? []) recordMap.set(record.key, randomUUID());
    const importedRecordIds = new Set(recordMap.values());
    for (const page of template.pages ?? []) pageMap.set(page.key, randomUUID());
    for (const recordTemplate of template.recordTemplates ?? []) recordTemplateMap.set(recordTemplate.key, randomUUID());

    for (const relation of template.relations) relationMap.set(relation.key, randomUUID());
    for (const database of template.databases) {
      for (const view of database.views) viewMap.set(view.key, randomUUID());
    }
    for (const workflow of template.workflows ?? []) workflowMap.set(workflow.key, randomUUID());

    // 1. Databases and their Properties.
    for (const databaseDraft of template.databases) {
      const createdDatabase = this.#databaseRepo.createDatabase({
        icon: databaseDraft.icon,
        title: databaseDraft.title,
        visibility: databaseDraft.visibility,
        positionKey: databaseDraft.positionKey,
      });
      databaseMap.set(databaseDraft.key, createdDatabase.id);

      const titleProperty = this.#databaseRepo
        .getSchema(createdDatabase.id)
        .properties.find((property) => property.type === 'title');
      const titleDraft = databaseDraft.properties.find((property) => property.type === 'title');
      if (titleProperty && titleDraft) {
        propertyMap.set(titleDraft.key, titleProperty.id);
        if (titleDraft.name !== titleProperty.name) {
          this.#propertyRepo.updateProperty(titleProperty.id, { name: titleDraft.name });
        }
      }

      for (const propertyDraft of databaseDraft.properties) {
        if (propertyDraft.type === 'title') continue;
        for (const group of propertyDraft.statusGroups ?? []) statusGroupMap.set(group.key, randomUUID());
        const createdProperty = this.#propertyRepo.createProperty({
          config: propertyDraft.config,
          databaseId: createdDatabase.id,
          defaultValueJson: propertyDraft.defaultValue === undefined
            ? undefined
            : JSON.stringify(propertyDraft.defaultValue),
          name: propertyDraft.name,
          options: propertyDraft.options?.map((option) => {
            const id = randomUUID();
            if (option.key) optionMap.set(option.key, id);
            return { id, label: option.label, style: option.style, statusGroupId: option.statusGroupKey ? statusGroupMap.get(option.statusGroupKey) : undefined };
          }),
          statusGroups: propertyDraft.statusGroups?.map((group) => ({ id: statusGroupMap.get(group.key), label: group.label, category: group.category })),
          required: propertyDraft.required,
          type: propertyDraft.type,
          uniqueValue: propertyDraft.uniqueValue,
        });
        propertyMap.set(propertyDraft.key, createdProperty.id);
      }
    }

    const references = new Map<string, string>([
      ...databaseMap,
      ...propertyMap,
      ...relationMap,
      ...viewMap,
      ...workflowMap,
      ...pageMap,
      ...recordMap,
      ...optionMap,
      ...statusGroupMap,
      ...recordTemplateMap,
    ]);

    // 2. Relations, including a predeclared inverse Property when supplied.
    for (const relationDraft of template.relations) {
      const sourceDatabaseId = databaseMap.get(relationDraft.sourceDatabaseKey);
      const targetDatabaseId = databaseMap.get(relationDraft.targetDatabaseKey);
      const sourcePropertyId = propertyMap.get(relationDraft.sourcePropertyKey);
      const relationId = relationMap.get(relationDraft.key);
      if (!sourceDatabaseId || !targetDatabaseId || !sourcePropertyId || !relationId) continue;

      this.#relationRepo.createRelation({
        id: relationId,
        inversePropertyId: relationDraft.inversePropertyKey
          ? propertyMap.get(relationDraft.inversePropertyKey) ?? null
          : null,
        inversePropertyName: relationDraft.inversePropertyKey ? null : relationDraft.inversePropertyName,
        sourceCardinality: relationDraft.sourceCardinality,
        sourceDatabaseId,
        sourcePropertyId,
        targetCardinality: relationDraft.targetCardinality,
        targetDatabaseId,
      });
    }

    // 3. Resolve every config after all stable IDs exist. This covers Formula,
    // Rollup, Relation and Button/Workflow references without name lookups.
    for (const databaseDraft of template.databases) {
      for (const propertyDraft of databaseDraft.properties) {
        const propertyId = propertyMap.get(propertyDraft.key);
        if (!propertyId) continue;
        if (propertyDraft.defaultValue !== undefined) this.#propertyRepo.updateProperty(propertyId, { defaultValueJson: JSON.stringify(remapValue(propertyDraft.defaultValue, references)) });
        if (!propertyDraft.config) continue;
        const remapped = remapValue(propertyDraft.config, references);
        if (!isObject(remapped)) continue;

        const rollup = remapped.rollup;
        if (propertyDraft.type === 'rollup') {
          if (!isRollupConfig(rollup)) throw new WorkspaceDomainError('invalid-input', `Rollup ${propertyDraft.name} needs a relation, target property and aggregation.`);
          const relation = this.#relationRepo.getRelationByPropertyId(rollup.relationPropertyId);
          const target = this.#propertyRepo.getProperty(rollup.targetPropertyId);
          const source = this.#propertyRepo.getProperty(rollup.relationPropertyId);
          const targetDatabaseId = relation?.sourcePropertyId === rollup.relationPropertyId ? relation?.targetDatabaseId : relation?.sourceDatabaseId;
          if (!relation || source?.databaseId !== databaseMap.get(databaseDraft.key) || target?.databaseId !== targetDatabaseId) throw new WorkspaceDomainError('invalid-input', `Rollup ${propertyDraft.name} references an unavailable relation or property.`);
        }
        if (propertyDraft.type === 'formula') {
          const formula = remapped.formula;
          const expression = typeof formula === 'string' ? formula : isObject(formula) ? formula.expression : undefined;
          if (typeof expression !== 'string') throw new WorkspaceDomainError('invalid-input', `Formula ${propertyDraft.name} needs an expression.`);
          try {
            for (const id of extractFormulaDependencies(new FormulaParser().parse(expression))) {
              if (id !== 'title' && id !== 'Name' && this.#propertyRepo.getProperty(id)?.databaseId !== databaseMap.get(databaseDraft.key)) throw new Error('Missing property');
            }
          } catch { throw new WorkspaceDomainError('invalid-input', `Formula ${propertyDraft.name} is invalid or references an unavailable property.`); }
        }
        this.#propertyRepo.updateProperty(propertyId, { config: { ...this.#propertyRepo.getProperty(propertyId)?.config, ...remapped } });
      }
    }

    // 4. Saved Views and default View selection.
    for (const databaseDraft of template.databases) {
      const databaseId = databaseMap.get(databaseDraft.key);
      if (!databaseId || databaseDraft.views.length === 0) continue;
      const generatedDefaultViewId = this.#databaseRepo.getDatabase(databaseId)?.defaultViewId;

      for (const viewDraft of databaseDraft.views) {
        const viewId = viewMap.get(viewDraft.key);
        if (!viewId) continue;
        const remappedFilter = remapValue(viewDraft.filterAst, references) as FilterNode | null | undefined;
        const remappedSorts = remapValue(viewDraft.sorts, references) as readonly SortRule[] | undefined;
        const remappedLayout = remapValue(viewDraft.layoutConfig ?? {}, references);
        this.#viewRepo.createView({
          databaseId,
          filterAst: remappedFilter,
          group: remapValue(viewDraft.group, references) as GroupRule | null | undefined,
          id: viewId,
          layout: viewDraft.layout,
          layoutConfig: isObject(remappedLayout) ? remappedLayout : {},
          name: viewDraft.name,
          propertyState: (() => {
            const state = viewDraft.propertyState ? remapValue(viewDraft.propertyState, references) as NonNullable<typeof viewDraft.propertyState> : { columns: (viewDraft.propertyKeys ?? []).map((key) => ({ propertyId: propertyMap.get(key)! })) };
            const specified = new Set(state.columns.map((column) => column.propertyId));
            return { ...state, columns: [...state.columns, ...this.#propertyRepo.listProperties(databaseId).filter((property) => !specified.has(property.id)).map((property) => ({ propertyId: property.id, hidden: viewDraft.propertyKeys !== undefined && !viewDraft.propertyState }))] };
          })(),
          sorts: remappedSorts,
        });
      }

      const defaultViewId = databaseDraft.defaultViewKey
        ? viewMap.get(databaseDraft.defaultViewKey)
        : viewMap.get(databaseDraft.views[0]?.key ?? '');
      if (defaultViewId) this.#databaseRepo.updateDatabase(databaseId, { defaultViewId });
      if (generatedDefaultViewId) this.#viewRepo.archiveView(generatedDefaultViewId);
    }

    // 5. Reusable record templates apply defaults and starter page content.
    for (const templateDraft of template.recordTemplates ?? []) {
      const databaseId = databaseMap.get(templateDraft.databaseKey);
      if (!databaseId) continue;
      const defaults = remapValue(templateDraft.defaults ?? {}, references);
      this.#recordTemplateRepo.create({
        id: recordTemplateMap.get(templateDraft.key),
        contentJson: remapText(templateDraft.contentJson ?? '[]', references),
        databaseId,
        defaults: isObject(defaults) ? defaults : {},
        icon: templateDraft.icon,
        name: templateDraft.name,
      });
    }

    // 6. Pages keep their blocks as canonical JSON and remap linked IDs.
    for (const pageDraft of template.pages ?? []) {
      const id = pageMap.get(pageDraft.key)!;
      const contentJson = remapText(pageDraft.contentJson, references);
      const page = this.#workspaceRepo.createNode({
        contentJson,
        icon: pageDraft.icon,
        id,
        kind: 'page',
        positionKey: pageDraft.positionKey,
        title: pageDraft.title,
      });
      pageMap.set(pageDraft.key, page.id);
    }
    for (const draft of [...template.databases, ...(template.pages ?? [])]) {
      if (draft.parentPageKey) this.#workspaceRepo.updateNode(databaseMap.get(draft.key) ?? pageMap.get(draft.key)!, { parentNodeId: pageMap.get(draft.parentPageKey)! });
    }

    // Create all seed records before connecting relations, allowing forward and
    // circular record references without bypassing normal record persistence.
    for (const draft of template.records ?? []) {
      const databaseId = databaseMap.get(draft.databaseKey)!;
      const properties = remapValue(draft.properties ?? {}, references) as Record<string, unknown>;
      const scalar: Record<string, unknown> = {};
      for (const [id, value] of Object.entries(properties)) {
        const property = this.#propertyRepo.getProperty(id);
        if (!property || property.databaseId !== databaseId) throw new WorkspaceDomainError('invalid-input', 'Seed record references an unavailable property.');
        if (['formula', 'rollup', 'button', 'created_time', 'created_by', 'last_edited_time', 'last_edited_by'].includes(property.type)) throw new WorkspaceDomainError('invalid-input', 'Seed records cannot assign computed properties.');
        if (property.type === 'number' && value != null && (typeof value !== 'number' || !Number.isFinite(value))) throw new WorkspaceDomainError('invalid-input', `Seed property ${property.name} requires a finite number.`);
        if (property.type === 'checkbox' && value != null && typeof value !== 'boolean') throw new WorkspaceDomainError('invalid-input', `Seed property ${property.name} requires a boolean.`);
        if (property.type !== 'relation') scalar[id] = value;
      }
      this.#records.createRecord({ id: recordMap.get(draft.key), databaseId, title: draft.title, icon: draft.icon, contentJson: remapText(draft.contentJson ?? '[]', references), properties: scalar });
    }
    for (const draft of template.records ?? []) {
      for (const [id, value] of Object.entries(remapValue(draft.properties ?? {}, references) as Record<string, unknown>)) {
        if (this.#propertyRepo.getProperty(id)?.type !== 'relation') continue;
        const relation = this.#relationRepo.getRelationByPropertyId(id);
        if (!relation) throw new WorkspaceDomainError('invalid-input', 'Seed record relation is not configured.');
        const source = relation.sourcePropertyId === id;
        const ids = value == null ? [] : Array.isArray(value) ? value : [value];
        for (const targetId of ids) {
          const target = typeof targetId === 'string' ? this.#records.getRecord(targetId) : null;
          if (!target || !importedRecordIds.has(target.id) || target.databaseId !== (source ? relation.targetDatabaseId : relation.sourceDatabaseId)) throw new WorkspaceDomainError('invalid-input', 'Seed relation must reference a record in the blueprint target database.');
          const sourceId = source ? recordMap.get(draft.key)! : target.id;
          const destinationId = source ? target.id : recordMap.get(draft.key)!;
          if (relation.targetCardinality === 'one' && this.#relationRepo.getEdgesForRecords(relation.id, [sourceId], true).get(sourceId)?.some((id) => id !== destinationId)) throw new WorkspaceDomainError('invalid-input', 'Seed records exceed relation cardinality.');
          if (relation.sourceCardinality === 'one' && this.#relationRepo.getEdgesForRecords(relation.id, [destinationId], false).get(destinationId)?.some((id) => id !== sourceId)) throw new WorkspaceDomainError('invalid-input', 'Seed records exceed relation cardinality.');
          this.#relationRepo.connect(relation.id, source ? recordMap.get(draft.key)! : target.id, source ? target.id : recordMap.get(draft.key)!);
        }
      }
    }

    // 7. Workflows are imported with all Database/Property/Relation IDs fixed.
    for (const workflowDraft of template.workflows ?? []) {
      const id = workflowMap.get(workflowDraft.key);
      if (!id) continue;
      const remappedInputs = remapValue(workflowDraft.inputSchema, references) as WorkflowInputSchema;
      const hydrate = (fields: WorkflowInputSchema['fields']): WorkflowInputSchema['fields'] => fields.map(field => ({ ...field,
        ...(field.fields ? { fields: hydrate(field.fields) } : {}),
        ...(field.type === 'select' && field.propertySource ? { options: this.#propertyRepo.getProperty(field.propertySource.propertyId)?.options?.map(option => ({ label: option.label, value: option.id })) ?? [] } : {}),
      }));
      const inputSchema: WorkflowInputSchema = { ...remappedInputs, fields: hydrate(remappedInputs.fields) };
      const steps = remapValue(workflowDraft.steps, references) as readonly WorkflowStep[];
      try {
        this.#workflowService.createWorkflow({
          enabled: workflowDraft.enabled,
          icon: workflowDraft.icon,
          id,
          inputSchema,
          name: workflowDraft.name,
          steps,
        });
      } catch (error) {
        if (error instanceof WorkspaceDomainError) {
          throw new WorkspaceDomainError(error.code, `Action "${workflowDraft.name}": ${error.message}`);
        }
        throw error;
      }
    }

    return { databaseMap, pageMap, propertyMap, relationMap, viewMap, workflowMap, recordMap };
  }
}
