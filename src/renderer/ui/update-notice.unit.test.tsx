// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { UpdateNotice } from './update-notice';

afterEach(() => { cleanup(); localStorage.clear(); });

it.each(['checking', 'downloading', 'installing'] as const)('announces %s with visible activity', async (state) => {
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { updates: { getStatus: () => Promise.resolve({ state, currentVersion: '1.2.0' }) } } });
  const { container } = render(<UpdateNotice locale="en" onOpen={vi.fn()} />);
  expect(await screen.findByRole('status')).toHaveTextContent(/Checking|Downloading|Restarting/);
  expect(container.querySelector('.update-spinner')).toBeInTheDocument();
});

it('shows an install error returned by the service and opens recovery settings', async () => {
  const onOpen = vi.fn();
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { updates: {
    getStatus: () => Promise.resolve({ state: 'ready', currentVersion: '1.2.0', availableVersion: '1.3.0' }),
    install: () => Promise.resolve({ state: 'error', currentVersion: '1.2.0' }),
  } } });
  render(<UpdateNotice locale="en" onOpen={onOpen} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Restart and install' }));
  await user.click(await screen.findByRole('button', { name: 'Update failed · Retry' }));
  expect(onOpen).toHaveBeenCalledOnce();
  expect(screen.queryByText('Restarting…')).not.toBeInTheDocument();
});
