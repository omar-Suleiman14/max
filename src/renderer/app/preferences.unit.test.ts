import { describe, expect, it } from 'vitest';

import { preferenceKeys, readLocale, readSidebarCollapsed, readSidebarExpanded, readSidebarWidth, readTheme, resolveTheme, writeSidebarExpanded } from './preferences';

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
    expect(readSidebarWidth(storage)).toBe(270);
  });

  it('clamps a persisted sidebar width to usable bounds', () => {
    expect(readSidebarWidth(storageWith({ 'max.ui.sidebar-width': '238' }))).toBe(270);
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

describe('sidebar expanded rows', () => {
  it('reads back what was written, as after a restart, and ignores damaged values', () => {
    const values: Record<string, string> = {};
    const storage = { ...storageWith(values), setItem: (key: string, value: string) => { values[key] = value; } };
    storage.getItem = (key) => values[key] ?? null;
    writeSidebarExpanded(storage, new Set(['a', 'b']));
    expect([...readSidebarExpanded(storage)]).toEqual(['a', 'b']);
    values[preferenceKeys.sidebarCollapsed] = 'true';
    expect(readSidebarCollapsed(storage)).toBe(true);
    values[preferenceKeys.sidebarExpanded] = 'not json';
    expect(readSidebarExpanded(storage).size).toBe(0);
  });
});
