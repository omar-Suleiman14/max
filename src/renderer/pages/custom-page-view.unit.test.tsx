// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CustomPageView } from './custom-page-view';

afterEach(cleanup);

it('focuses the last line only from body whitespace, not the header, cover or outer page', async () => {
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: {
    getNavigation: () => Promise.resolve({ pages: [], databases: [] }),
  } } });
  const { container } = render(<CustomPageView locale="en" onUpdatePage={vi.fn()} page={{
    id: 'page', title: 'Test', icon: '', createdAt: '2026-09-20', updatedAt: '2026-09-20',
    cover: { kind: 'gradient', value: 'blue', position: 50 },
    blocks: [{ id: 'first', type: 'text', content: 'First' }, { id: 'last', type: 'text', content: 'Last' }],
  }} />);
  const [first, last] = screen.getAllByRole('textbox', { name: 'Text block' });
  first!.focus();
  for (const selector of ['.custom-page-header', '.custom-page-view', '.page-cover__image']) {
    fireEvent.click(container.querySelector(selector)!);
    expect(last).not.toHaveFocus();
  }
  window.getSelection()?.removeAllRanges();
  fireEvent.click(container.querySelector('.custom-page-content')!);
  await waitFor(() => expect(last).toHaveFocus());
});
