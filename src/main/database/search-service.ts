import type { DatabaseSync } from 'node:sqlite';

import type { SearchResult, SearchResultKind } from '../../shared/views-search-contract';
import { normalizeSearchText } from '../../shared/search-text';
export { normalizeSearchText } from '../../shared/search-text';


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
  constructor(private readonly database: DatabaseSync) {
    database.function('max_search_normalize', { deterministic: true }, (value) => normalizeSearchText(String(value ?? '')));
  }

  query(searchTerm: string, limit = 20): readonly SearchResult[] {
    const normalizedTerm = normalizeSearchText(searchTerm);
    if (!normalizedTerm) return [];

    const ftsQuery = toFtsQuery(normalizedTerm);
    if (!ftsQuery) return [];

    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
    const escaped = normalizedTerm.replace(/[\\%_]/g, '\\$&');
    const rows = this.database
      .prepare(`
        SELECT entity_id, kind, display_title, display_subtitle, display_metadata,
          0 AS rank
        FROM search_index
        WHERE rowid IN (SELECT rowid FROM search_index WHERE search_index MATCH ?
          UNION SELECT rowid FROM search_index WHERE max_search_normalize(display_title) LIKE ? ESCAPE '\\')
        ORDER BY CASE WHEN max_search_normalize(display_title) = ? THEN 0
          WHEN max_search_normalize(display_title) LIKE ? ESCAPE '\\' THEN 1
          WHEN max_search_normalize(display_title) LIKE ? ESCAPE '\\' THEN 2 ELSE 3 END, display_title COLLATE NOCASE
        LIMIT ?
      `)
      .all(ftsQuery, `%${escaped}%`, normalizedTerm, `${escaped}%`, `%${escaped}%`, safeLimit) as SearchIndexRow[];

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
