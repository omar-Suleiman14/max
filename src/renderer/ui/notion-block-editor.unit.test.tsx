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
  it.each([
    ['Control', 'Backspace'], ['Meta', 'Delete'],
  ])('selects page links with %s+A from a text block and supports %s and undo', async (modifier, key) => {
    const archiveNode = vi.fn();
    Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: {
      getPageGraph: () => Promise.resolve({ pages: [{ id: 'target', title: 'Linked page' }], links: [] }),
      getNavigation: () => Promise.resolve({ pages: [], databases: [] }), archiveNode,
    } } });
    const user = userEvent.setup();
    const { container } = render(<EditorHarness initial={[
      { id: 'link', type: 'page-link', pageId: 'target', content: '' },
      { id: 'text', type: 'text', content: 'Body text' },
    ]} />);
    await screen.findByRole('button', { name: 'Linked page' });
    await user.click(screen.getByRole('textbox'));
    await user.keyboard(`{${modifier}>}a{/${modifier}}`);
    expect(container.querySelectorAll('[data-line-selected="true"]')).toHaveLength(2);
    await user.keyboard(`{${key}}`);
    expect(screen.queryByRole('button', { name: 'Linked page' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox').textContent?.replaceAll('\u200B', '')).toBe('');
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus());
    await user.keyboard(`{${modifier}>}z{/${modifier}}`);
    expect(await screen.findByRole('button', { name: 'Linked page' })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveTextContent('Body text');
    expect(archiveNode).not.toHaveBeenCalled();
  });

  it('removes a block of any kind with one Backspace at its head', async () => {
    const user = userEvent.setup();
    render(<EditorHarness initial={[
      { id: 'intro', type: 'text', content: 'Intro' },
      { id: 'heading', type: 'h2', content: '' },
      { id: 'tail', type: 'text', content: 'Tail' },
    ]} />);

    // A heading used to become a paragraph on the first press and only go on
    // the second, which left an empty line behind whenever someone stopped.
    const heading = screen.getAllByRole('textbox')[1]!;
    await user.click(heading);
    await user.keyboard('{Backspace}');

    await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(2));
    expect(screen.getAllByRole('textbox').map((box) => box.textContent?.replaceAll('\u200B', ''))).toEqual(['Intro', 'Tail']);
  });

  it('hands the caret to the page title when Backspace runs out of blocks', async () => {
    const user = userEvent.setup();
    render(<div className="custom-page-view">
      <textarea className="custom-page-title-input" defaultValue="Shop notes" aria-label="Page title" />
      <EditorHarness initial={[{ id: 'first', type: 'text', content: '' }, { id: 'second', type: 'text', content: 'Body' }]} />
    </div>);

    await user.click(screen.getAllByRole('textbox')[1]!);
    await user.keyboard('{Backspace}');

    const title = screen.getByLabelText('Page title');
    await waitFor(() => expect(title).toHaveFocus());
    expect((title as HTMLTextAreaElement).selectionStart).toBe('Shop notes'.length);
  });

  it('lays a page that still holds two columns out one block after another', async () => {
    render(<EditorHarness initial={[
      { id: 'columns', type: 'columns', content: '', col1Blocks: [{ id: 'left', type: 'text', content: 'Left side' }], col2Blocks: [{ id: 'right', type: 'h3', content: 'Right side' }] },
    ]} />);

    // The block was withdrawn; the writing inside one is kept.
    await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(2));
    expect(screen.getAllByRole('textbox').map((box) => box.textContent)).toEqual(['Left side', 'Right side']);
  });

  it('picks single lines out of a page with a held modifier, the way Finder does', async () => {
    const user = userEvent.setup();
    const { container } = render(<EditorHarness initial={[
      { id: 'a', type: 'text', content: 'One' },
      { id: 'b', type: 'text', content: 'Two' },
      { id: 'c', type: 'text', content: 'Three' },
    ]} />);

    const handles = screen.getAllByRole('button', { name: /Block actions|Drag/ });
    await user.keyboard('{Meta>}');
    await user.click(handles[0]!);
    await user.click(handles[2]!);
    await user.keyboard('{/Meta}');

    expect([...container.querySelectorAll('[data-line-selected="true"]')].map((row) => row.getAttribute('data-block-id'))).toEqual(['a', 'c']);
  });

  it('keeps select-all inside a page-picker search input', async () => {
    Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: {
      getPageGraph: () => Promise.resolve({ pages: [], links: [] }),
      getNavigation: () => Promise.resolve({ pages: [], databases: [] }),
    } } });
    const user = userEvent.setup();
    const { container } = render(<EditorHarness initial={[{ id: 'link', type: 'page-link', content: '' }]} />);
    const search = await screen.findByRole('textbox', { name: 'Find a page' });
    await user.type(search, 'Query'); await user.keyboard('{Control>}a{/Control}{Backspace}');
    expect(search).toHaveValue('');
    expect(container.querySelector('[data-block-id="link"]')).toBeInTheDocument();
  });

  it('splits at the caret and merges back into the previous block', async () => {
    const user = userEvent.setup();
    render(<EditorHarness initial={[{ content: 'Hello', id: 'one', type: 'text' }]} />);
    const first = screen.getByRole('textbox');
    if (first.getAttribute('contenteditable') !== 'true') throw new Error('Expected the text block editor.');
    first.focus();
    // Place cursor at end for Enter split
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(first);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    await user.keyboard('{Enter}');
    const boxes = await screen.findAllByRole('textbox');
    const second = boxes[1]!;
    second.focus();
    const endRange = document.createRange();
    endRange.selectNodeContents(second);
    endRange.collapse(false);
    sel.removeAllRanges();
    sel.addRange(endRange);
    await user.keyboard('World');
    expect(second).toHaveTextContent('World');
    // Place cursor at start for Backspace merge
    const range2 = document.createRange();
    range2.selectNodeContents(second);
    range2.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range2);
    await user.keyboard('{Backspace}');
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('textbox')).toHaveTextContent('HelloWorld');
  });

  it('opens block actions from the six-dot handle and duplicates a block', async () => {
    const user = userEvent.setup();
    render(<EditorHarness initial={[{ content: 'Keep me', id: 'one', type: 'text' }]} />);
    await user.click(screen.getByRole('button', { name: 'Block actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(screen.getAllByText('Keep me')).toHaveLength(2);
  });

  it('focuses the final line when the empty page canvas is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<EditorHarness initial={[
      { content: 'First', id: 'one', type: 'text' },
      { content: 'Last', id: 'two', type: 'text' },
    ]} />);
    const clickTarget = container.querySelector('.notion-editor-canvas');
    if (!(clickTarget instanceof HTMLElement)) throw new Error('Expected the page click target.');
    await user.dblClick(clickTarget);
    await waitFor(() => expect(screen.getAllByRole('textbox').at(-1)).toHaveFocus());
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
