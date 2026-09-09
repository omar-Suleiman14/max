import { randomUUID } from 'node:crypto';
import { pageContentWeight, pageGraphMetadata, pageLinkTargets, type PageGraph } from '../../shared/page-links';
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
import type { WorkspaceSearchService } from './workspace-search-service';
import { DatabaseUnitOfWork } from './database-unit-of-work';

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
  readonly #search?: WorkspaceSearchService;

  constructor(database: DatabaseSync, search?: WorkspaceSearchService) {
    this.#database = database;
    this.#search = search;
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

    const node: WorkspaceNode = {
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
    this.#search?.indexNode(node);
    return node;
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

    const node: WorkspaceNode = {
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
    this.#search?.indexNode(node);
    return node;
  }

  archiveNode(id: string): void {
    new DatabaseUnitOfWork(this.#database).run(() => this.#archiveNode(id));
  }

  #archiveNode(id: string): void {
    const current = this.getNode(id);
    if (!current) throw new WorkspaceDomainError('not-found', 'Workspace page not found.');
    if (current.archivedAt) return;
    const now = new Date().toISOString();
    const nodes = this.#database.prepare(`WITH RECURSIVE owned(id) AS (SELECT ? UNION SELECT n.id FROM workspace_nodes n JOIN owned p ON n.parent_node_id = p.id) SELECT n.id FROM workspace_nodes n JOIN owned ON owned.id = n.id WHERE n.archived_at IS NULL`).all(id) as { id: string }[];
    this.#database.prepare("INSERT INTO workspace_audit_log (entity_kind, entity_id, action, actor_id, before_json, metadata_json, created_at) VALUES ('node', ?, 'archived', 'local-user', ?, '{}', ?)").run(id, JSON.stringify(nodes.map((n) => n.id)), now);
    for (const node of nodes) {
      this.#database.prepare('UPDATE workspace_nodes SET archived_at = ?, updated_at = ? WHERE id = ?').run(now, now, node.id);
      this.#database.prepare('UPDATE workspace_records SET archived_at = ?, updated_at = ? WHERE (id = ? OR database_id = ?) AND archived_at IS NULL').run(now, now, node.id, node.id);
      this.#search?.removeIndex(node.id);
    }
  }

  restoreNode(id: string): WorkspaceNode {
    return new DatabaseUnitOfWork(this.#database).run(() => this.#restoreNode(id));
  }

  permanentlyDeleteNode(id: string): void {
    new DatabaseUnitOfWork(this.#database).run(() => this.#permanentlyDeleteArchivedNode(id));
  }

  /**
   * The database handle's Delete action is intentionally irreversible.  It
   * still shares the normal purge implementation so a database and every row,
   * property, view, template, relation edge, and search entry it owns leave in
   * one SQLite transaction.
   */
  permanentlyDeleteDatabase(id: string): void {
    new DatabaseUnitOfWork(this.#database).run(() => {
      const database = this.getNode(id);
      if (!database || database.kind !== 'database') {
        throw new WorkspaceDomainError('not-found', 'Database not found.');
      }
      if (!database.archivedAt) this.#archiveNode(id);
      this.#permanentlyDeleteArchivedNode(id);
    });
  }

  #permanentlyDeleteArchivedNode(id: string): void {
    const root = this.getNode(id);
    if (!root?.archivedAt) throw new WorkspaceDomainError('invalid-input', 'Only items in Trash can be permanently deleted.');
    const nodes = this.#database.prepare(`WITH RECURSIVE owned(id) AS (SELECT ? UNION SELECT n.id FROM workspace_nodes n JOIN owned p ON n.parent_node_id = p.id) SELECT n.id, n.archived_at FROM workspace_nodes n JOIN owned ON owned.id = n.id`).all(id) as { id: string; archived_at: string | null }[];
    if (nodes.some((node) => !node.archived_at)) throw new WorkspaceDomainError('invalid-input', 'Restore this item and move its contents to Trash before permanently deleting it.');
    // A relation's other endpoint is a property in a database that survives
    // this deletion. Remove that endpoint as well so it cannot remain as a
    // relation field pointing at a database that no longer exists.
    const externalRelationProperties = this.#database.prepare(`
      SELECT CASE WHEN source_database_id = ? THEN inverse_property_id ELSE source_property_id END AS id
      FROM workspace_relations
      WHERE source_database_id = ? OR target_database_id = ?
    `).all(id, id, id) as { id: string | null }[];
    for (const property of externalRelationProperties) {
      if (property.id) this.#database.prepare('DELETE FROM workspace_properties WHERE id = ?').run(property.id);
    }
    // Database records deliberately restrict database deletion. Include every
    // row owned by a database even when an older workspace did not parent its
    // record node under the database node.
    const recordIds = this.#database.prepare('SELECT id FROM workspace_records WHERE database_id = ?').all(id) as { id: string }[];
    for (const record of recordIds) this.#database.prepare('DELETE FROM workspace_records WHERE id = ?').run(record.id);
    for (const node of nodes) this.#database.prepare('DELETE FROM workspace_records WHERE id = ?').run(node.id);
    for (const node of nodes) {
      this.#search?.removeIndex(node.id);
      this.#database.prepare('DELETE FROM workspace_dependencies WHERE source_id = ? OR target_id = ?').run(node.id, node.id);
      this.#database.prepare('DELETE FROM workspace_nodes WHERE id = ?').run(node.id);
    }
    this.#database.prepare("INSERT INTO workspace_audit_log (entity_kind, entity_id, action, actor_id, metadata_json, created_at) VALUES ('node', ?, 'archived', 'local-user', ?, ?)").run(id, JSON.stringify({ permanentlyDeleted: true, title: root.title, nodeCount: nodes.length }), new Date().toISOString());
  }

  #restoreNode(id: string): WorkspaceNode {
    const current = this.getNode(id);
    if (!current) throw new WorkspaceDomainError('not-found', 'Workspace page not found.');
    if (!current.archivedAt) return current;
    const audit = this.#database.prepare("SELECT before_json FROM workspace_audit_log WHERE entity_kind = 'node' AND entity_id = ? AND action = 'archived' ORDER BY id DESC LIMIT 1").get(id) as { before_json: string } | undefined;
    const ids = audit ? JSON.parse(audit.before_json) as string[] : [id];
    const now = new Date().toISOString();
    for (const nodeId of ids) {
      const node = this.getNode(nodeId);
      if (!node || node.archivedAt !== current.archivedAt) continue;
      this.#database.prepare('UPDATE workspace_nodes SET archived_at = NULL, updated_at = ? WHERE id = ?').run(now, nodeId);
      this.#database.prepare('UPDATE workspace_records SET archived_at = NULL, updated_at = ? WHERE (id = ? OR database_id = ?) AND archived_at = ?').run(now, nodeId, nodeId, current.archivedAt);
      this.#search?.indexNode(this.getNode(nodeId)!);
    }
    this.#database.prepare("INSERT INTO workspace_audit_log (entity_kind, entity_id, action, actor_id, metadata_json, created_at) VALUES ('node', ?, 'restored', 'local-user', '{}', ?)").run(id, now);
    return this.getNode(id)!;
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

  getNavigation(includeArchived = false): WorkspaceNavigation {
    const archivedFilter = includeArchived ? '' : ' AND archived_at IS NULL';
    const pageRows = (this.#database
      .prepare(`
        SELECT id, kind, parent_node_id, title, icon, position_key, archived_at
        FROM workspace_nodes
        WHERE kind = 'page'${archivedFilter}
        ORDER BY position_key ASC
      `)
      .all() as unknown) as NodeRow[];

    const databaseArchivedFilter = includeArchived ? '' : ' AND n.archived_at IS NULL';
    const databaseRows = this.#database
      .prepare(`
        SELECT n.id, n.kind, n.parent_node_id, n.title, n.icon, n.position_key, n.archived_at, d.visibility
        FROM workspace_nodes n
        JOIN workspace_databases d ON d.id = n.id
        WHERE n.kind = 'database'${databaseArchivedFilter}
        ORDER BY n.position_key ASC
      `)
      .all() as NodeRow[];

    const navigationRows = [...pageRows, ...databaseRows];
    const navigationRowById = new Map(navigationRows.map((row) => [row.id, row] as const));
    const levelFor = (row: NodeRow) => {
      let level = 0;
      let parentId = row.parent_node_id;
      const visited = new Set([row.id]);
      while (parentId && !visited.has(parentId)) {
        const parent = navigationRowById.get(parentId);
        if (!parent) break;
        visited.add(parentId);
        level += 1;
        parentId = parent.parent_node_id;
      }
      return level;
    };

    const pages: NavigationItem[] = pageRows.map((row) => ({
      archivedAt: row.archived_at,
      icon: row.icon,
      id: row.id,
      kind: 'page',
      level: levelFor(row),
      parentNodeId: row.parent_node_id,
      positionKey: row.position_key,
      title: row.title,
    }));

    const legacyAliases: Record<string, string> = { db_products: 'items', db_people: 'people', db_accounts: 'accounts', db_transactions: 'transactions' };
    const migrations = this.#database.prepare("SELECT legacy_id, workspace_id FROM workspace_migration_map WHERE legacy_entity_type = 'template_database'").all() as { legacy_id: string; workspace_id: string }[];
    const aliases = new Map(migrations.map((entry) => [entry.workspace_id, legacyAliases[entry.legacy_id]]));
    const databases: NavigationItem[] = databaseRows.map((row) => ({
      legacyAlias: aliases.get(row.id),
      archivedAt: row.archived_at,
      icon: row.icon,
      id: row.id,
      kind: 'database',
      level: levelFor(row),
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

  getPageGraph(): PageGraph {
    const pages = this.listPages();
    const activeIds = new Set(pages.map((page) => page.id));
    const pagesById = new Map(pages.map((page) => [page.id, page] as const));
    const workspacePath = (page: WorkspaceNode): string => {
      const parts = [page.title];
      const visited = new Set([page.id]);
      let parentId = page.parentNodeId;
      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = pagesById.get(parentId);
        if (!parent) break;
        parts.unshift(parent.title);
        parentId = parent.parentNodeId;
      }
      return parts.join('/');
    };
    return {
      pages: pages.map((page) => {
        const { properties, text } = pageGraphMetadata(page.contentJson);
        return {
          id: page.id,
          title: page.title,
          icon: page.icon,
          parentNodeId: page.parentNodeId,
          contentWeight: pageContentWeight(page.contentJson),
          path: workspacePath(page),
          properties,
          text,
        };
      }),
      links: pages.flatMap((page) => pageLinkTargets(page.contentJson).filter((id) => activeIds.has(id)).map((targetId) => ({ sourceId: page.id, targetId }))),
    };
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
