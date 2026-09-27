// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../ui/notion-block-editor', () => ({ NotionBlockEditor: () => <div>Content</div> }));
import { RecordDrawer } from './RecordDrawer';
afterEach(cleanup);
it('Astra: a full backdrop press dismisses the picker but leaves the drawer open', async () => {
  const close = vi.fn();
  const record = { id: 'r', databaseId: 'db', title: 'Record', properties: {}, contentJson: null };
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: { updateRecord: vi.fn(() => Promise.resolve({ ok: true, value: record })) } } });
  render(<RecordDrawer isOpen locale="en" onArchive={vi.fn()} onClose={close} record={record as never} schema={{ database: { id: 'db', title: 'Records' }, properties: [], views: [] } as never} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Change page icon' }));
  expect(screen.getByRole('dialog', { name: 'Select icon' })).toBeInTheDocument();
  await user.pointer({ keys: '[MouseLeft]', target: document.querySelector('.drawer-backdrop')! });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Select icon' })).not.toBeInTheDocument());
  expect(close).not.toHaveBeenCalled();
});
