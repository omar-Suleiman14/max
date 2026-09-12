import { describe, expect, it } from 'vitest';

import type { WorkspaceProperty } from '../../shared/property-contract';
import type { FilterNode } from '../../shared/query-contract';
import { recordDefaultsForFilter } from './view-defaults';

function property(id: string, type: WorkspaceProperty['type']): WorkspaceProperty {
  return {
    createdAt: '', databaseId: 'db', id, name: id, positionKey: 'a0', required: false,
    type, uniqueValue: false, updatedAt: '',
  } as WorkspaceProperty;
}

const properties = [
  property('status', 'select'),
  property('tags', 'multi_select'),
  property('in_stock', 'checkbox'),
  property('count', 'number'),
  property('total', 'formula'),
];

function group(operator: 'AND' | 'OR', conditions: readonly FilterNode[]): FilterNode {
  return { conditions, kind: 'group', operator };
}

describe('seeding a record from the view it was created in', () => {
  it('carries the values an AND filter names', () => {
    const filter = group('AND', [
      { kind: 'property', operator: 'equals', propertyId: 'status', value: 'available' },
      { kind: 'property', operator: 'is_checked', propertyId: 'in_stock' },
    ]);

    expect(recordDefaultsForFilter(filter, properties)).toEqual({ in_stock: true, status: 'available' });
  });

  it('keeps a whole option list for multi-select and one option for select', () => {
    const filter = group('AND', [
      { kind: 'property', operator: 'in_options', propertyId: 'tags', value: ['new', 'sale'] },
      { kind: 'property', operator: 'in_options', propertyId: 'status', value: ['available', 'held'] },
    ]);

    expect(recordDefaultsForFilter(filter, properties)).toEqual({ status: 'available', tags: ['new', 'sale'] });
  });

  it('leaves alone conditions no single value satisfies', () => {
    const filter = group('AND', [
      { kind: 'property', operator: 'greater_than', propertyId: 'count', value: 3 },
      { kind: 'property', operator: 'contains', propertyId: 'status', value: 'av' },
      { kind: 'property', operator: 'is_not_empty', propertyId: 'status' },
    ]);

    expect(recordDefaultsForFilter(filter, properties)).toEqual({});
  });

  it('ignores an OR branch, which names no one answer', () => {
    const filter = group('OR', [
      { kind: 'property', operator: 'equals', propertyId: 'status', value: 'available' },
      { kind: 'property', operator: 'equals', propertyId: 'status', value: 'held' },
    ]);

    expect(recordDefaultsForFilter(filter, properties)).toEqual({});
  });

  it('never tries to set a value the workspace derives', () => {
    const filter = group('AND', [{ kind: 'property', operator: 'equals', propertyId: 'total', value: 10 }]);

    expect(recordDefaultsForFilter(filter, properties)).toEqual({});
  });

  it('has nothing to add for an unfiltered view', () => {
    expect(recordDefaultsForFilter(null, properties)).toEqual({});
  });
});
