import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { generateOrderKey } from '../../shared/order-key';
import { WorkspaceDomainError } from '../../shared/workspace-contract';
import type {
  PropertyViewState,
  WorkspaceView,
  WorkspaceViewDraft,
} from '../../shared/view-contract';
import type { FilterNode, GroupRule, SortRule } from '../../shared/query-contract';
import { parseStoredJson } from './value-utils';
import type { WorkspaceSearchService } from './workspace-search-service';
import type { WorkspaceRepository } from './workspace-repository';

type ViewRow = Readonly<{
  archived_at: string | null;
  created_at: string;
  database_id: string;
  filter_ast_json: string | null;
  group_json: string | null;
  id: string;
  layout: WorkspaceView['layout'];
  layout_config_json: string;
  name: string;
  owner_id: string;
  owner_type: WorkspaceView['ownerType'];
  position_key: string;
  property_state_json: string;
  sort_json: string;
  updated_at: string;
}>;

function viewFromRow(row: ViewRow): WorkspaceView {
  return {
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    databaseId: row.database_id,
    filterAst: parseStoredJson<FilterNode | null>(row.filter_ast_json, null),
    group: parseStoredJson<GroupRule | null>(row.group_json, null),
    id: row.id,
    layout: row.layout,
    layoutConfig: parseStoredJson<Readonly<Record<string, unknown>>>(row.layout_config_json, {}),
    name: row.name,
    ownerId: row.owner_id,
    ownerType: row.owner_type,
    positionKey: row.position_key,
    propertyState: parseStoredJson<PropertyViewState>(row.property_state_json, { columns: [] }),
    sorts: parseStoredJson<readonly SortRule[]>(row.sort_json, []),
    updatedAt: row.updated_at,
  };
}

export class ViewRepository {
  readonly #database: DatabaseSync;
  readonly #search?: WorkspaceSearchService;
  readonly #workspace?: WorkspaceRepository;

  constructor(database: DatabaseSync, search?: WorkspaceSearchService, workspace?: WorkspaceRepository) {
    this.#database = database;
    this.#search = search;
    this.#workspace = workspace;
  }

  createView(draft: WorkspaceViewDraft): WorkspaceView {
    const name = draft.name.trim();
    if (!name || name.length > 120) {
      throw new WorkspaceDomainError('invalid-input', 'View name must be 1–120 characters.');
    }

    const id = draft.id ?? randomUUID();
    const now = new Date().toISOString();
    const positionKey = draft.positionKey ?? this.#nextPositionKey(draft.databaseId);
    const ownerType = draft.ownerType ?? 'database';
    const ownerId = draft.ownerId ?? draft.databaseId;
    const layout = draft.layout ?? 'table';
    const filterJson = draft.filterAst ? JSON.stringify(draft.filterAst) : null;
    const sortJson = JSON.stringify(draft.sorts ?? []);
    const groupJson = draft.group ? JSON.stringify(draft.group) : null;
    const propertyState = draft.propertyState ?? { columns: [] };
    const propStateJson = JSON.stringify(propertyState);
    const layoutConfigJson = JSON.stringify(draft.layoutConfig ?? {});

    this.#database
      .prepare(`
        INSERT INTO workspace_views (
          id, database_id, owner_type, owner_id, name, layout, filter_ast_json, sort_json, group_json,
          property_state_json, layout_config_json, position_key, created_at, updated_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `)
      .run(
        id,
        draft.databaseId,
        ownerType,
        ownerId,
        name,
        layout,
        filterJson,
        sortJson,
        groupJson,
        propStateJson,
        layoutConfigJson,
        positionKey,
        now,
        now,
      );

    const view: WorkspaceView = {
      archivedAt: null,
      createdAt: now,
      databaseId: draft.databaseId,
      filterAst: draft.filterAst ?? null,
      group: draft.group ?? null,
      id,
      layout,
      layoutConfig: draft.layoutConfig ?? {},
      name,
      ownerId,
      ownerType,
      positionKey,
      propertyState,
      sorts: draft.sorts ?? [],
      updatedAt: now,
    };
    this.#indexView(view);
    return view;
  }

  getView(id: string): WorkspaceView | null {
    const row = this.#database
      .prepare('SELECT * FROM workspace_views WHERE id = ?')
      .get(id) as ViewRow | undefined;

    return row ? viewFromRow(row) : null;
  }

