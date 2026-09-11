import { describe, expect, it } from 'vitest';

import { readLocale, readSidebarCollapsed, readSidebarWidth, readTheme, resolveTheme } from './preferences';

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
    expect(readTheme(storage)).toBe('light');
    expect(readSidebarCollapsed(storage)).toBe(false);
    expect(readSidebarWidth(storage)).toBe(238);
  });

  it('clamps a persisted sidebar width to usable bounds', () => {
    expect(readSidebarWidth(storageWith({ 'max.ui.sidebar-width': '312' }))).toBe(312);
    expect(readSidebarWidth(storageWith({ 'max.ui.sidebar-width': '50' }))).toBe(180);
    expect(readSidebarWidth(storageWith({ 'max.ui.sidebar-width': '900' }))).toBe(420);
  });

  it('resolves system appearance without changing the stored preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });
});
