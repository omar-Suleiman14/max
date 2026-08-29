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
    database: { migrationCount: 3, schemaVersion: 3, status: 'ready' as const },
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

const templateApi = {
  archive: vi.fn(),
  create: vi.fn(),
  list: vi.fn(() => Promise.resolve([])),
  update: vi.fn(),
};

const blueprintApi = {
  export: vi.fn(() =>
    Promise.resolve({
      name: 'Test Shop',
      properties: { item: [], person: [] },
      templates: [],
      version: 1 as const,
    }),
  ),
  import: vi.fn(),
  validate: vi.fn(() => Promise.resolve({ issues: [], valid: true })),
};

import type { CompleteOnboardingDraft, ShopMetadata } from '../../shared/blueprint-contract';
import type { QuickEntryDraft } from '../../shared/quick-entry-contract';

let shopMetadataState: ShopMetadata = {
  backupSchedule: 'daily',
  blueprintName: undefined,
  locale: 'en',
  onboardingCompleted: true,
  shopName: 'Test Shop',
};

const shopApi = {
  completeOnboarding: vi.fn((draft: CompleteOnboardingDraft) => {
    shopMetadataState = {
      backupSchedule: draft.backupSchedule,
      blueprintName: draft.blueprint?.name,
      locale: draft.locale,
      onboardingCompleted: true,
      shopName: draft.shopName,
    };
    return Promise.resolve({ ok: true as const, value: shopMetadataState });
  }),
  getMetadata: vi.fn(() => Promise.resolve(shopMetadataState)),
  updateMetadata: vi.fn((patch: Partial<ShopMetadata>) => {
    shopMetadataState = { ...shopMetadataState, ...patch };
    return Promise.resolve({ ok: true as const, value: shopMetadataState });
  }),
};

const accountsApi = {
  archive: vi.fn(() => Promise.resolve({ ok: true as const, value: null })),
  create: vi.fn((draft: { accountType: 'cash'; initialBalance: number; name: string }) =>
    Promise.resolve({
      ok: true as const,
      value: {
        ...draft,
        balance: draft.initialBalance,
        createdAt: '2026-08-29',
        id: 'acc-1',
        position: 0,
        updatedAt: '2026-08-29',
      },
    }),
  ),
  list: vi.fn(() => Promise.resolve([])),
  update: vi.fn((id: string, draft: { accountType: 'cash'; initialBalance: number; name: string }) =>
    Promise.resolve({
      ok: true as const,
      value: {
        ...draft,
        balance: draft.initialBalance,
        createdAt: '2026-08-29',
        id,
        position: 0,
        updatedAt: '2026-08-29',
      },
    }),
  ),
};

import type { TransactionDraft, TransferDraft } from '../../shared/transaction-contract';

const transactionsApi = {
  create: vi.fn((draft: TransactionDraft) =>
    Promise.resolve({
      ok: true as const,
      value: {
        createdAt: '2026-08-29',
        id: 'tx-1',
        movements: [],
        note: draft.note,
        paidAmount: draft.paidAmount,
        paymentStatus: 'paid' as const,
        totalAmount: draft.totalAmount,
        transactionType: draft.transactionType,
        updatedAt: '2026-08-29',
      },
    }),
  ),
  createTransfer: vi.fn((draft: TransferDraft) =>
    Promise.resolve({
      ok: true as const,
      value: {
        createdAt: '2026-08-29',
        id: 'tx-2',
        movements: [],
        note: draft.note,
        paidAmount: draft.amount,
        paymentStatus: 'paid' as const,
        totalAmount: draft.amount,
        transactionType: 'transfer' as const,
        updatedAt: '2026-08-29',
      },
    }),
  ),
  get: vi.fn(() => Promise.resolve(null)),
  getSummary: vi.fn(() =>
    Promise.resolve({
      totalBank: 0,
      totalCash: 0,
      totalExpenses: 0,
      totalOverall: 0,
      totalSales: 0,
      totalWallet: 0,
    }),
  ),
  list: vi.fn(() => Promise.resolve([])),
  reverse: vi.fn((id: string) =>
    Promise.resolve({
      ok: true as const,
      value: {
        createdAt: '2026-08-29',
        id: 'rev-1',
        movements: [],
        paidAmount: 100,
        paymentStatus: 'paid' as const,
        reversalOfId: id,
        totalAmount: 100,
        transactionType: 'reversal' as const,
        updatedAt: '2026-08-29',
      },
    }),
  ),
  undo: vi.fn(() => Promise.resolve({ ok: true as const, value: null })),
};

const quickEntryApi = {
  getSuggestion: vi.fn(() => Promise.resolve({ amount: null, source: 'none' as const })),
  submit: vi.fn((draft: QuickEntryDraft) =>
    Promise.resolve({
      ok: true as const,
      value: {
        createdAt: '2026-08-29',
        id: 'tx-qe',
        movements: [],
        note: draft.note,
        paidAmount: draft.paidAmount ?? draft.totalAmount,
        paymentStatus: 'paid' as const,
        totalAmount: draft.totalAmount,
        transactionType: 'sale' as const,
        updatedAt: '2026-08-29',
      },
    }),
  ),
};

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
  document.documentElement.removeAttribute('data-theme');
  shopMetadataState = {
    backupSchedule: 'daily',
    blueprintName: undefined,
    locale: 'en',
    onboardingCompleted: true,
    shopName: 'Test Shop',
  };
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
    value: {
      accounts: accountsApi,
      blueprints: blueprintApi,
      objects: objectApi,
      quickEntry: quickEntryApi,
      shop: shopApi,
      system: { getHealth },
      templates: templateApi,
      transactions: transactionsApi,
    },
  });
  getHealth.mockClear();
  shopApi.getMetadata.mockClear();
  shopApi.completeOnboarding.mockClear();
  accountsApi.list.mockClear();
  transactionsApi.list.mockClear();
  quickEntryApi.submit.mockClear();
});

afterEach(() => cleanup());

describe('Max shell', () => {
  it('renders the onboarding wizard on first launch and completes setup', async () => {
    shopMetadataState = { ...shopMetadataState, onboardingCompleted: false };
    const user = userEvent.setup();
    render(<MaxApp />);

    // Step 1: Language
    expect(await screen.findByText('Select your preferred language')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 2: Shop Name
    expect(screen.getByText('Shop Name')).toBeInTheDocument();
    const shopInput = screen.getByPlaceholderText('e.g., Al-Amal Telecom, Downtown Accessories');
    await user.type(shopInput, 'Downtown Phones');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 3: Blueprint
    expect(screen.getByText('Choose how to structure your shop')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 4: Backup Schedule
    expect(screen.getByText('Disaster recovery snapshot schedule')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 5: Summary
    expect(screen.getByText('Setup Complete')).toBeInTheDocument();
    expect(screen.getByText('Downtown Phones')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enter Max Workspace' }));

    // Transition into main workspace
    await screen.findByText('Local and ready');
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });

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
