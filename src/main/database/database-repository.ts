import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { generateOrderKey } from '../../shared/order-key';
import { WorkspaceDomainError } from '../../shared/workspace-contract';
import type {
  DatabaseSchema,
  WorkspaceDatabase,
  WorkspaceDatabaseDraft,
  WorkspaceDatabasePatch,
} from '../../shared/database-contract';
import type { FilterNode, GroupRule, SortRule } from '../../shared/query-contract';
import type { PropertyViewState, ViewLayout, WorkspaceView } from '../../shared/view-contract';
import type { WorkspaceRepository } from './workspace-repository';
import type { PropertyRepository } from './property-repository';
import type { RecordRepository } from './record-repository';

type DatabaseRow = Readonly<{
  created_at: string;
  default_view_id: string | null;
  id: string;
  updated_at: string;
  visibility: WorkspaceDatabase['visibility'];
}>;

type FullDatabaseRow = DatabaseRow & Readonly<{
  archived_at: string | null;
  icon: string | null;
  parent_node_id: string | null;
  position_key: string;
  revision: number;
  title: string;
}>;

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export class DatabaseRepository {
  readonly #database: DatabaseSync;
  readonly #workspaceRepo: WorkspaceRepository;
  readonly #propertyRepo: PropertyRepository;
  readonly #recordRepo: RecordRepository;

  constructor(
    database: DatabaseSync,
    workspaceRepo: WorkspaceRepository,
    propertyRepo: PropertyRepository,
    recordRepo: RecordRepository,
  ) {
    this.#database = database;
    this.#workspaceRepo = workspaceRepo;
    this.#propertyRepo = propertyRepo;
    this.#recordRepo = recordRepo;
  }

  createDatabase(draft: WorkspaceDatabaseDraft): WorkspaceDatabase & { title: string; icon?: string | null } {
    const id = draft.id ?? randomUUID();
    const now = new Date().toISOString();
    const title = draft.title.trim();
    if (!title) {
      throw new WorkspaceDomainError('invalid-input', 'Database title must not be empty.');
    }

    const visibility = draft.visibility ?? 'normal';

    // 1. Create Workspace Node
    const node = this.#workspaceRepo.createNode({
      icon: draft.icon,
      id,
      kind: 'database',
      parentNodeId: draft.parentNodeId,
      positionKey: draft.positionKey,
      title,
    });

    // 2. Insert into workspace_databases
    this.#database
      .prepare(`
        INSERT INTO workspace_databases (id, default_view_id, visibility, created_at, updated_at)
        VALUES (?, NULL, ?, ?, ?)
      `)
      .run(id, visibility, now, now);

    // 3. Create mandatory Title property
    this.#propertyRepo.createProperty({
      databaseId: id,
      name: 'Name',
      required: true,
      type: 'title',
    });

    // 4. Create default Table view
    const defaultViewId = randomUUID();
    const defaultViewPos = generateOrderKey();
    this.#database
      .prepare(`
        INSERT INTO workspace_views (
          id, database_id, owner_type, owner_id, name, layout, filter_ast_json, sort_json, group_json,
          property_state_json, layout_config_json, position_key, created_at, updated_at, archived_at
        ) VALUES (?, ?, 'database', ?, 'All', 'table', NULL, '[]', NULL, '{"columns":[]}', '{}', ?, ?, ?, NULL)
      `)
      .run(defaultViewId, id, id, defaultViewPos, now, now);

    this.#database
      .prepare('UPDATE workspace_databases SET default_view_id = ?, updated_at = ? WHERE id = ?')
      .run(defaultViewId, now, id);

    return {
      createdAt: now,
      defaultViewId,
      icon: node.icon,
      id,
      title,
      updatedAt: now,
      visibility,
    };
  }

  getDatabase(id: string): (WorkspaceDatabase & { title: string; icon?: string | null }) | null {
    const row = this.#database
      .prepare(`
        SELECT d.*, n.title, n.icon, n.archived_at, n.parent_node_id, n.position_key, n.revision
        FROM workspace_databases d
        JOIN workspace_nodes n ON n.id = d.id
        WHERE d.id = ?
      `)
      .get(id) as FullDatabaseRow | undefined;

    if (!row) return null;

    return {
      createdAt: row.created_at,
      defaultViewId: row.default_view_id,
      icon: row.icon,
      id: row.id,
      title: row.title,
      updatedAt: row.updated_at,
      visibility: row.visibility,
    };
  }

  getSchema(id: string): DatabaseSchema {
    const row = this.#database
      .prepare(`
        SELECT d.*, n.title, n.icon, n.archived_at, n.parent_node_id, n.position_key, n.revision
        FROM workspace_databases d
        JOIN workspace_nodes n ON n.id = d.id
        WHERE d.id = ?
      `)
      .get(id) as FullDatabaseRow | undefined;

    if (!row) {
      throw new WorkspaceDomainError('not-found', `Database not found: ${id}`);
    }

    const properties = this.#propertyRepo.listProperties(id);

    const viewRows = this.#database
      .prepare(`
        SELECT * FROM workspace_views
        WHERE database_id = ? AND owner_type = 'database' AND archived_at IS NULL
        ORDER BY position_key ASC
      `)
      .all(id) as Readonly<{
        archived_at: string | null;
        created_at: string;
        database_id: string;
        filter_ast_json: string | null;
        group_json: string | null;
        id: string;
        layout: ViewLayout;
        layout_config_json: string;
        name: string;
        owner_id: string;
        owner_type: 'database' | 'block';
        position_key: string;
        property_state_json: string;
        sort_json: string;
        updated_at: string;
      }>[];

    const views: WorkspaceView[] = viewRows.map((v) => ({
      archivedAt: v.archived_at,
      createdAt: v.created_at,
      databaseId: v.database_id,
      filterAst: parseJson<FilterNode | null>(v.filter_ast_json, null),
      group: parseJson<GroupRule | null>(v.group_json, null),
      id: v.id,
      layout: v.layout,
      layoutConfig: parseJson<Readonly<Record<string, unknown>>>(v.layout_config_json, {}),
      name: v.name,
      ownerId: v.owner_id,
      ownerType: v.owner_type,
      positionKey: v.position_key,
      propertyState: parseJson<PropertyViewState>(v.property_state_json, { columns: [] }),
      sorts: parseJson<readonly SortRule[]>(v.sort_json, []),
      updatedAt: v.updated_at,
    }));

    return {
      database: {
        archivedAt: row.archived_at,
        createdAt: row.created_at,
        defaultViewId: row.default_view_id,
        icon: row.icon,
        id: row.id,
        parentNodeId: row.parent_node_id,
        positionKey: row.position_key,
        revision: row.revision,
        title: row.title,
        updatedAt: row.updated_at,
        visibility: row.visibility,
      },
      properties,
      views,
    };
  }

  listDatabases(includeAdvanced = true): readonly (WorkspaceDatabase & { title: string; icon?: string | null })[] {
    const sql = includeAdvanced
      ? `
        SELECT d.*, n.title, n.icon, n.archived_at, n.parent_node_id, n.position_key, n.revision
        FROM workspace_databases d
        JOIN workspace_nodes n ON n.id = d.id
        WHERE n.archived_at IS NULL
        ORDER BY n.position_key ASC
      `
      : `
        SELECT d.*, n.title, n.icon, n.archived_at, n.parent_node_id, n.position_key, n.revision
        FROM workspace_databases d
        JOIN workspace_nodes n ON n.id = d.id
        WHERE n.archived_at IS NULL AND d.visibility = 'normal'
        ORDER BY n.position_key ASC
      `;

    const rows = this.#database.prepare(sql).all() as FullDatabaseRow[];

    return rows.map((row) => ({
      createdAt: row.created_at,
      defaultViewId: row.default_view_id,
      icon: row.icon,
      id: row.id,
      title: row.title,
      updatedAt: row.updated_at,
      visibility: row.visibility,
    }));
  }

  updateDatabase(id: string, patch: WorkspaceDatabasePatch): WorkspaceDatabase & { title: string; icon?: string | null } {
    const current = this.getDatabase(id);
    if (!current) {
      throw new WorkspaceDomainError('not-found', `Database not found: ${id}`);
    }

    if (patch.title !== undefined || patch.icon !== undefined) {
      this.#workspaceRepo.updateNode(id, {
        icon: patch.icon,
        title: patch.title,
      });
    }

    const defaultViewId = patch.defaultViewId !== undefined ? patch.defaultViewId : current.defaultViewId;
    const visibility = patch.visibility !== undefined ? patch.visibility : current.visibility;
    const now = new Date().toISOString();

    this.#database
      .prepare('UPDATE workspace_databases SET default_view_id = ?, visibility = ?, updated_at = ? WHERE id = ?')
      .run(defaultViewId ?? null, visibility, now, id);

    return this.getDatabase(id)!;
  }

  archiveDatabase(id: string): void {
    this.#workspaceRepo.archiveNode(id);
  }

  permanentlyDeleteDatabase(id: string): void {
    this.#workspaceRepo.permanentlyDeleteDatabase(id);
  }

  duplicateDatabase(
    id: string,
    newTitle?: string,
    includeRecords = false,
  ): WorkspaceDatabase & { title: string; icon?: string | null } {
    const schema = this.getSchema(id);
    const title = newTitle || `${schema.database.title} (Copy)`;

    const duplicated = this.createDatabase({
      icon: schema.database.icon,
      title,
      visibility: schema.database.visibility,
    });

    const propertyIdMap = new Map<string, string>();
    const optionIdMap = new Map<string, string>();
    const duplicatedTitle = this.#propertyRepo
      .listProperties(duplicated.id)
      .find((property) => property.type === 'title');
    const sourceTitle = schema.properties.find((property) => property.type === 'title');
    if (duplicatedTitle && sourceTitle) propertyIdMap.set(sourceTitle.id, duplicatedTitle.id);

    // Copy custom properties (skip auto-created title). Explicit ids let option
    // values be remapped without relying on mutable labels.
    for (const prop of schema.properties) {
      if (prop.type === 'title') continue;

      const statusGroupIdMap = new Map<string, string>();
      const statusGroups = prop.statusGroups?.map((group) => {
        const targetId = randomUUID();
        statusGroupIdMap.set(group.id, targetId);
        return {
          category: group.category,
          id: targetId,
          label: group.label,
          positionKey: group.positionKey,
        };
      });
      const options = prop.options?.map((option) => {
        const targetId = randomUUID();
        optionIdMap.set(option.id, targetId);
        return {
          id: targetId,
          label: option.label,
          positionKey: option.positionKey,
          statusGroupId: option.statusGroupId ? statusGroupIdMap.get(option.statusGroupId) ?? null : null,
          style: option.style,
        };
      });

      const createdProperty = this.#propertyRepo.createProperty({
        config: prop.config,
        databaseId: duplicated.id,
        defaultValueJson: prop.defaultValueJson,
        name: prop.name,
        options,
        required: prop.required,
        statusGroups,
        type: prop.type,
        uniqueValue: prop.uniqueValue,
      });
      propertyIdMap.set(prop.id, createdProperty.id);
    }

    if (includeRecords) {
      for (const record of this.#recordRepo.listRecords(id)) {
        const properties: Record<string, unknown> = {};
        for (const [sourcePropertyId, sourceValue] of Object.entries(record.properties)) {
          const targetPropertyId = propertyIdMap.get(sourcePropertyId);
          if (!targetPropertyId) continue;
          if (typeof sourceValue === 'string' && optionIdMap.has(sourceValue)) {
            properties[targetPropertyId] = optionIdMap.get(sourceValue);
          } else if (Array.isArray(sourceValue)) {
            properties[targetPropertyId] = sourceValue.map((value: unknown): unknown =>
              typeof value === 'string' ? optionIdMap.get(value) ?? value : value,
            );
          } else {
            properties[targetPropertyId] = sourceValue;
          }
        }
        this.#recordRepo.createRecord({
          contentJson: record.contentJson,
          databaseId: duplicated.id,
          icon: record.icon,
          properties,
          title: record.title,
        });
      }
    }

    return duplicated;
  }
}
