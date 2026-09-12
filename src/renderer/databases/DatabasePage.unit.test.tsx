// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const newRecord = {
  archivedAt: null,
  createdAt: '2026-09-02',
  databaseId: 'db-products',
  id: 'record-1',
  positionKey: 'a0',
  properties: {} as Record<string, unknown>,
  revision: 1,
  title: 'Retail sale',
  updatedAt: '2026-09-02',
};

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

// The schema the page sees, so one test can give the database a required
// property without changing the others.
const query = vi.hoisted(() => ({
  refresh: vi.fn(() => Promise.resolve()),
  schema: { database: { title: 'Products' }, properties: [] as unknown[], views: [] },
}));

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
    refresh: query.refresh,
    schema: query.schema,
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
vi.mock('./RecordDrawer', () => ({
  RecordDrawer: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (isOpen
    ? <button onClick={onClose} type="button">Close record</button>
    : null),
}));

import { DatabasePage } from './DatabasePage';

const template = {
  createdAt: '2026-09-02',
  databaseId: 'db-products',
  icon: '🛍️',
  id: 'template-retail',
  name: 'Retail sale',
  position: 0,
  propertyDefaults: {},
  updatedAt: '2026-09-02',
};

function api(overrides: Record<string, unknown> = {}) {
  const workspace = {
    archiveRecord: vi.fn(() => Promise.resolve({ ok: true, value: null })),
    getDatabaseSchema: vi.fn(() => Promise.resolve(query.schema)),
    getNavigation: vi.fn(() => Promise.resolve({ databases: [], pages: [] })),
    getNode: vi.fn(() => Promise.resolve({ id: 'db-products', kind: 'database', title: 'Products' })),
    getPageGraph: vi.fn(() => Promise.resolve({ pages: [], links: [] })),
    getRecord: vi.fn(() => Promise.resolve(newRecord)),
    listRecordTemplates: vi.fn(() => Promise.resolve([template])),
    permanentlyDeleteNode: vi.fn(() => Promise.resolve({ ok: true, value: null })),
    ...overrides,
  };
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace } });
  return workspace;
}

beforeEach(() => {
  query.schema = { database: { title: 'Products' }, properties: [], views: [] };
  newRecord.properties = {};
  newRecord.title = 'Retail sale';
});

afterEach(() => {
  cleanup();
  createRecord.mockClear();
  query.refresh.mockClear();
});

const requiredRate = {
  createdAt: '2026-09-02',
  databaseId: 'db-products',
  id: 'prop-rate',
  name: 'Rate',
  positionKey: 'a0',
  required: true,
  type: 'number',
  uniqueValue: false,
  updatedAt: '2026-09-02',
};

async function createThenClose() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'New' }));
  await user.click(await screen.findByRole('button', { name: 'Close record' }));
}

describe('DatabasePage record creation', () => {
  it('keeps templates inside the arrow beside New', async () => {
    api();
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

  it('takes back a new record that was closed without its required values', async () => {
    query.schema = { database: { title: 'Products' }, properties: [requiredRate], views: [] };
    const workspace = api();
    render(<DatabasePage databaseId="db-products" />);

    await createThenClose();

    await waitFor(() => expect(workspace.archiveRecord).toHaveBeenCalledWith('record-1'));
    expect(workspace.permanentlyDeleteNode).toHaveBeenCalledWith('record-1');
    await waitFor(() => expect(query.refresh).toHaveBeenCalled());
  });

  it('keeps a new record once its required values are answered', async () => {
    query.schema = { database: { title: 'Products' }, properties: [requiredRate], views: [] };
    newRecord.properties = { 'prop-rate': 4 };
    const workspace = api();
    render(<DatabasePage databaseId="db-products" />);

    await createThenClose();

    await waitFor(() => expect(workspace.getRecord).toHaveBeenCalledWith('record-1'));
    expect(workspace.archiveRecord).not.toHaveBeenCalled();
    expect(workspace.permanentlyDeleteNode).not.toHaveBeenCalled();
  });

  it('leaves a record alone when the database asks for nothing', async () => {
    const workspace = api();
    render(<DatabasePage databaseId="db-products" />);

    await createThenClose();

    expect(workspace.archiveRecord).not.toHaveBeenCalled();
    expect(workspace.getRecord).not.toHaveBeenCalled();
  });
});
