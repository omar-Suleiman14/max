import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { generateOrderKey } from '../../shared/order-key';
import {
  WorkspaceDomainError,
  type NavigationItem,
  type WorkspaceNavigation,
  type WorkspaceNode,
  type WorkspaceNodeDraft,
  type WorkspaceNodePatch,
} from '../../shared/workspace-contract';

type NodeRow = Readonly<{
  archived_at: string | null;
  content_json: string;
  created_at: string;
  icon: string | null;
  id: string;
  kind: WorkspaceNode['kind'];
  parent_node_id: string | null;
  position_key: string;
  revision: number;
  title: string;
  updated_at: string;
  visibility?: 'normal' | 'advanced' | null;
}>;

function nodeFromRow(row: NodeRow): WorkspaceNode {
  return {
    archivedAt: row.archived_at,
    contentJson: row.content_json,
    createdAt: row.created_at,
    icon: row.icon,
    id: row.id,
    kind: row.kind,
    parentNodeId: row.parent_node_id,
    positionKey: row.position_key,
    revision: row.revision,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

export class WorkspaceRepository {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  createNode(draft: WorkspaceNodeDraft): WorkspaceNode {
    const title = draft.title.trim();
    if (!title) {
      throw new WorkspaceDomainError('invalid-input', 'Title must not be empty.');
    }

    const id = draft.id ?? randomUUID();
    const now = new Date().toISOString();
    const positionKey = draft.positionKey ?? this.#nextPositionKey(draft.kind, draft.parentNodeId);
    const contentJson = draft.contentJson ?? '[]';

    this.#database
      .prepare(`
        INSERT INTO workspace_nodes (
          id, kind, parent_node_id, title, icon, content_json, position_key, revision, created_at, updated_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)
      `)
      .run(id, draft.kind, draft.parentNodeId ?? null, title, draft.icon ?? null, contentJson, positionKey, now, now);

    return {
      archivedAt: null,
      contentJson,
      createdAt: now,
      icon: draft.icon ?? null,
      id,
      kind: draft.kind,
      parentNodeId: draft.parentNodeId ?? null,
      positionKey,
      revision: 1,
      title,
      updatedAt: now,
    };
  }

  getNode(id: string): WorkspaceNode | null {
    const row = this.#database
      .prepare('SELECT * FROM workspace_nodes WHERE id = ?')
      .get(id) as NodeRow | undefined;

    return row ? nodeFromRow(row) : null;
  }

  updateNode(id: string, patch: WorkspaceNodePatch): WorkspaceNode {
    const current = this.getNode(id);
    if (!current) {
      throw new WorkspaceDomainError('not-found', `Workspace node not found: ${id}`);
    }

    const title = patch.title !== undefined ? patch.title.trim() : current.title;
    if (!title) {
      throw new WorkspaceDomainError('invalid-input', 'Title must not be empty.');
    }

    const icon = patch.icon !== undefined ? patch.icon : current.icon;
    const contentJson = patch.contentJson !== undefined ? patch.contentJson : current.contentJson;
    const parentNodeId = patch.parentNodeId !== undefined ? patch.parentNodeId : current.parentNodeId;
    const positionKey = patch.positionKey !== undefined ? patch.positionKey : current.positionKey;
    const now = new Date().toISOString();
    const revision = current.revision + 1;

    this.#database
      .prepare(`
        UPDATE workspace_nodes
        SET title = ?, icon = ?, content_json = ?, parent_node_id = ?, position_key = ?, revision = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(title, icon ?? null, contentJson, parentNodeId ?? null, positionKey, revision, now, id);

    return {
      archivedAt: current.archivedAt,
      contentJson,
      createdAt: current.createdAt,
      icon,
      id,
      kind: current.kind,
      parentNodeId,
      positionKey,
      revision,
      title,
      updatedAt: now,
    };
  }

  archiveNode(id: string): void {
    const current = this.getNode(id);
    if (!current) {
      throw new WorkspaceDomainError('not-found', `Workspace node not found: ${id}`);
    }

    const now = new Date().toISOString();
    this.#database
      .prepare('UPDATE workspace_nodes SET archived_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
  }

  restoreNode(id: string): void {
    const current = this.getNode(id);
    if (!current) {
      throw new WorkspaceDomainError('not-found', `Workspace node not found: ${id}`);
    }

    const now = new Date().toISOString();
    this.#database
      .prepare('UPDATE workspace_nodes SET archived_at = NULL, updated_at = ? WHERE id = ?')
      .run(now, id);
  }

  reorderNode(id: string, targetPositionKey: string, newParentNodeId?: string | null): WorkspaceNode {
    const current = this.getNode(id);
    if (!current) {
      throw new WorkspaceDomainError('not-found', `Workspace node not found: ${id}`);
    }

    const now = new Date().toISOString();
    const parentNodeId = newParentNodeId !== undefined ? newParentNodeId : current.parentNodeId;
    this.#database
      .prepare('UPDATE workspace_nodes SET position_key = ?, parent_node_id = ?, updated_at = ? WHERE id = ?')
      .run(targetPositionKey, parentNodeId ?? null, now, id);

    return this.getNode(id)!;
  }

  getNavigation(): WorkspaceNavigation {
    const pageRows = (this.#database
      .prepare(`
        SELECT id, kind, parent_node_id, title, icon, position_key, archived_at
        FROM workspace_nodes
        WHERE kind = 'page' AND archived_at IS NULL
        ORDER BY position_key ASC
      `)
      .all() as unknown) as NodeRow[];

    const databaseRows = this.#database
      .prepare(`
        SELECT n.id, n.kind, n.parent_node_id, n.title, n.icon, n.position_key, n.archived_at, d.visibility
        FROM workspace_nodes n
        JOIN workspace_databases d ON d.id = n.id
        WHERE n.kind = 'database' AND n.archived_at IS NULL
        ORDER BY n.position_key ASC
      `)
      .all() as NodeRow[];

    const pages: NavigationItem[] = pageRows.map((row) => ({
      archivedAt: row.archived_at,
      icon: row.icon,
      id: row.id,
      kind: 'page',
      level: 0,
      parentNodeId: row.parent_node_id,
      positionKey: row.position_key,
      title: row.title,
    }));

    const databases: NavigationItem[] = databaseRows.map((row) => ({
      archivedAt: row.archived_at,
      icon: row.icon,
      id: row.id,
      kind: 'database',
      level: 0,
      parentNodeId: row.parent_node_id,
      positionKey: row.position_key,
      title: row.title,
      visibility: row.visibility ?? 'normal',
    }));

    return { databases, pages };
  }

  listPages(): readonly WorkspaceNode[] {
    const rows = this.#database
      .prepare(`
        SELECT * FROM workspace_nodes
        WHERE kind = 'page' AND archived_at IS NULL
        ORDER BY position_key ASC
      `)
      .all() as NodeRow[];

    return rows.map(nodeFromRow);
  }

  #nextPositionKey(kind: string, parentNodeId?: string | null): string {
    const lastRow = this.#database
      .prepare(`
        SELECT position_key
        FROM workspace_nodes
        WHERE kind = ? AND parent_node_id IS ? AND archived_at IS NULL
        ORDER BY position_key DESC
        LIMIT 1
      `)
      .get(kind, parentNodeId ?? null) as { position_key: string } | undefined;

    return generateOrderKey(lastRow?.position_key, null);
  }
}
