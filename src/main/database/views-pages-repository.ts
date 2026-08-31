import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type {
  CustomPage,
  CustomPageDraft,
  SavedView,
  SavedViewDraft,
  ViewFilterRule,
  ViewSortRule,
  ViewTargetKind,
} from '../../shared/views-search-contract';
import { ObjectDomainError } from './object-repository';

type SavedViewRow = {
  archived_at: string | null;
  created_at: string;
  filter_json: string;
  group_by_property_id: string | null;
  id: string;
  name: string;
  position: number;
  sort_json: string;
  target_kind: ViewTargetKind;
  updated_at: string;
};

type CustomPageRow = {
  archived_at: string | null;
  created_at: string;
  icon: string | null;
  id: string;
  layout_json: string;
  name: string;
  position: number;
  updated_at: string;
};

export class ViewsPagesRepository {
  constructor(private readonly database: DatabaseSync) {}

  #audit(entityType: 'page' | 'view', entityId: string, action: 'archived' | 'created' | 'updated', snapshot: unknown): void {
    const now = new Date().toISOString();
    this.database
      .prepare(`
        INSERT INTO object_audit_log (entity_type, entity_id, action, actor, snapshot_json, created_at)
        VALUES (?, ?, ?, 'local-user', ?, ?)
      `)
      .run(entityType, entityId, action, JSON.stringify(snapshot), now);
  }

  // --- Saved Views ---
  listViews(targetKind?: ViewTargetKind): readonly SavedView[] {
    const sql = targetKind
      ? 'SELECT * FROM shop_saved_views WHERE target_kind = ? AND archived_at IS NULL ORDER BY position ASC, name COLLATE NOCASE ASC'
      : 'SELECT * FROM shop_saved_views WHERE archived_at IS NULL ORDER BY position ASC, name COLLATE NOCASE ASC';

    const rows = (targetKind ? this.database.prepare(sql).all(targetKind) : this.database.prepare(sql).all()) as SavedViewRow[];
    return rows.map((r) => this.#rowToView(r));
  }

  getView(id: string): SavedView {
    const row = this.database
      .prepare('SELECT * FROM shop_saved_views WHERE id = ? AND archived_at IS NULL')
      .get(id) as SavedViewRow | undefined;

    if (!row) {
      throw new ObjectDomainError('not-found', `Saved view ${id} not found.`);
    }
    return this.#rowToView(row);
  }

  createView(draft: SavedViewDraft): SavedView {
    const name = draft.name.trim();
    if (!name) {
      throw new ObjectDomainError('invalid-input', 'Saved view name is required.');
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const filterJson = JSON.stringify(draft.filterRules ?? []);
    const sortJson = JSON.stringify(draft.sortRules ?? []);

    this.database
      .prepare(`
        INSERT INTO shop_saved_views (id, name, target_kind, filter_json, sort_json, group_by_property_id, position, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        name,
        draft.targetKind,
        filterJson,
        sortJson,
        draft.groupByPropertyId ?? null,
        draft.position ?? 0,
        now,
        now,
      );

    const view = this.getView(id);
    this.#audit('view', id, 'created', view);
    return view;
  }

  updateView(id: string, draft: SavedViewDraft): SavedView {
    const existing = this.getView(id);
    const name = draft.name.trim();
    if (!name) {
      throw new ObjectDomainError('invalid-input', 'Saved view name is required.');
    }

    const now = new Date().toISOString();
    const filterJson = JSON.stringify(draft.filterRules ?? existing.filterRules);
    const sortJson = JSON.stringify(draft.sortRules ?? existing.sortRules);

    this.database
      .prepare(`
        UPDATE shop_saved_views
        SET name = ?, filter_json = ?, sort_json = ?, group_by_property_id = ?, position = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        name,
        filterJson,
        sortJson,
        draft.groupByPropertyId !== undefined ? draft.groupByPropertyId : (existing.groupByPropertyId ?? null),
        draft.position ?? existing.position,
        now,
        id,
      );

    const updated = this.getView(id);
    this.#audit('view', id, 'updated', updated);
    return updated;
  }

  archiveView(id: string): void {
    const existing = this.getView(id);
    const now = new Date().toISOString();
    this.database.prepare('UPDATE shop_saved_views SET archived_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
    this.#audit('view', id, 'archived', existing);
  }

  #rowToView(r: SavedViewRow): SavedView {
    let filterRules: readonly ViewFilterRule[] = [];
    let sortRules: readonly ViewSortRule[] = [];
    try {
      filterRules = JSON.parse(r.filter_json) as readonly ViewFilterRule[];
      sortRules = JSON.parse(r.sort_json) as readonly ViewSortRule[];
    } catch {
      // ignore
    }
    return {
      createdAt: r.created_at,
      filterRules,
      groupByPropertyId: r.group_by_property_id ?? undefined,
      id: r.id,
      name: r.name,
      position: r.position,
      sortRules,
      targetKind: r.target_kind,
      updatedAt: r.updated_at,
    };
  }

  // --- Custom Pages ---
  listPages(): readonly CustomPage[] {
    const rows = this.database
      .prepare('SELECT * FROM shop_custom_pages WHERE archived_at IS NULL ORDER BY position ASC, name COLLATE NOCASE ASC')
      .all() as CustomPageRow[];
    return rows.map((r) => this.#rowToPage(r));
  }

  listArchivedPages(): readonly CustomPage[] {
    const rows = this.database
      .prepare('SELECT * FROM shop_custom_pages WHERE archived_at IS NOT NULL ORDER BY updated_at DESC')
      .all() as CustomPageRow[];
    return rows.map((row) => this.#rowToPage(row));
  }

  getPage(id: string): CustomPage {
    const row = this.database
      .prepare('SELECT * FROM shop_custom_pages WHERE id = ? AND archived_at IS NULL')
      .get(id) as CustomPageRow | undefined;

    if (!row) {
      throw new ObjectDomainError('not-found', `Custom page ${id} not found.`);
    }
    return this.#rowToPage(row);
  }

  createPage(draft: CustomPageDraft): CustomPage {
    const name = draft.name.trim();
    if (!name) {
      throw new ObjectDomainError('invalid-input', 'Page name is required.');
    }
    try {
      JSON.parse(draft.layoutJson);
    } catch {
      throw new ObjectDomainError('invalid-input', 'Invalid page layout JSON.');
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    this.database
      .prepare(`
        INSERT INTO shop_custom_pages (id, name, icon, layout_json, position, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(id, name, draft.icon ?? null, draft.layoutJson, draft.position ?? 0, now, now);

    const page = this.getPage(id);
    this.#audit('page', id, 'created', page);
    return page;
  }

  updatePage(id: string, draft: CustomPageDraft): CustomPage {
    const existing = this.getPage(id);
    const name = draft.name.trim();
    if (!name) {
      throw new ObjectDomainError('invalid-input', 'Page name is required.');
    }
    try {
      JSON.parse(draft.layoutJson);
    } catch {
      throw new ObjectDomainError('invalid-input', 'Invalid page layout JSON.');
    }

    const now = new Date().toISOString();

    this.database
      .prepare(`
        UPDATE shop_custom_pages
        SET name = ?, icon = ?, layout_json = ?, position = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(name, draft.icon ?? (existing.icon ?? null), draft.layoutJson, draft.position ?? existing.position, now, id);

    const updated = this.getPage(id);
    this.#audit('page', id, 'updated', updated);
    return updated;
  }

  archivePage(id: string): void {
    const existing = this.getPage(id);
    const now = new Date().toISOString();
    this.database.prepare('UPDATE shop_custom_pages SET archived_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
    this.#audit('page', id, 'archived', existing);
  }

  restorePage(id: string): CustomPage {
    const row = this.database.prepare('SELECT * FROM shop_custom_pages WHERE id = ? AND archived_at IS NOT NULL').get(id) as CustomPageRow | undefined;
    if (!row) throw new ObjectDomainError('not-found', `Archived page ${id} not found.`);
    const now = new Date().toISOString();
    this.database.prepare('UPDATE shop_custom_pages SET archived_at = NULL, updated_at = ? WHERE id = ?').run(now, id);
    const restored = this.getPage(id);
    this.#audit('page', id, 'updated', restored);
    return restored;
  }

  emptyPageTrash(): void {
    this.database.prepare('DELETE FROM shop_custom_pages WHERE archived_at IS NOT NULL').run();
  }

  #rowToPage(r: CustomPageRow): CustomPage {
    return {
      createdAt: r.created_at,
      icon: r.icon ?? undefined,
      id: r.id,
      layoutJson: r.layout_json,
      name: r.name,
      position: r.position,
      updatedAt: r.updated_at,
    };
  }
}
