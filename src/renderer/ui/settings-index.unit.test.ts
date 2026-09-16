import { describe, expect, it } from 'vitest';

import { SETTINGS_ENTRIES, searchSettings } from './settings-index';

describe('settings search', () => {
  it('finds a setting by its own name rather than its section name', () => {
    // The box used to filter the six section titles, so typing the name of a
    // setting found nothing at all.
    const results = searchSettings('language', 'en');
    expect(results[0]?.id).toBe('language');
    expect(results[0]?.section).toBe('settings-general');
  });

  it('finds a setting by a word that is not in its label', () => {
    expect(searchSettings('backlinks', 'en').map((entry) => entry.id)).toContain('connections');
    expect(searchSettings('bin', 'en').map((entry) => entry.id)).toContain('archive');
  });

  it('ranks a label that starts with the query above a keyword match', () => {
    const results = searchSettings('theme', 'en');
    expect(results[0]?.id).toBe('theme');
  });

  it('searches Arabic labels too, and returns nothing for an empty query', () => {
    expect(searchSettings('اللغة', 'ar').map((entry) => entry.id)).toContain('language');
    expect(searchSettings('   ', 'en')).toHaveLength(0);
  });

  it('gives every entry a unique id, since that is what the page is scrolled to', () => {
    const ids = SETTINGS_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
