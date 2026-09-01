import type { DatabaseSync } from 'node:sqlite';

import type { WorkspaceProperty, WorkspaceRecord } from '../../shared/property-contract';
import { valueToText } from './value-utils';
import type { WorkspaceNode, WorkspaceSearchResult } from '../../shared/workspace-contract';
import type { WorkspaceView } from '../../shared/view-contract';

type FtsRow = Readonly<{
  database_id: string | null;
  display_metadata: string | null;
  display_subtitle: string | null;
  display_title: string;
  entity_id: string;
  entity_kind: WorkspaceSearchResult['entityKind'];
}>;

export class WorkspaceSearchService {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  indexNode(node: WorkspaceNode, subtitle?: string, metadata?: Record<string, unknown>): void {
    this.removeIndex(node.id);

    const title = node.title;
    const sub = subtitle ?? '';
    const meta = metadata ? JSON.stringify(metadata) : '';
    const searchText = `${title} ${sub} ${meta}`.trim();

    this.#database
      .prepare(`
        INSERT INTO workspace_search_index (
          entity_id, entity_kind, database_id, display_title, display_subtitle, display_metadata, search_text
        ) VALUES (?, ?, NULL, ?, ?, ?, ?)
      `)
      .run(node.id, node.kind, title, sub, meta, searchText);
  }

  indexRecord(
    record: WorkspaceRecord,
    propertyDefs: readonly WorkspaceProperty[],
    databaseTitle: string,
  ): void {
    this.removeIndex(record.id);

    const title = record.title;
    const subtitle = `${databaseTitle} #${record.sequence}`;

    const textPieces: string[] = [title, String(record.sequence), databaseTitle];
    for (const p of propertyDefs) {
      const v = record.properties[p.id];
      if (v !== undefined && v !== null && v !== '') {
        if (typeof v === 'object') {
          textPieces.push(JSON.stringify(v));
        } else {
          textPieces.push(valueToText(v));
        }
      }
    }

    const searchText = textPieces.join(' ');
    const meta = JSON.stringify({ sequence: record.sequence });

    this.#database
      .prepare(`
        INSERT INTO workspace_search_index (
          entity_id, entity_kind, database_id, display_title, display_subtitle, display_metadata, search_text
        ) VALUES (?, 'record', ?, ?, ?, ?, ?)
      `)
      .run(record.id, record.databaseId, title, subtitle, meta, searchText);
  }

  indexView(view: WorkspaceView, databaseTitle: string): void {
    this.removeIndex(view.id);
    this.#database.prepare(`
      INSERT INTO workspace_search_index (
        entity_id, entity_kind, database_id, display_title, display_subtitle, display_metadata, search_text
      ) VALUES (?, 'view', ?, ?, ?, ?, ?)
    `).run(
      view.id,
      view.databaseId,
      view.name,
      databaseTitle,
      JSON.stringify({ layout: view.layout }),
      `${view.name} ${databaseTitle} ${view.layout}`,
    );
  }

  removeIndex(entityId: string): void {
    this.#database
      .prepare('DELETE FROM workspace_search_index WHERE entity_id = ?')
      .run(entityId);
  }

  search(rawQuery: string, limit = 20): readonly WorkspaceSearchResult[] {
    const trimmed = rawQuery.trim();
    if (!trimmed) return [];

    // Format query for FTS5 (support prefix search)
    const sanitized = trimmed.replace(/["*^]/g, '').trim();
    if (!sanitized) return [];

    const ftsQuery = sanitized.split(/\s+/).map((word) => `"${word}"*`).join(' AND ');

    try {
      const rows = this.#database
        .prepare(`
          SELECT entity_id, entity_kind, database_id, display_title, display_subtitle, display_metadata
          FROM workspace_search_index
          WHERE workspace_search_index MATCH ?
          LIMIT ?
        `)
        .all(ftsQuery, limit) as FtsRow[];

      return rows.map((r) => ({
        databaseId: r.database_id ?? undefined,
        displayMetadata: r.display_metadata ?? undefined,
        displaySubtitle: r.display_subtitle ?? undefined,
        displayTitle: r.display_title,
        entityId: r.entity_id,
        entityKind: r.entity_kind,
      }));
    } catch {
      // Fallback to LIKE if FTS expression syntax fails
      const pattern = `%${sanitized}%`;
      const rows = this.#database
        .prepare(`
          SELECT entity_id, entity_kind, database_id, display_title, display_subtitle, display_metadata
          FROM workspace_search_index
          WHERE display_title LIKE ? OR search_text LIKE ?
          LIMIT ?
        `)
        .all(pattern, pattern, limit) as FtsRow[];

      return rows.map((r) => ({
        databaseId: r.database_id ?? undefined,
        displayMetadata: r.display_metadata ?? undefined,
        displaySubtitle: r.display_subtitle ?? undefined,
        displayTitle: r.display_title,
        entityId: r.entity_id,
        entityKind: r.entity_kind,
      }));
    }
  }
}
