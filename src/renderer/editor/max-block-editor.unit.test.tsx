// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import axe from 'axe-core';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotionBlock } from './page-blocks';
import { MaxBlockEditor, maxSlashItems } from './max-block-editor';
import type { MaxSchemaEditor } from './max-blocknote-schema';

afterEach(cleanup);
beforeEach(() => {
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: {
    getNavigation: () => Promise.resolve({ databases: [], pages: [] }),
    getPageGraph: () => Promise.resolve({ links: [], pages: [{ id: 'p1', title: 'Plans' }] }),
  } } });
});

type Harness = Readonly<{ editor: MaxSchemaEditor; editable: HTMLElement; onChange: ReturnType<typeof vi.fn>; latest: () => readonly NotionBlock[]; title: HTMLTextAreaElement }>;

async function mount(blocks: readonly NotionBlock[], locale: 'ar' | 'en' = 'en'): Promise<Harness> {
  const onChange = vi.fn();
  const ref = createRef<MaxSchemaEditor>();
  const { container } = render(<div className="custom-page-view">
    <textarea className="custom-page-title-input" defaultValue="Title" />
    <MaxBlockEditor blocks={blocks} editorRef={ref} locale={locale} onChange={onChange} />
  </div>);
  const editable = await waitFor(() => {
    const element = container.querySelector<HTMLElement>('.bn-editor[contenteditable=true]');
    if (!element || !ref.current) throw new Error('editor not mounted');
    return element;
  });
  return {
    editable, editor: ref.current!, onChange,
    latest: () => onChange.mock.calls.at(-1)?.[0] as readonly NotionBlock[],
    title: container.querySelector('textarea')!,
  };
}

function press(harness: Harness, key: string, init: KeyboardEventInit = {}) {
  harness.editor.focus();
  fireEvent.keyDown(harness.editable, { key, ...init });
}

const text = (id: string, content: string, type: NotionBlock['type'] = 'text'): NotionBlock => ({ content, id, type });

