import type { DatabaseSync } from 'node:sqlite';

import type { WorkspaceProperty, WorkspaceRecord } from '../../shared/property-contract';
import { normalizeSearchText } from './search-service';
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

const SELECT_COLUMNS = `
  SELECT entity_id, entity_kind, database_id, display_title, display_subtitle, display_metadata
  FROM workspace_search_index
`;

// A title match should outrank the same word buried in a page, so the title is
// its own indexed column and carries most of the weight. The zeros are the
// UNINDEXED display columns, which bm25 still expects a weight for.
const RANKING = 'bm25(workspace_search_index, 0, 0, 0, 0, 0, 0, 12.0, 1.0)';

const INSERT_SQL = `
  INSERT INTO workspace_search_index (
    entity_id, entity_kind, database_id,
    display_title, display_subtitle, display_metadata,
    title_text, search_text
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

/** One page can hold a book. Index the opening of it, not all of it. */
const MAX_BODY_CHARS = 20_000;

const TEXT_KEYS = ['content', 'caption', 'url'] as const;

/**
 * Every readable word a page block carries. Block ids, types and colors are
 * skipped: they are machine values, and indexing them would put UUID noise in
 * front of real matches.
 */
export function blockText(contentJson: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contentJson);
  } catch {
    return '';
  }

  const pieces: string[] = [];
  let budget = MAX_BODY_CHARS;

  const take = (value: unknown): void => {
    if (typeof value !== 'string' || !value.trim() || budget <= 0) return;
    const text = value.slice(0, budget);
    budget -= text.length;
    pieces.push(text);
  };

  const walk = (value: unknown): void => {
    if (budget <= 0) return;
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry);
      return;
    }
    if (!value || typeof value !== 'object') return;

    const block = value as Record<string, unknown>;
    for (const key of TEXT_KEYS) take(block[key]);
    // A simple table keeps its text in rows of cells.
    if (Array.isArray(block.cells)) {
      for (const row of block.cells) {
        if (Array.isArray(row)) for (const cell of row) take(cell);
      }
    }
    walk(block.col1Blocks);
    walk(block.col2Blocks);
  };

  walk(parsed);
  return pieces.join(' ');
}

// Arabic glues its article and prepositions onto the front of a word, so
// "الحسابات" is one token that a prefix search for "حساب" can never reach.
const arabicArticle = /^(?:وال|بال|كال|فال|لل|ال)([؀-ۿ]{3,})$/u;

/** The same words again without their leading article, as extra index tokens. */
export function withoutArabicArticles(text: string): string {
  const stems = new Set<string>();
  for (const token of text.split(/[^\p{L}\p{N}]+/u)) {
    const match = arabicArticle.exec(token);
    if (match) stems.add(match[1]!);
  }
  return stems.size === 0 ? text : `${text} ${[...stems].join(' ')}`;
}

export class WorkspaceSearchService {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  /**
   * Rows are matched on a normalized copy of their text, so an Arabic search
   * finds a word however it was typed: with or without tashkeel, with أ or ا,
   * ة or ه. The display columns keep the original spelling.
   */
  #write(
    entityId: string,
    kind: WorkspaceSearchResult['entityKind'],
    databaseId: string | null,
    title: string,
    subtitle: string,
    metadata: string,
    body: string,
  ): void {
    this.removeIndex(entityId);
    this.#database
      .prepare(INSERT_SQL)
      .run(
        entityId,
        kind,
        databaseId,
        title,
        subtitle,
        metadata,
        withoutArabicArticles(normalizeSearchText(title)),
        withoutArabicArticles(normalizeSearchText(`${title} ${subtitle} ${body}`)),
      );
  }

  indexNode(node: WorkspaceNode, subtitle?: string, metadata?: Record<string, unknown>): void {
    const meta = metadata ? JSON.stringify(metadata) : '';
    // A page is searchable by everything written on it, not only by its title.
    const body = node.kind === 'record' ? '' : blockText(node.contentJson);
    this.#write(node.id, node.kind, null, node.title, subtitle ?? '', meta, `${meta} ${body}`);
  }

  indexRecord(
    record: WorkspaceRecord,
    propertyDefs: readonly WorkspaceProperty[],
    databaseTitle: string,
  ): void {
    const subtitle = `${databaseTitle} #${record.sequence}`;
    const textPieces: string[] = [String(record.sequence), databaseTitle];

    for (const property of propertyDefs) {
      const value = record.properties[property.id];
      if (value === undefined || value === null || value === '') continue;
      textPieces.push(property.name);
      textPieces.push(typeof value === 'object' ? JSON.stringify(value) : valueToText(value));
    }

    this.#write(
      record.id,
      'record',
      record.databaseId,
      record.title,
      subtitle,
      JSON.stringify({ sequence: record.sequence }),
      textPieces.join(' '),
    );
  }

  indexView(view: WorkspaceView, databaseTitle: string): void {
    this.#write(
      view.id,
      'view',
      view.databaseId,
      view.name,
      databaseTitle,
      JSON.stringify({ layout: view.layout }),
      view.layout,
    );
  }

  removeIndex(entityId: string): void {
    this.#database
      .prepare('DELETE FROM workspace_search_index WHERE entity_id = ?')
      .run(entityId);
  }

  /** True when the index holds nothing, so a rebuild is worth the walk. */
  isEmpty(): boolean {
    return this.#database.prepare('SELECT 1 FROM workspace_search_index LIMIT 1').get() === undefined;
  }

  search(rawQuery: string, limit = 20): readonly WorkspaceSearchResult[] {
    const normalized = normalizeSearchText(rawQuery);
    if (!normalized) return [];

    // Split exactly where the index splits: on everything that is not a letter
    // or a digit. A serial such as "SN-4471" is two tokens in the index, so it
    // has to be two tokens in the query as well. Each one is a prefix term, so
    // results narrow with every letter typed rather than waiting for a word to
    // be finished.
    const tokens = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (tokens.length === 0) return [];

    const ftsQuery = tokens.map((token) => `"${token}"*`).join(' AND ');

    try {
      const rows = this.#database
        .prepare(`${SELECT_COLUMNS} WHERE workspace_search_index MATCH ? ORDER BY ${RANKING} LIMIT ?`)
        .all(ftsQuery, limit) as FtsRow[];
      return rows.map(toResult);
    } catch {
      // A query FTS5 will not parse still has to return something useful.
      const pattern = `%${normalized}%`;
      const rows = this.#database
        .prepare(`${SELECT_COLUMNS} WHERE title_text LIKE ? OR search_text LIKE ? LIMIT ?`)
        .all(pattern, pattern, limit) as FtsRow[];
      return rows.map(toResult);
    }
  }
}

function toResult(row: FtsRow): WorkspaceSearchResult {
  return {
    databaseId: row.database_id ?? undefined,
    displayMetadata: row.display_metadata ?? undefined,
    displaySubtitle: row.display_subtitle ?? undefined,
    displayTitle: row.display_title,
    entityId: row.entity_id,
    entityKind: row.entity_kind,
  };
}
