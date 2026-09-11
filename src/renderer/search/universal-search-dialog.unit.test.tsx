// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UniversalSearchDialog, type UniversalSearchResult } from './universal-search-dialog';

const workflows = [
  { archivedAt: null, enabled: true, id: 'wf-sale', name: 'Record a sale' },
  { archivedAt: null, enabled: true, id: 'wf-stock', name: 'Add Stock' },
  { archivedAt: null, enabled: false, id: 'wf-off', name: 'Retired sale flow' },
  { archivedAt: '2026-01-01', enabled: true, id: 'wf-gone', name: 'Archived sale flow' },
];

beforeEach(() => {
  // jsdom has no scrollIntoView, and the dialog keeps the active result in view.
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window, 'maxApi', {
    configurable: true,
    value: {
      search: { query: vi.fn(() => Promise.resolve([])) },
      workspace: {
        listWorkflows: vi.fn(() => Promise.resolve(workflows)),
        searchWorkspace: vi.fn(() => Promise.resolve([{
          databaseId: 'db-1',
          displayMetadata: undefined,
          displaySubtitle: 'Inventory',
          displayTitle: 'Sale of a charger',
          entityId: 'rec-1',
          entityKind: 'record',
        }])),
      },
    },
    writable: true,
  });
});

afterEach(cleanup);

function open(onSelect: (result: UniversalSearchResult) => void = vi.fn()) {
  return render(<UniversalSearchDialog locale="en" onClose={vi.fn()} onSelect={onSelect} />);
}

describe('quick actions in the search popup', () => {
  it('offers matching actions above the workspace results', async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByRole('combobox'), 'sale');

    await waitFor(() => expect(screen.getByText('Record a sale')).toBeInTheDocument());
    const titles = [...document.querySelectorAll('.search-result-item strong')].map((node) => node.textContent);
    expect(titles).toEqual(['Record a sale', 'Sale of a charger']);
    expect(screen.getByText('Quick action')).toBeInTheDocument();
  });

  it('leaves disabled and archived actions out', async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByRole('combobox'), 'sale');

    await waitFor(() => expect(screen.getByText('Record a sale')).toBeInTheDocument());
    expect(screen.queryByText('Retired sale flow')).not.toBeInTheDocument();
    expect(screen.queryByText('Archived sale flow')).not.toBeInTheDocument();
  });

  it('hands the action back by id so it opens in the Quick Actions dialog', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    open(onSelect);

    await user.type(screen.getByRole('combobox'), 'stock');
    await waitFor(() => expect(screen.getByText('Add Stock')).toBeInTheDocument());
    await user.click(screen.getByText('Add Stock'));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'wf-stock', kind: 'action' }));
  });
});
