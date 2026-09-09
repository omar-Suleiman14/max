// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const createRecord = vi.hoisted(() => vi.fn(() => Promise.resolve({
  archivedAt: null,
  createdAt: '2026-09-02',
  databaseId: 'db-products',
  id: 'record-1',
  positionKey: 'a0',
  properties: {},
  revision: 1,
  title: 'Retail sale',
  updatedAt: '2026-09-02',
})));

vi.mock('./useDatabaseQuery', () => ({
  useDatabaseQuery: () => ({
    activeView: null,
    archiveProperty: vi.fn(),
    archiveRecord: vi.fn(),
    calculations: [],
    createProperty: vi.fn(),
    createRecord,
    createView: vi.fn(),
    error: null,
    filterAst: null,
    group: null,
    groups: [],
    loading: false,
    records: [],
    refresh: vi.fn(),
    schema: { database: { title: 'Products' }, properties: [], views: [] },
    searchQuery: '',
    setActiveView: vi.fn(),
    setFilterAst: vi.fn(),
    setGroup: vi.fn(),
    setSearchQuery: vi.fn(),
    setSorts: vi.fn(),
    sorts: [],
    totalCount: 0,
    updateProperty: vi.fn(),
    updateRecord: vi.fn(),
    updateView: vi.fn(),
    views: [],
  }),
}));

vi.mock('./DatabaseViewHost', () => ({ DatabaseViewHost: () => <div>Database rows</div> }));
vi.mock('./RecordDrawer', () => ({ RecordDrawer: () => <div>Record drawer</div> }));

import { DatabasePage } from './DatabasePage';

afterEach(() => {
  cleanup();
  createRecord.mockClear();
});

describe('DatabasePage record creation', () => {
  it('keeps templates inside the arrow beside New', async () => {
    Object.defineProperty(window, 'maxApi', {
      configurable: true,
      value: {
        workspace: {
          getNode: vi.fn(() => Promise.resolve({ id: 'db-products', kind: 'database', title: 'Products' })),
          getNavigation: vi.fn(() => Promise.resolve({ databases: [], pages: [] })),
          getPageGraph: vi.fn(() => Promise.resolve({ pages: [], links: [] })),
          listRecordTemplates: vi.fn(() => Promise.resolve([{
            createdAt: '2026-09-02',
            databaseId: 'db-products',
            icon: '🛍️',
            id: 'template-retail',
            name: 'Retail sale',
            position: 0,
            propertyDefaults: {},
            updatedAt: '2026-09-02',
          }])),
        },
      },
    });
    const user = userEvent.setup();
    render(<DatabasePage databaseId="db-products" />);

    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
    expect(screen.queryByText('Retail sale')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Templates' }));
    await user.click(await screen.findByRole('button', { name: /^(?!Options for|Reorder).*Retail sale/ }));

    await waitFor(() => expect(createRecord).toHaveBeenCalledWith(expect.objectContaining({
      databaseId: 'db-products',
      templateId: 'template-retail',
      title: 'Retail sale',
    })));
  });
});
