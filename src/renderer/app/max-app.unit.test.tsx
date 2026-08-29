// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import axe from 'axe-core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MaxApp } from './max-app';

const getHealth = vi.fn(() =>
  Promise.resolve({
    appVersion: '0.1.0',
    database: { migrationCount: 1, schemaVersion: 1, status: 'ready' as const },
    runtime: { arch: 'x64', platform: 'windows' as const },
  }),
);
const objectApi = {
  archiveProperty: vi.fn(),
  archiveRecord: vi.fn(),
  createProperty: vi.fn(),
  createRecord: vi.fn(),
  listAudit: vi.fn(() => Promise.resolve([])),
  listProperties: vi.fn(() => Promise.resolve([])),
  listRecords: vi.fn(() => Promise.resolve([])),
  updateProperty: vi.fn(),
  updateRecord: vi.fn(),
};

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
  document.documentElement.removeAttribute('data-theme');
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      removeEventListener: vi.fn(),
    })),
  });
  Object.defineProperty(window, 'maxApi', {
    configurable: true,
    value: { objects: objectApi, system: { getHealth } },
  });
  getHealth.mockClear();
});

afterEach(() => cleanup());

describe('Max shell', () => {
  it('renders the English shell and an actionable empty page', async () => {
    const user = userEvent.setup();
    const { container } = render(<MaxApp />);
    await screen.findByText('Local and ready');
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');

    await user.click(screen.getByRole('button', { name: 'Items' }));
    expect(screen.getByRole('heading', { name: 'No items yet' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Create item' })[0]!);
    expect(screen.getByRole('dialog', { name: 'Create item' })).toBeInTheDocument();
    expect(container.querySelector('.app-frame')).toMatchSnapshot();
  });

  it('switches the complete shell to Arabic and RTL', async () => {
    const user = userEvent.setup();
    const { container } = render(<MaxApp />);
    await screen.findByText('Local and ready');
    await user.click(screen.getByRole('button', { name: 'العربية' }));

    expect(document.documentElement).toHaveAttribute('lang', 'ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('heading', { name: 'الرئيسية' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'الإعدادات' }));
    const systemTheme = screen.getByRole('radio', { name: 'النظام' });
    systemTheme.focus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'فاتح' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Escape}');
    expect(container.querySelector('.app-frame')).toMatchSnapshot();
  });

  it('supports command search and keyboard execution', async () => {
    const user = userEvent.setup();
    render(<MaxApp />);
    await screen.findByText('Local and ready');

    fireEvent.keyDown(document, { ctrlKey: true, key: 'k' });
    const search = screen.getByRole('combobox', { name: 'Search commands' });
    expect(search).toHaveFocus();
    await user.type(search, 'People{Enter}');
    expect(screen.getByRole('heading', { name: 'People' })).toBeInTheDocument();
  });

  it('persists theme choice and restores focus when settings closes', async () => {
    const user = userEvent.setup();
    render(<MaxApp />);
    await screen.findByText('Local and ready');

    const settings = screen.getByRole('button', { name: 'Settings' });
    await user.click(settings);
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem('max.ui.theme')).toBe('dark');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(settings).toHaveFocus());
  });

  it('moves predictably through sidebar navigation with arrow keys', async () => {
    const user = userEvent.setup();
    render(<MaxApp />);
    await screen.findByText('Local and ready');
    const home = screen.getByRole('button', { name: 'Home' });
    const items = screen.getByRole('button', { name: 'Items' });
    home.focus();
    await user.keyboard('{ArrowDown}');
    expect(items).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(items).toHaveAttribute('aria-current', 'page');
  });

  it('has no detectable baseline accessibility violations', async () => {
    const { container } = render(<MaxApp />);
    await screen.findByText('Local and ready');
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });
});
