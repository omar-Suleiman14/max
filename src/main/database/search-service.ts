import type { DatabaseSync } from 'node:sqlite';

import type { SearchResult, SearchResultKind } from '../../shared/views-search-contract';

export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآآٱ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .trim();
}

type SearchIndexRow = Readonly<{
  display_metadata: string | null;
  display_subtitle: string | null;
  display_title: string;
  entity_id: string;
  kind: SearchResultKind;
  rank: number;
}>;

function toFtsQuery(term: string): string {
  return term
    .split(/\s+/u)
    .map((token) => token.replace(/["*:^{}()[\]]/g, '').trim())
    .filter(Boolean)
    .map((token) => `"${token}"*`)
    .join(' AND ');
}

export class SearchService {
  constructor(private readonly database: DatabaseSync) {}

  query(searchTerm: string, limit = 20): readonly SearchResult[] {
    const normalizedTerm = normalizeSearchText(searchTerm);
    if (!normalizedTerm) return [];

    const ftsQuery = toFtsQuery(normalizedTerm);
    if (!ftsQuery) return [];

    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
    const rows = this.database
      .prepare(`
        SELECT entity_id, kind, display_title, display_subtitle, display_metadata,
          bm25(search_index) AS rank
        FROM search_index
        WHERE search_index MATCH ?
        ORDER BY rank, display_title COLLATE NOCASE
        LIMIT ?
      `)
      .all(ftsQuery, safeLimit) as SearchIndexRow[];

    return rows.map((row, index) => {
      const normalizedTitle = normalizeSearchText(row.display_title);
      const matchScore = normalizedTitle === normalizedTerm
        ? 100
        : normalizedTitle.startsWith(normalizedTerm)
          ? 85
          : Math.max(35, 75 - index);
      return {
        id: row.entity_id,
        kind: row.kind,
        matchScore,
        metadata: row.display_metadata ?? undefined,
        subtitle: row.display_subtitle ?? undefined,
        title: row.display_title,
      };
    });
  }
}
