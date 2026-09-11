import { describe, expect, it } from 'vitest';

import { isRequirementUnmet, unmetRequirements } from './required-properties';
import type { WorkspaceProperty } from '../../shared/property-contract';

function property(overrides: Partial<WorkspaceProperty>): WorkspaceProperty {
  return {
    config: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    databaseId: 'db',
    id: 'prop',
    name: 'Property',
    positionKey: 'a',
    required: true,
    type: 'text',
    uniqueValue: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('unanswered required properties', () => {
  it('marks a required property with no value', () => {
    expect(isRequirementUnmet(property({}), undefined)).toBe(true);
    expect(isRequirementUnmet(property({}), null)).toBe(true);
    expect(isRequirementUnmet(property({}), '')).toBe(true);
    expect(isRequirementUnmet(property({ type: 'multi_select' }), [])).toBe(true);
  });

  it('leaves answered and optional properties unmarked', () => {
    expect(isRequirementUnmet(property({}), 'Nokia 3310')).toBe(false);
    expect(isRequirementUnmet(property({ type: 'number' }), 0)).toBe(false);
    expect(isRequirementUnmet(property({ required: false }), '')).toBe(false);
  });

  it('never marks values the workspace supplies itself', () => {
    for (const type of ['formula', 'rollup', 'relation', 'created_time', 'auto_id'] as const) {
      expect(isRequirementUnmet(property({ type }), undefined)).toBe(false);
    }
    // A checkbox always holds one of its two legitimate values.
    expect(isRequirementUnmet(property({ type: 'checkbox' }), false)).toBe(false);
  });

  it('reports the outstanding properties, counting an empty title', () => {
    const properties = [
      property({ id: 'title', name: 'Name', type: 'title' }),
      property({ id: 'cost', name: 'Cost', type: 'number' }),
      property({ id: 'note', name: 'Note', required: false }),
    ];

    expect(unmetRequirements(properties, {}, '  ').map(({ name }) => name)).toEqual(['Name', 'Cost']);
    expect(unmetRequirements(properties, { cost: 12 }, 'Charger').map(({ name }) => name)).toEqual([]);
  });
});
