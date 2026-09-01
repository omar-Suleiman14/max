import { describe, expect, it } from 'vitest';

import {
  parseDatabaseQueryParams,
  parseWorkspaceDatabaseDraft,
  parseWorkspaceTemplateV2,
  parseWorkspaceWorkflowDraft,
} from './workspace-input-parsers';

describe('workspace IPC input validation', () => {
  it('accepts valid database and recursive query payloads', () => {
    expect(parseWorkspaceDatabaseDraft({ title: 'Repairs', visibility: 'normal' }).title).toBe('Repairs');
    const query = parseDatabaseQueryParams({
      databaseId: 'db-repairs',
      filter: {
        conditions: [
          { kind: 'property', operator: 'contains', propertyId: 'problem', value: 'screen' },
        ],
        kind: 'group',
        operator: 'AND',
      },
      limit: 50,
    });
    expect(query.filter?.kind).toBe('group');
  });

  it('rejects malformed nested filters and non-JSON workflow values', () => {
    expect(() => parseDatabaseQueryParams({
      databaseId: 'db-repairs',
      filter: { kind: 'property', operator: 'drop table', propertyId: 'problem' },
    })).toThrow(/operator is invalid/);
    expect(() => parseWorkspaceWorkflowDraft({
      inputSchema: { fields: [] },
      name: 'Unsafe',
      steps: [{ config: { callback: () => undefined }, type: 'COMPUTE' }],
    })).toThrow(/JSON values/);
  });

  it('rejects Blueprint v2 entities with invalid property types', () => {
    expect(() => parseWorkspaceTemplateV2({
      databases: [{
        key: 'repairs',
        properties: [{ key: 'bad', name: 'Bad', type: 'javascript' }],
        title: 'Repairs',
        views: [],
      }],
      name: 'Invalid',
      relations: [],
      version: 2,
    })).toThrow(/property type is invalid/i);
  });
});
