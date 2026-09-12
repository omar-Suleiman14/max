// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UniversalSearchDialog, type SearchPopupMode, type UniversalSearchResult } from './universal-search-dialog';

const workflows = [
  { archivedAt: null, enabled: true, id: 'wf-sale', inputSchema: { fields: [] }, name: 'Record a sale', steps: [] },
  { archivedAt: null, enabled: true, id: 'wf-stock', inputSchema: { fields: [] }, name: 'Add Stock', steps: [] },
  { archivedAt: null, enabled: false, id: 'wf-off', inputSchema: { fields: [] }, name: 'Retired sale flow', steps: [] },
  { archivedAt: '2026-01-01', enabled: true, id: 'wf-gone', inputSchema: { fields: [] }, name: 'Archived sale flow', steps: [] },
];

beforeEach(() => {
  // jsdom has no scrollIntoView, and the popup keeps the active row in view.
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window, 'maxApi', {
    configurable: true,
    value: {
      search: { query: vi.fn(() => Promise.resolve([])) },
      workspace: {
        executeWorkflow: vi.fn(() => Promise.resolve({ ok: true, value: { status: 'completed' } })),
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

function open(overrides: Partial<{
  mode: SearchPopupMode;
  onModeChange: (mode: SearchPopupMode, actionId?: string) => void;
  onSelect: (result: UniversalSearchResult) => void;
  quickActionId: string;
  quickActionsEnabled: boolean;
}> = {}) {
  return render(
    <UniversalSearchDialog
      locale="en"
      mode={overrides.mode ?? 'search'}
      onClose={vi.fn()}
      onModeChange={overrides.onModeChange ?? vi.fn()}
      onOpenQuickActionSettings={vi.fn()}
      onSelect={overrides.onSelect ?? vi.fn()}
      quickActionId={overrides.quickActionId}
      quickActionsEnabled={overrides.quickActionsEnabled}
    />,
  );
}

const rowTitles = () => [...document.querySelectorAll('.search-row__title')].map((node) => node.textContent);

describe('the command popup', () => {
  it('lists the actions before anything is typed', async () => {
    open();

    await waitFor(() => expect(screen.getByText('Actions')).toBeInTheDocument());
    expect(rowTitles()).toEqual(['Record a sale', 'Add Stock', 'Retired sale flow']);
    // Archived actions are deleted, not merely switched off.
    expect(screen.queryByText('Archived sale flow')).not.toBeInTheDocument();
  });

  it('groups matching actions above the workspace results', async () => {
    const user = userEvent.setup();
    open();
    await waitFor(() => expect(screen.getByText('Actions')).toBeInTheDocument());

    await user.type(screen.getByRole('combobox'), 'sale');

    await waitFor(() => expect(screen.getByText('Sale of a charger')).toBeInTheDocument());
    expect(rowTitles()).toEqual(['Record a sale', 'Retired sale flow', 'Sale of a charger']);
    expect(screen.getByText('Results')).toBeInTheDocument();
  });

  it('marks a switched-off action instead of hiding it', async () => {
    open();

    await waitFor(() => expect(screen.getByText('Retired sale flow')).toBeInTheDocument());
    expect(screen.getByText('Retired sale flow').closest('.search-row')).toHaveAttribute('data-blocked', 'true');
    expect(screen.getByText('Turned off')).toBeInTheDocument();
  });

  it('opens a chosen action here rather than handing it off', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    const onSelect = vi.fn();
    open({ onModeChange, onSelect });
    await waitFor(() => expect(screen.getByText('Add Stock')).toBeInTheDocument());

    await user.click(screen.getByText('Add Stock'));

    expect(onModeChange).toHaveBeenCalledWith('actions', 'wf-stock');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('hands non-action results back to the host', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    open({ onSelect });

    await user.type(screen.getByRole('combobox'), 'charger');
    await waitFor(() => expect(screen.getByText('Sale of a charger')).toBeInTheDocument());
    await user.click(screen.getByText('Sale of a charger'));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec-1', kind: 'record' }));
  });

  it('shows only the chosen action, with a way back to search', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    open({ mode: 'actions', onModeChange, quickActionId: 'wf-stock' });

    expect(await screen.findByRole('heading', { name: 'Add Stock' })).toBeInTheDocument();
    // No list of other actions to re-orient in, and no second popup.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('Record a sale')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onModeChange).toHaveBeenCalledWith('search');
  });
});

it('provides only search when Quick Actions are disabled', async () => {
  const user = userEvent.setup();
  open({ quickActionsEnabled: false });
  expect(screen.getByPlaceholderText('Search pages and records?')).toBeInTheDocument();
  expect(window.maxApi.workspace.listWorkflows).not.toHaveBeenCalled();
  expect(screen.queryByText('Actions')).not.toBeInTheDocument();
  await user.type(screen.getByRole('combobox'), 'charger');
  expect(await screen.findByText('Sale of a charger')).toBeInTheDocument();
  expect(screen.queryByText('Record a sale')).not.toBeInTheDocument();
});
