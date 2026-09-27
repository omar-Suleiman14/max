// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CustomPageView } from './custom-page-view';

afterEach(cleanup);

it('focuses the last line only from body whitespace, not the header, cover or outer page', async () => {
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: {
    getNavigation: () => Promise.resolve({ pages: [], databases: [] }),
    getPageGraph: () => Promise.resolve({ links: [], pages: [] }),
  } } });
  const { container } = render(<CustomPageView locale="en" onUpdatePage={vi.fn()} page={{
    id: 'page', title: 'Test', icon: '', createdAt: '2026-09-20', updatedAt: '2026-09-20',
    cover: { kind: 'gradient', value: 'blue', position: 50 },
    blocks: [{ id: 'first', type: 'text', content: 'First' }, { id: 'last', type: 'text', content: 'Last' }],
  }} />);
  const editable = await waitFor(() => {
    const element = container.querySelector<HTMLElement>('.bn-editor[contenteditable=true]');
    if (!element) throw new Error('editor not mounted');
    return element;
  });
  const title = container.querySelector<HTMLElement>('.custom-page-title-input')!;
  title.focus();
  for (const selector of ['.custom-page-header', '.custom-page-view', '.page-cover__image']) {
    fireEvent.click(container.querySelector(selector)!);
    expect(editable).not.toHaveFocus();
  }
  fireEvent.click(container.querySelector('.custom-page-content')!);
  await waitFor(() => expect(editable).toHaveFocus());
  expect(window.getSelection()?.anchorNode?.textContent).toBe('Last');
});
