// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { NotionBlockEditor, type NotionBlock } from './notion-block-editor';

function EditorHarness({ initial }: Readonly<{ initial: readonly NotionBlock[] }>) {
  const [blocks, setBlocks] = useState(initial);
  return <NotionBlockEditor blocks={blocks} locale="en" onChange={setBlocks} />;
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
});
