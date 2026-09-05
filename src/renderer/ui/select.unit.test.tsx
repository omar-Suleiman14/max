// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { Select } from './select';

afterEach(cleanup);
it('uses an app popup, skips disabled options, and preserves trigger focus', async () => {
  const user = userEvent.setup(); const change = vi.fn<(event: React.ChangeEvent<HTMLSelectElement>) => void>();
  const { container } = render(<label><span>Method</span><Select onChange={change} value="cash"><option value="cash">Cash</option><option disabled value="old">Archived</option><option value="wallet">Wallet</option></Select></label>);
  expect(container.querySelector('select')).toBeNull();
  const trigger = screen.getByRole('combobox', { name: 'Method' });
  await user.click(trigger);
  await user.keyboard('{ArrowDown}{Enter}');
  expect(change.mock.calls[0]?.[0].target.value).toBe('wallet');
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
it('closes Escape locally and supports Arabic options by pointer', async () => {
  const user = userEvent.setup(); const change = vi.fn<(event: React.ChangeEvent<HTMLSelectElement>) => void>(); const parentKey = vi.fn();
  render(<div onKeyDown={parentKey}><Select aria-label="الحساب" onChange={change} value="cash"><option value="cash">نقدي</option><option value="wallet">محفظة</option></Select></div>);
  await user.click(screen.getByRole('combobox'));
  await user.keyboard('{Escape}'); expect(parentKey).not.toHaveBeenCalled();
  await user.click(screen.getByRole('combobox'));
  await user.click(screen.getByRole('option', { name: 'محفظة' }));
  expect(change.mock.calls[0]?.[0].target.value).toBe('wallet');
});
