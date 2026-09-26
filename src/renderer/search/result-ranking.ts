import type { Locale } from '../app/i18n';
import { normalizeSearchText } from '../../shared/search-text';

/**
 * How search results are ordered. docs/engineering/search-ranking.md explains the rule.
 *
 * 1. Match tier, on the normalised title (Arabic letter forms and
 *    Arabic-Indic digits folded): exact title, then title prefix, then a
 *    title containing the query, then a match in the body only.
 * 2. Within a tier, by kind: page, database, view, then record.
 * 3. Then alphabetically by title in the reader's language.
 */
export type RankedKind = 'account' | 'database' | 'item' | 'page' | 'person' | 'record' | 'transaction' | 'view';

export const MatchTier = { Body: 3, Contains: 2, Exact: 0, Prefix: 1 } as const;
export type MatchTier = (typeof MatchTier)[keyof typeof MatchTier];

export function matchTier(title: string, normalizedQuery: string): MatchTier {
  const normalizedTitle = normalizeSearchText(title);
  if (!normalizedQuery) return MatchTier.Body;
  if (normalizedTitle === normalizedQuery) return MatchTier.Exact;
  if (normalizedTitle.startsWith(normalizedQuery)) return MatchTier.Prefix;
  if (normalizedTitle.includes(normalizedQuery)) return MatchTier.Contains;
  return MatchTier.Body;
}

const KIND_ORDER: Readonly<Record<RankedKind, number>> = { account: 3, database: 1, item: 3, page: 0, person: 3, record: 3, transaction: 3, view: 2 };

export function compareResults(
  left: Readonly<{ kind: string; title: string }>,
  right: Readonly<{ kind: string; title: string }>,
  query: string,
  locale: Locale,
): number {
  const normalizedQuery = normalizeSearchText(query);
  return matchTier(left.title, normalizedQuery) - matchTier(right.title, normalizedQuery)
    || (KIND_ORDER[left.kind as RankedKind] ?? 4) - (KIND_ORDER[right.kind as RankedKind] ?? 4)
    || left.title.localeCompare(right.title, locale);
}

/** A visible label so a page is never mistaken for a record with the same name. */
export function kindLabel(kind: string, locale: Locale): string {
  const ar = locale === 'ar';
  switch (kind) {
    case 'page': return ar ? 'صفحة' : 'Page';
    case 'database': return ar ? 'قاعدة بيانات' : 'Database';
    case 'view': return ar ? 'عرض' : 'View';
    case 'action': return ar ? 'إجراء' : 'Action';
    default: return ar ? 'سجل' : 'Record';
  }
}