describe('MaxBlockEditor', () => {
  it('opens a page without writing it', async () => {
    const harness = await mount([text('a', '**Hello**'), { content: '', id: 'd', type: 'divider' }]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(harness.onChange).not.toHaveBeenCalled();
  });

  it('removes a caret-less block above the line and keeps the caret on that line', async () => {
    const harness = await mount([text('a', 'one'), { content: '', id: 'd', type: 'divider' }, text('b', 'three')]);
    harness.editor.setTextCursorPosition('b', 'start');
    press(harness, 'Backspace');
    await waitFor(() => expect(harness.latest().map((block) => block.id)).toEqual(['a', 'b']));
    expect(harness.editor.getTextCursorPosition().block.id).toBe('b');
  });

  it('takes the box off an emptied callout, quote, code block or toggle and keeps the line', async () => {
    for (const type of ['callout', 'quote', 'code', 'toggle'] as const) {
      cleanup();
      const harness = await mount([text('a', 'above'), { content: '', id: 'box', type }]);
      harness.editor.setTextCursorPosition('box', 'start');
      press(harness, 'Backspace');
      await waitFor(() => expect(harness.latest().find((block) => block.id === 'box')?.type).toBe('text'));
      expect(harness.latest()).toHaveLength(2);
    }
  });

  it('merges a heading into the line above in one press', async () => {
    const harness = await mount([text('a', 'one '), text('h', 'two', 'h2')]);
    harness.editor.setTextCursorPosition('h', 'start');
    press(harness, 'Backspace');
    await waitFor(() => expect(harness.latest()).toEqual([expect.objectContaining({ content: 'one two', id: 'a', type: 'text' })]));
  });

  it('removes an empty list item in one press and returns to the line above', async () => {
    const harness = await mount([text('a', 'one'), text('b', '', 'bullet')]);
    harness.editor.setTextCursorPosition('b', 'start');
    press(harness, 'Backspace');
    await waitFor(() => expect(harness.latest().map((block) => block.id)).toEqual(['a']));
    expect(harness.editor.getTextCursorPosition().block.id).toBe('a');
  });

  it('moves from the head of the first line to the page title', async () => {
    const harness = await mount([text('a', 'one'), text('b', 'two')]);
    harness.editor.setTextCursorPosition('a', 'start');
    press(harness, 'Backspace');
    expect(harness.title).toHaveFocus();
  });

  it('splits a line with Enter and continues a list', async () => {
    const harness = await mount([text('a', 'onetwo', 'bullet')]);
    harness.editor.setTextCursorPosition('a', 'end');
    press(harness, 'Enter');
    await waitFor(() => expect(harness.latest()).toHaveLength(2));
    expect(harness.latest()[1]!.type).toBe('bullet');
  });

  it('nests a line with Tab and stores it as a Max child', async () => {
    const harness = await mount([text('a', 'parent', 'bullet'), text('b', 'child', 'bullet')]);
    harness.editor.setTextCursorPosition('b', 'end');
    press(harness, 'Tab');
    await waitFor(() => expect(harness.latest()).toHaveLength(1));
    expect(harness.editor.document[0]!.children[0]!.id).toBe('b');
  });

  it('undoes and redoes an edit', async () => {
    const harness = await mount([text('a', 'one')]);
    harness.editor.updateBlock('a', { content: 'changed' });
    await waitFor(() => expect(harness.latest()[0]!.content).toBe('changed'));
    harness.editor.undo();
    await waitFor(() => expect(harness.latest()[0]!.content).toBe('one'));
    harness.editor.redo();
    await waitFor(() => expect(harness.latest()[0]!.content).toBe('changed'));
  });

  it('pastes Markdown as formatted blocks stored in Max inline format', async () => {
    const harness = await mount([text('a', '')]);
    // jsdom has no ClipboardEvent; this is the conversion a Markdown paste runs.
    harness.editor.replaceBlocks(harness.editor.document, harness.editor.tryParseMarkdownToBlocks('**bold** and *soft*\n\n- item'));
    await waitFor(() => expect(harness.latest().map((block) => [block.type, block.content])).toEqual([['text', '**bold** and *soft*'], ['bullet', 'item']]));
  });

  it('keeps page links as Max ids through an edit elsewhere on the line', async () => {
    const harness = await mount([text('a', 'see [Plans](max-page:p1)'), text('b', 'x')]);
    harness.editor.updateBlock('b', { content: 'y' });
    await waitFor(() => expect(harness.latest()[0]!.content).toBe('see [Plans](max-page:p1)'));
  });

  it('offers Max blocks in the slash menu and inserts a callout', async () => {
    const harness = await mount([text('a', '')]);
    harness.editor.setTextCursorPosition('a', 'start');
    const items = maxSlashItems(harness.editor, 'en');
    expect(items.map((item) => item.title)).toEqual(expect.arrayContaining(['Callout', 'Columns', 'Database', 'Link to page', 'Mention a page', 'Embed', 'Web bookmark', 'Table of contents']));
    items.find((item) => item.title === 'Callout')!.onItemClick();
    await waitFor(() => expect(harness.latest()[0]).toEqual(expect.objectContaining({ calloutIcon: 'lucide:Info', type: 'callout' })));
  });

  it('keeps an unsupported block through unrelated edits', async () => {
    const future = { content: 'x', id: 'future', payload: { deep: true }, type: 'hologram' } as unknown as NotionBlock;
    const harness = await mount([text('a', 'one'), future]);
    harness.editor.updateBlock('a', { content: 'two' });
    await waitFor(() => expect(harness.latest()[1]).toEqual(future));
  });

  it('lays out right to left in Arabic and has no detectable accessibility violations', async () => {
    const harness = await mount([text('a', 'مرحبا'), text('b', 'بالعالم', 'h2')], 'ar');
    expect(harness.editable.closest('.max-block-editor')).toHaveAttribute('dir', 'rtl');
    const results = await axe.run(harness.editable.closest('.max-block-editor')!, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
