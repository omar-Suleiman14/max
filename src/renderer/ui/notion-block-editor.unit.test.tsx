// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotionBlockEditor, type NotionBlock } from './notion-block-editor';

function EditorHarness({ initial, parentPageId }: Readonly<{ initial: readonly NotionBlock[]; parentPageId?: string }>) {
  const [blocks, setBlocks] = useState(initial);
  return <NotionBlockEditor blocks={blocks} locale="en" onChange={setBlocks} parentPageId={parentPageId} />;
}

afterEach(() => cleanup());

describe('NotionBlockEditor', () => {
  it('splits at the caret and merges back into the previous block', async () => {
    const user = userEvent.setup();
    render(<EditorHarness initial={[{ content: 'Hello', id: 'one', type: 'text' }]} />);
    const first = screen.getByRole('textbox');
    if (!(first instanceof HTMLTextAreaElement)) throw new Error('Expected the text block editor.');
    first.focus();
    first.setSelectionRange(5, 5);
    await user.keyboard('{Enter}');
    const second = (await screen.findAllByRole('textbox'))[1] as HTMLTextAreaElement;
    second.focus();
    await user.keyboard('World');
    expect(second).toHaveValue('World');
    second.setSelectionRange(0, 0);
    await user.keyboard('{Backspace}');
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('textbox')).toHaveValue('HelloWorld');
  });

  it('opens block actions from the six-dot handle and duplicates a block', async () => {
    const user = userEvent.setup();
    render(<EditorHarness initial={[{ content: 'Keep me', id: 'one', type: 'text' }]} />);
    await user.click(screen.getByRole('button', { name: 'Block actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(screen.getAllByDisplayValue('Keep me')).toHaveLength(2);
  });

  it('focuses the final line when the empty page canvas is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<EditorHarness initial={[
      { content: 'First', id: 'one', type: 'text' },
      { content: 'Last', id: 'two', type: 'text' },
    ]} />);
    const clickTarget = container.querySelector('.notion-canvas-bottom-click-target');
    if (!(clickTarget instanceof HTMLElement)) throw new Error('Expected the page click target.');
    await user.click(clickTarget);
    await waitFor(() => expect(screen.getAllByRole('textbox')[1]).toHaveFocus());
  });

  it('creates a real database inside the current page from the insert menu', async () => {
    const createDatabase = vi.fn(() => Promise.resolve({
      ok: true as const,
      value: { createdAt: '2026-09-02', defaultViewId: 'view-1', id: 'db-1', title: 'Projects', updatedAt: '2026-09-02', visibility: 'normal' as const },
    }));
    const workspace = {
      createDatabase,
      getDatabaseSchema: vi.fn(() => Promise.resolve({
        database: { archivedAt: null, createdAt: '2026-09-02', defaultViewId: 'view-1', icon: null, id: 'db-1', parentNodeId: 'page-1', positionKey: 'a0', revision: 1, title: 'Projects', updatedAt: '2026-09-02', visibility: 'normal' as const },
        properties: [],
        views: [],
      })),
      getNavigation: vi.fn(() => Promise.resolve({ databases: [], pages: [] })),
      getView: vi.fn(() => Promise.resolve(null)),
      listRecordTemplates: vi.fn(() => Promise.resolve([])),
      listViews: vi.fn(() => Promise.resolve([{ archivedAt: null, createdAt: '2026-09-02', databaseId: 'db-1', filterAst: null, id: 'view-1', layout: 'table' as const, layoutConfig: {}, name: 'All', ownerId: 'db-1', ownerType: 'database' as const, positionKey: 'a0', propertyState: { columns: [] }, sorts: [], updatedAt: '2026-09-02' }])),
      queryDatabase: vi.fn(() => Promise.resolve({ calculations: [], records: [], totalCount: 0 })),
    };
    Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace } });

    const user = userEvent.setup();
    render(<EditorHarness initial={[{ content: '', id: 'one', type: 'text' }]} parentPageId="page-1" />);
    await user.click(screen.getByRole('button', { name: 'Insert block below' }));
    await user.click(screen.getByRole('button', { name: /New database/ }));
    await user.type(screen.getByPlaceholderText('Database name'), 'Projects');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(createDatabase).toHaveBeenCalledWith({ parentNodeId: 'page-1', title: 'Projects', visibility: 'normal' }));
  });

  it('offers one link command and asks which database to use', async () => {
    const createView = vi.fn(() => Promise.resolve({
      ok: true as const,
      value: { archivedAt: null, createdAt: '2026-09-02', databaseId: 'db-products', filterAst: null, id: 'view-linked', layout: 'table' as const, layoutConfig: {}, name: 'All products', ownerId: 'one', ownerType: 'block' as const, positionKey: 'a1', propertyState: { columns: [] }, sorts: [], updatedAt: '2026-09-02' },
    }));
    const sourceView = { archivedAt: null, createdAt: '2026-09-02', databaseId: 'db-products', filterAst: null, id: 'view-all', layout: 'table' as const, layoutConfig: {}, name: 'All products', ownerId: 'db-products', ownerType: 'database' as const, positionKey: 'a0', propertyState: { columns: [] }, sorts: [], updatedAt: '2026-09-02' };
    const workspace = {
      createView,
      getDatabaseSchema: vi.fn(() => Promise.resolve({
        database: { archivedAt: null, createdAt: '2026-09-02', defaultViewId: 'view-all', icon: null, id: 'db-products', parentNodeId: 'page-1', positionKey: 'a0', revision: 1, title: 'Products', updatedAt: '2026-09-02', visibility: 'normal' as const },
        properties: [],
        views: [sourceView],
      })),
      getNavigation: vi.fn(() => Promise.resolve({
        databases: [{ archivedAt: null, icon: 'lucide:Database', id: 'db-products', kind: 'database' as const, level: 1, parentNodeId: 'page-1', positionKey: 'a0', title: 'Products', visibility: 'normal' as const }],
        pages: [],
      })),
      getView: vi.fn(() => Promise.resolve(sourceView)),
      listRecordTemplates: vi.fn(() => Promise.resolve([])),
      listViews: vi.fn(() => Promise.resolve([sourceView])),
      queryDatabase: vi.fn(() => Promise.resolve({ calculations: [], records: [], totalCount: 0 })),
    };
    Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace } });

    const user = userEvent.setup();
    render(<EditorHarness initial={[{ content: '', id: 'one', type: 'text' }]} parentPageId="page-1" />);
    await user.type(screen.getByRole('textbox'), '/database');

    expect(await screen.findByRole('button', { name: /Link to a database/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Linked database: Products/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Link to a database/ }));
    await user.click(await screen.findByRole('button', { name: 'Products' }));

    await waitFor(() => expect(createView).toHaveBeenCalledWith(expect.objectContaining({ databaseId: 'db-products', ownerId: 'one', ownerType: 'block' })));
  });
});
