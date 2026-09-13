// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
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

it('shows immediate loading, prevents duplicate checks, and reports success', async () => {
  let finish!: (status: { state: 'current'; currentVersion: string }) => void;
  const check = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { updates: {
    getStatus: () => Promise.resolve({ state: 'idle', currentVersion: '0.4.5' }), check,
  } } });
  render(<UpdateSettings locale="en" />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Check for updates' }));
  const checking = screen.getByRole('button', { name: 'Checking for updates…' });
  expect(checking).toBeDisabled();
  expect(checking).toHaveAttribute('aria-busy', 'true');
  await user.click(checking);
  expect(check).toHaveBeenCalledOnce();
  await act(() => { finish({ state: 'current', currentVersion: '0.4.5' }); return Promise.resolve(); });
  // The spinner is held briefly so a check that answers at once still reads as
  // one that happened, rather than as a button that did nothing.
  expect(await screen.findByText('You’re up to date.', undefined, { timeout: 3000 })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
});

it('offers a download on a build that cannot install the update itself', async () => {
  const openExternal = vi.fn(() => Promise.resolve({ ok: true, value: null }));
  Object.defineProperty(window, 'maxApi', { configurable: true, value: {
    updates: { getStatus: () => Promise.resolve({ availableVersion: 'v1.0.2', currentVersion: '1.0.1', downloadUrl: 'https://github.com/o/r/releases/tag/v1.0.2', state: 'available' }), check: vi.fn() },
    workspace: { openExternal },
  } });
  render(<UpdateSettings locale="en" />);

  expect(await screen.findByText(/A newer version is available to download\. \(v1\.0\.2\)/)).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Download' }));

  expect(openExternal).toHaveBeenCalledWith('https://github.com/o/r/releases/tag/v1.0.2');
});

it('shows a progress bar while a download is under way', async () => {
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { updates: {
    getStatus: () => Promise.resolve({ availableVersion: '1.0.2', currentVersion: '1.0.1', state: 'downloading' }), check: vi.fn(),
  } } });
  render(<UpdateSettings locale="en" />);

  expect(await screen.findByRole('progressbar', { name: 'Downloading update…' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Downloading update…' })).toBeDisabled();
});

it('reports a failed request and allows a retry', async () => {
  const check = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ state: 'current', currentVersion: '0.4.5' });
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { updates: {
    getStatus: () => Promise.resolve({ state: 'idle', currentVersion: '0.4.5' }), check,
  } } });
  render(<UpdateSettings locale="en" />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Check for updates' }));
  expect(await screen.findByText('Could not update. Check your connection and try again.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Check for updates' }));
  expect(await screen.findByText('You’re up to date.')).toBeInTheDocument();
});
