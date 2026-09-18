import { describe, expect, it } from 'vitest';

import type { WorkspaceProperty } from '../../shared/property-contract';
import { orderPropertiesForView, visiblePropertiesForView } from './view-property-state';

const property = (id: string, type: WorkspaceProperty['type'] = 'text') => ({ id, type }) as WorkspaceProperty;

describe('view property state', () => {
  const properties = [property('title', 'title'), property('alpha'), property('beta'), property('gamma')];

  it('honours a partial saved order and leaves unlisted properties in schema order', () => {
    expect(orderPropertiesForView(properties, [{ propertyId: 'gamma' }, { propertyId: 'alpha' }]).map(({ id }) => id))
      .toEqual(['title', 'gamma', 'alpha', 'beta']);
  });

  it('keeps the title visible while hiding saved hidden properties', () => {
    expect(visiblePropertiesForView(properties, [{ hidden: true, propertyId: 'beta' }, { hidden: true, propertyId: 'title' }]).map(({ id }) => id))
      .toEqual(['title', 'alpha', 'gamma']);
  });
});
