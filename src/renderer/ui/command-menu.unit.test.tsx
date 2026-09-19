// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { CommandMenu } from './command-menu';

afterEach(cleanup);

it('supports typing, arrow selection and Enter without losing Arabic digit matches', async () => {
  const run = vi.fn();
  const close = vi.fn();
  render(<CommandMenu locale="ar" onClose={close} commands={[
    { id: 'first', keywords: [], label: 'فاتورة ١٢٣', run: vi.fn() },
    { id: 'second', keywords: [], label: 'فاتورة 123 أخرى', run },
  ]} />);
  const user = userEvent.setup();
  expect(screen.getByRole('combobox')).toHaveFocus();
  await user.type(screen.getByRole('combobox'), 'فاتوره 123');
  expect(screen.getAllByRole('option')).toHaveLength(2);
  await user.keyboard('{ArrowDown}{Enter}');
  expect(run).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});

it('closes on Escape', async () => {
  const close = vi.fn();
  render(<CommandMenu locale="en" onClose={close} commands={[]} />);
  await userEvent.setup().keyboard('{Escape}');
  expect(close).toHaveBeenCalledOnce();
});