  listViews(ownerId: string, ownerType: 'database' | 'block' = 'database'): readonly WorkspaceView[] {
    const rows = this.#database
      .prepare(`
        SELECT * FROM workspace_views
        WHERE owner_id = ? AND owner_type = ? AND archived_at IS NULL
        ORDER BY position_key ASC
      `)
      .all(ownerId, ownerType) as ViewRow[];

    return rows.map(viewFromRow);
  }

  updateView(id: string, patch: Partial<WorkspaceViewDraft>): WorkspaceView {
    const current = this.getView(id);
    if (!current) {
      throw new WorkspaceDomainError('not-found', `View not found: ${id}`);
    }

    const name = patch.name !== undefined ? patch.name.trim() : current.name;
    if (!name || name.length > 120) {
      throw new WorkspaceDomainError('invalid-input', 'View name must be 1–120 characters.');
    }

    const layout = patch.layout !== undefined ? patch.layout : current.layout;
    const filterJson = patch.filterAst !== undefined ? (patch.filterAst ? JSON.stringify(patch.filterAst) : null) : (current.filterAst ? JSON.stringify(current.filterAst) : null);
    const sortJson = patch.sorts !== undefined ? JSON.stringify(patch.sorts) : JSON.stringify(current.sorts);
    const groupJson = patch.group !== undefined ? (patch.group ? JSON.stringify(patch.group) : null) : (current.group ? JSON.stringify(current.group) : null);
    const propStateJson = patch.propertyState !== undefined ? JSON.stringify(patch.propertyState) : JSON.stringify(current.propertyState);
    const layoutConfigJson = patch.layoutConfig !== undefined ? JSON.stringify(patch.layoutConfig) : JSON.stringify(current.layoutConfig);
    const positionKey = patch.positionKey !== undefined ? patch.positionKey : current.positionKey;
    const now = new Date().toISOString();

    this.#database
      .prepare(`
        UPDATE workspace_views
        SET name = ?, layout = ?, filter_ast_json = ?, sort_json = ?, group_json = ?,
            property_state_json = ?, layout_config_json = ?, position_key = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        name,
        layout,
        filterJson,
        sortJson,
        groupJson,
        propStateJson,
        layoutConfigJson,
        positionKey,
        now,
        id,
      );

    const updated = this.getView(id)!;
    this.#indexView(updated);
    return updated;
  }

  archiveView(id: string): void {
    const current = this.getView(id);
    if (!current) {
      throw new WorkspaceDomainError('not-found', `View not found: ${id}`);
    }
    const now = new Date().toISOString();
    this.#database
      .prepare('UPDATE workspace_views SET archived_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
    this.#search?.removeIndex(id);
  }

  reorderView(id: string, targetPositionKey: string): void {
    const now = new Date().toISOString();
    this.#database
      .prepare('UPDATE workspace_views SET position_key = ?, updated_at = ? WHERE id = ?')
      .run(targetPositionKey, now, id);
  }

  duplicateView(id: string, newName?: string): WorkspaceView {
    const current = this.getView(id);
    if (!current) {
      throw new WorkspaceDomainError('not-found', `View not found: ${id}`);
    }

    return this.createView({
      databaseId: current.databaseId,
      filterAst: current.filterAst,
      group: current.group,
      layout: current.layout,
      layoutConfig: current.layoutConfig,
      name: newName ?? `${current.name} (Copy)`,
      ownerId: current.ownerId,
      ownerType: current.ownerType,
      propertyState: current.propertyState,
      sorts: current.sorts,
    });
  }

  setDefaultView(databaseId: string, viewId: string): void {
    const now = new Date().toISOString();
    this.#database
      .prepare('UPDATE workspace_databases SET default_view_id = ?, updated_at = ? WHERE id = ?')
      .run(viewId, now, databaseId);
  }

  #indexView(view: WorkspaceView): void {
    const databaseTitle = this.#workspace?.getNode(view.databaseId)?.title ?? '';
    this.#search?.indexView(view, databaseTitle);
  }

  #nextPositionKey(databaseId: string): string {
    const lastRow = this.#database
      .prepare('SELECT position_key FROM workspace_views WHERE database_id = ? AND archived_at IS NULL ORDER BY position_key DESC LIMIT 1')
      .get(databaseId) as { position_key: string } | undefined;

    return generateOrderKey(lastRow?.position_key, null);
  }
}
