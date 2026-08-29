import { describe, expect, it } from 'vitest';

import { readLocale, readSidebarCollapsed, readTheme, resolveTheme } from './preferences';

function storageWith(values: Readonly<Record<string, string>>): Storage {
  return {
    clear() {},
    getItem(key) { return values[key] ?? null; },
    key() { return null; },
    get length() { return Object.keys(values).length; },
    removeItem() {},
    setItem() {},
  };
}

describe('shell preferences', () => {
  it('rejects unknown persisted values', () => {
    const storage = storageWith({ 'max.ui.locale': 'fr', 'max.ui.theme': 'neon' });
    expect(readLocale(storage)).toBe('en');
    expect(readTheme(storage)).toBe('system');
    expect(readSidebarCollapsed(storage)).toBe(false);
  });

  it('resolves system appearance without changing the stored preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });
});
