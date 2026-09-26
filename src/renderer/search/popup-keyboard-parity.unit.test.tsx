// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import axe from 'axe-core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CommandMenu } from '../ui/command-menu';
import { UniversalSearchDialog } from './universal-search-dialog';

const results = [
  { databaseId: 'db', displayTitle: 'Budget review', entityId: 'rec', entityKind: 'record' },
  { displayTitle: 'Budget', entityId: 'page', entityKind: 'page' },
  { displayTitle: 'Budgets', entityId: 'db', entityKind: 'database' },
];

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window, 'maxApi', { configurable: true, writable: true, value: {
    search: { query: vi.fn(() => Promise.resolve([])) },
    workspace: { listWorkflows: vi.fn(() => Promise.resolve([])), searchWorkspace: vi.fn(() => Promise.resolve(results)) },
  } });
});
afterEach(cleanup);

/** Opens a popup from a button so the test can check where focus goes back to. */
function Opener({ popup }: { popup: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)}>Open</button>{open && popup(() => setOpen(false))}</>;
}

type Surface = Readonly<{ name: string; chosen: () => string | undefined; mount: (chosen: (id: string) => void) => ReactNode }>;

const surfaces: readonly Surface[] = [
  {
    name: 'command menu',
    chosen: () => undefined,
    mount: (chosen) => <Opener popup={(close) => <CommandMenu locale="en" onClose={close} commands={['Budget', 'Budgets', 'Budget review'].map((label) => ({ id: label, keywords: [], label, run: () => chosen(label) }))} />} />,
  },
  {
    name: 'search dialog',
    chosen: () => undefined,
    mount: (chosen) => <Opener popup={(close) => <UniversalSearchDialog locale="en" mode="search" onClose={close} onModeChange={vi.fn()} onOpenQuickActionSettings={vi.fn()} onSelect={(result) => chosen(result.title)} quickActionsEnabled={false} />} />,
  },
];

const selected = () => screen.getAllByRole('option').find((option) => option.getAttribute('aria-selected') === 'true');

describe.each(surfaces)('the $name answers the shared popup keys', ({ mount }) => {
  it('types to narrow, moves and wraps with the arrows, chooses with Enter and returns focus', async () => {
    const user = userEvent.setup();
    const chosen = vi.fn();
    render(<>{mount(chosen)}</>);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const input = screen.getByRole('combobox');
    expect(input).toHaveFocus();
    await user.type(input, 'budget');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    expect(selected()).toHaveTextContent(/^Budget(Page)?$/);
    await user.keyboard('{ArrowUp}');
    expect(selected()).toHaveTextContent('Budget review');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(selected()).toHaveTextContent(/Budgets/);
    await user.keyboard('{Enter}');
    expect(chosen).toHaveBeenCalledWith('Budgets');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  it('closes with Escape and returns focus to where it was', async () => {
    const user = userEvent.setup();
    render(<>{mount(vi.fn())}</>);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  it('announces how many results there are and has no detectable accessibility violations', async () => {
    const user = userEvent.setup();
    render(<>{mount(vi.fn())}</>);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.type(screen.getByRole('combobox'), 'budget');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('3 results'));
    const { violations } = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(violations.map((violation) => [violation.id, violation.nodes.map((node) => node.html)])).toEqual([]);
  });
});

describe('search results', () => {
  it('rank exact, then prefix, then contained titles, and say what kind each result is', async () => {
    const user = userEvent.setup();
    render(<UniversalSearchDialog locale="en" mode="search" onClose={vi.fn()} onModeChange={vi.fn()} onOpenQuickActionSettings={vi.fn()} onSelect={vi.fn()} quickActionsEnabled={false} />);
    await user.type(screen.getByRole('combobox'), 'budget');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['BudgetPage', 'BudgetsDatabase', 'Budget reviewRecord']);
  });
});
