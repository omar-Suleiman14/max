// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '../../shared/transaction-contract';
import { UndoToast } from './undo-toast';

afterEach(cleanup);
it('keeps failed undo retryable and reports success only after confirmation', async () => {
  const user = userEvent.setup();
  const undo = vi.fn().mockRejectedValueOnce(new Error('Database busy')).mockResolvedValueOnce(undefined);
  render(<UndoToast locale="en" onDismiss={vi.fn()} onUndo={undo} transaction={{ id: 'tx', totalAmount: 12, note: 'Sale' } as TransactionRecord} />);
  await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Database busy');
  expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument());
  expect(undo).toHaveBeenCalledTimes(2);
});
