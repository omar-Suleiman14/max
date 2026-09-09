// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { UpdateSettings } from './update-settings';

afterEach(cleanup);
it('checks without restarting and offers an explicit install when ready', async () => {
  const install = vi.fn(() => Promise.resolve({ state: 'ready', currentVersion: '0.3.0' }));
  const check = vi.fn(() => Promise.resolve({ state: 'ready', currentVersion: '0.3.0' }));
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { updates: {
    getStatus: () => Promise.resolve({ state: 'idle', currentVersion: '0.3.0' }), check, install,
  } } });
  render(<UpdateSettings locale="en" />); const user = userEvent.setup();
  await screen.findByText('Updates are checked automatically.');
  await user.click(screen.getByRole('button', { name: 'Check for updates' }));
  expect(check).toHaveBeenCalledOnce(); expect(install).not.toHaveBeenCalled();
  await user.click(await screen.findByRole('button', { name: 'Restart and install' }));
  expect(install).toHaveBeenCalledOnce();
});
