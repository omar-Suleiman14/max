import { describe, expect, it } from 'vitest';

import { compareResults, kindLabel, matchTier, MatchTier } from './result-ranking';

const rank = (query: string, results: readonly { kind: string; title: string }[], locale: 'ar' | 'en' = 'en') =>
  [...results].sort((left, right) => compareResults(left, right, query, locale)).map((result) => `${result.kind}:${result.title}`);

describe('search ranking', () => {
  it('puts an exact title above a prefix, a prefix above a contained match, and those above a body match', () => {
    expect(rank('budget', [
      { kind: 'page', title: 'Notes mentioning it' },
      { kind: 'record', title: 'Old budget' },
      { kind: 'page', title: 'Budget plan' },
      { kind: 'record', title: 'Budget' },
    ])).toEqual(['record:Budget', 'page:Budget plan', 'record:Old budget', 'page:Notes mentioning it']);
  });

  it('breaks a tie by kind: page, database, view, then record, keeping the given order among records', () => {
    expect(rank('tasks', [
      { kind: 'record', title: 'Tasks' },
      { kind: 'view', title: 'Tasks' },
      { kind: 'item', title: 'Tasks' },
      { kind: 'database', title: 'Tasks' },
      { kind: 'page', title: 'Tasks' },
    ])).toEqual(['page:Tasks', 'database:Tasks', 'view:Tasks', 'record:Tasks', 'item:Tasks']);
  });

  it('matches Arabic letter forms and Arabic-Indic digits', () => {
    expect(matchTier('فاتورة ١٢٣', 'فاتوره 123')).toBe(MatchTier.Exact);
    expect(matchTier('الإيصالات ٢٠٢٦', 'الايصالات')).toBe(MatchTier.Prefix);
    expect(rank('١٢٣', [{ kind: 'page', title: 'طلب 9123' }, { kind: 'record', title: '123' }], 'ar')).toEqual(['record:123', 'page:طلب 9123']);
  });

  it('labels every kind so a page is not mistaken for a record', () => {
    expect(['page', 'database', 'view', 'record', 'item', 'action'].map((kind) => kindLabel(kind, 'en'))).toEqual(['Page', 'Database', 'View', 'Record', 'Record', 'Action']);
    expect(kindLabel('page', 'ar')).toBe('صفحة');
  });
});
