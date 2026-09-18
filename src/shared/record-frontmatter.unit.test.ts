import { describe, expect, it } from 'vitest';

import type { WorkspaceProperty } from './property-contract';
import {
  RECORD_FRONTMATTER_CREATABLE_TYPES,
  planRecordFrontmatterEntries,
  propertyDraftFromFrontmatter,
  recordToFrontmatterEntries,
  resolveRecordFrontmatterValue,
} from './record-frontmatter';

function property(
  name: string,
  type: WorkspaceProperty['type'],
  overrides: Partial<WorkspaceProperty> = {},
): WorkspaceProperty {
  return {
    archivedAt: null,
    config: {},
    createdAt: '2026-09-18T00:00:00.000Z',
    databaseId: 'db',
    id: `${type}-${name}`,
    name,
    positionKey: 'a0',
    required: false,
    type,
    uniqueValue: false,
    updatedAt: '2026-09-18T00:00:00.000Z',
    ...overrides,
  };
}

describe('record frontmatter planning', () => {
  it('maps a known name to its schema property without inferring a replacement type', () => {
    const count = property('Count', 'number');
    const plan = planRecordFrontmatterEntries([count], [['Count', 42]]);
    expect(plan.issues).toEqual([]);
    expect(plan.operations).toEqual([{ key: 'Count', property: count, target: 'property', value: 42 }]);
  });

  it('rejects a value that does not match the existing schema type', () => {
    const count = property('Count', 'number');
    const plan = planRecordFrontmatterEntries([count], [['Count', 'forty two']]);
    expect(plan.operations).toEqual([]);
    expect(plan.issues).toEqual([expect.objectContaining({ key: 'Count', kind: 'invalid' })]);
  });

  it('reports an unknown name as an explicit creation offer without creating a draft', () => {
    const plan = planRecordFrontmatterEntries([], [['Priority', 'High']]);
    expect(plan.operations).toEqual([]);
    expect(plan.issues).toEqual([{
      key: 'Priority',
      kind: 'unknown',
      message: 'Create "Priority" as a property',
      value: 'High',
    }]);
  });

  it('keeps valid sibling operations when another key is invalid', () => {
    const count = property('Count', 'number');
    const done = property('Done', 'checkbox');
    const plan = planRecordFrontmatterEntries([count, done], [['Count', 'bad'], ['Done', true]]);
    expect(plan.issues).toHaveLength(1);
    expect(plan.operations).toEqual([{ key: 'Done', property: done, target: 'property', value: true }]);
  });

  it.each(['formula', 'rollup', 'relation', 'auto_id', 'created_time', 'created_by', 'last_edited_time', 'last_edited_by'] as const)(
    'does not write managed %s properties',
    (type) => {
      const managed = property('Managed', type);
      const plan = planRecordFrontmatterEntries([managed], [['Managed', 'raw']]);
      expect(plan.operations).toEqual([]);
      expect(plan.issues).toEqual([expect.objectContaining({ kind: 'forbidden' })]);
    },
  );

  it('maps select and multi-select labels to their stored option IDs', () => {
    const status = property('Status', 'select', {
      options: [
        { id: 'todo', label: 'Todo', positionKey: 'a0', propertyId: 'select-Status', style: {} },
        { id: 'done', label: 'Done', positionKey: 'a1', propertyId: 'select-Status', style: {} },
      ],
    });
    const tags = property('Tags', 'multi_select', {
      options: [
        { id: 'a', label: 'A', positionKey: 'a0', propertyId: 'multi_select-Tags', style: {} },
        { id: 'b', label: 'B', positionKey: 'a1', propertyId: 'multi_select-Tags', style: {} },
      ],
    });
    expect(resolveRecordFrontmatterValue(status, 'Done')).toEqual({ error: null, value: 'done' });
    expect(resolveRecordFrontmatterValue(tags, ['B', 'A', 'B'])).toEqual({ error: null, value: ['b', 'a'] });
  });

  it('turns a null title into an empty title value for the normal Untitled fallback', () => {
    expect(resolveRecordFrontmatterValue(property('Name', 'title'), null)).toEqual({ error: null, value: '' });
  });
});

describe('record frontmatter property creation', () => {
  it('requires the caller to choose an allowed type before a draft can exist', () => {
    expect(RECORD_FRONTMATTER_CREATABLE_TYPES).not.toContain('formula');
    expect(RECORD_FRONTMATTER_CREATABLE_TYPES).not.toContain('rollup');
    expect(RECORD_FRONTMATTER_CREATABLE_TYPES).not.toContain('relation');
    expect(RECORD_FRONTMATTER_CREATABLE_TYPES).not.toContain('auto_id');
    expect(RECORD_FRONTMATTER_CREATABLE_TYPES).not.toContain('created_time');
    expect(propertyDraftFromFrontmatter('db', 'Priority', 'text', 'High')).toEqual({
      error: null,
      draft: { databaseId: 'db', name: 'Priority', type: 'text' },
    });
  });

  it('creates select options from the YAML value only after select is chosen', () => {
    expect(propertyDraftFromFrontmatter('db', 'Priority', 'select', 'High')).toEqual({
      error: null,
      draft: { databaseId: 'db', name: 'Priority', type: 'select', options: [{ label: 'High' }] },
    });
  });
});

describe('record frontmatter serialization', () => {
  it('uses human-readable option labels when generating YAML', () => {
    const status = property('Status', 'select', {
      options: [{ id: 'done', label: 'Done', positionKey: 'a0', propertyId: 'select-Status', style: {} }],
    });
    expect(recordToFrontmatterEntries([status], { title: 'Item', properties: { [status.id]: 'done' } })).toEqual([
      ['Status', 'Done'],
    ]);
  });
});
