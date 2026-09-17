import { describe, expect, it } from 'vitest';
import { applyFrontmatterEntries, propertiesToFrontmatterEntries } from './page-frontmatter-sync';
import type { PageProperty } from './page-properties';

function property(overrides: Partial<PageProperty>): PageProperty {
  return { id: 'id-1', name: 'Field', type: 'text', value: null, ...overrides };
}

describe('propertiesToFrontmatterEntries', () => {
  it('includes scalar-compatible types and excludes file and read-only timestamps', () => {
    const properties: PageProperty[] = [
      property({ id: '1', name: 'Title', type: 'text', value: 'Hello' }),
      property({ id: '2', name: 'Cover', type: 'file', value: { name: 'a.png', url: 'max://asset/a.png' } }),
      property({ id: '3', name: 'Created', type: 'created_time', value: null }),
      property({ id: '4', name: 'Tags', type: 'multi_select', value: ['a', 'b'] }),
    ];
    expect(propertiesToFrontmatterEntries(properties)).toEqual([['Title', 'Hello'], ['Tags', ['a', 'b']]]);
  });
});

describe('applyFrontmatterEntries', () => {
  it('preserves an existing property type against a conflicting YAML value', () => {
    const properties: PageProperty[] = [property({ id: '1', name: 'Priority', type: 'select', value: 'High', options: ['High', 'Low'] })];
    const next = applyFrontmatterEntries(properties, [['Priority', 42]]);
    expect(next).toEqual([property({ id: '1', name: 'Priority', type: 'select', value: 42, options: ['High', 'Low'] })]);
  });

  it('infers a new property type from the value, never from the key name', () => {
    const next = applyFrontmatterEntries([], [['status', 'in progress'], ['title', 'Backlog']]);
    expect(next.map((p) => ({ name: p.name, type: p.type, value: p.value }))).toEqual([
      { name: 'status', type: 'text', value: 'in progress' },
      { name: 'title', type: 'text', value: 'Backlog' },
    ]);
    expect(next.every((p) => typeof p.id === 'string' && p.id.length > 0)).toBe(true);
  });

  it('infers checkbox, number, date and multi_select correctly for new keys', () => {
    const next = applyFrontmatterEntries([], [
      ['Done', true],
      ['Count', 5],
      ['Due', '2024-01-01'],
      ['Tags', ['a', 'b']],
    ]);
    expect(next.map((p) => p.type)).toEqual(['checkbox', 'number', 'date', 'multi_select']);
  });

  it('does not delete a property whose key is absent from the entries', () => {
    const properties: PageProperty[] = [property({ id: '1', name: 'Title', type: 'text', value: 'Kept' })];
    expect(applyFrontmatterEntries(properties, [])).toEqual(properties);
  });

  it('round-trips: properties to entries and back produce the same values', () => {
    const properties: PageProperty[] = [
      property({ id: '1', name: 'Title', type: 'text', value: 'Hello' }),
      property({ id: '2', name: 'Done', type: 'checkbox', value: true }),
      property({ id: '3', name: 'Tags', type: 'multi_select', value: ['a', 'b'], options: ['a', 'b'] }),
    ];
    const entries = propertiesToFrontmatterEntries(properties);
    expect(applyFrontmatterEntries(properties, entries)).toEqual(properties);
  });
});
