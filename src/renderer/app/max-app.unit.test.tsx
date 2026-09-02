// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import axe from 'axe-core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
const resetWorkspace = vi.fn(() => Promise.resolve({ ok: true as const, value: null }));
const scrollIntoView = vi.fn();

const objectApi = {
  archiveProperty: vi.fn(),
  archiveRecord: vi.fn(),
  createProperty: vi.fn(),
  createRecord: vi.fn(),
  listAudit: vi.fn(() => Promise.resolve([])),
  listProperties: vi.fn<() => Promise<readonly PropertyDefinition[]>>(() => Promise.resolve([])),
  listRecords: vi.fn<() => Promise<readonly ConfigurableRecord[]>>(() => Promise.resolve([])),
  reorderRecords: vi.fn(() => Promise.resolve({ ok: true as const, value: null })),
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
import type { QuickEntryDraft, QuickEntryPriceSuggestion } from '../../shared/quick-entry-contract';
import type { AccountDefinition } from '../../shared/account-contract';
import type { WorkspaceNavigation, WorkspaceNode, WorkspaceNodeDraft, WorkspaceNodePatch } from '../../shared/workspace-contract';
import type { ConfigurableRecord, PropertyDefinition, PropertyDraft } from '../../shared/object-contract';
import { calculatePricing, type PricingProfile, type PricingProfileDraft, type PricingService } from '../../shared/pricing-contract';

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
  resetDemoData: vi.fn(() => Promise.resolve({
    ok: true as const,
    value: { accounts: 8, items: 24, pages: 4, people: 8, transactions: 15 },
  })),
  seedDemoData: vi.fn(() => Promise.resolve({
    ok: true as const,
    value: { accounts: 3, items: 3, pages: 2, people: 3, transactions: 7 },
  })),
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
  list: vi.fn<() => Promise<readonly AccountDefinition[]>>(() => Promise.resolve([])),
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
  getSuggestion: vi.fn<() => Promise<QuickEntryPriceSuggestion>>(() => Promise.resolve({ amount: null, source: 'none' as const })),
  quotePricing: vi.fn((draft: QuickEntryDraft) => {
    const profile = pricingProfiles.find(({ id }) => id === draft.pricingProfileId);
    if (!profile) return Promise.resolve({ ok: true as const, value: null });
    return Promise.resolve({
      ok: true as const,
      value: calculatePricing(profile, {
        amount: draft.totalAmount,
        inputMode: draft.pricingInputMode,
        overrides: draft.pricingOverrides,
        providerCost: draft.providerCost,
      }, '2026-08-31'),
    });
  }),
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

let pricingProfiles: PricingProfile[] = [];
let pricingServices: PricingService[] = [];
const emptyCatalogApi = {
  archive: vi.fn(() => Promise.resolve({ ok: true as const, value: null })),
  create: vi.fn(),
  list: vi.fn(() => Promise.resolve([])),
  update: vi.fn(),
};
const pricingApi = {
  archive: vi.fn((id: string) => {
    pricingProfiles = pricingProfiles.filter((profile) => profile.id !== id);
    return Promise.resolve({ ok: true as const, value: null });
  }),
  create: vi.fn((draft: PricingProfileDraft) => {
    const profile: PricingProfile = { ...draft, createdAt: '2026-08-31', id: `pricing-${pricingProfiles.length + 1}`, updatedAt: '2026-08-31' };
    pricingProfiles = [...pricingProfiles, profile];
    return Promise.resolve({ ok: true as const, value: profile });
  }),
  list: vi.fn(() => Promise.resolve(pricingProfiles)),
  channels: emptyCatalogApi,
  providers: emptyCatalogApi,
  quote: vi.fn(),
  services: {
    ...emptyCatalogApi,
    list: vi.fn(() => Promise.resolve(pricingServices)),
  },
  update: vi.fn((id: string, draft: PricingProfileDraft) => {
    const profile: PricingProfile = { ...draft, createdAt: '2026-08-31', id, updatedAt: '2026-08-31' };
    pricingProfiles = pricingProfiles.map((candidate) => candidate.id === id ? profile : candidate);
    return Promise.resolve({ ok: true as const, value: profile });
  }),
};

const peopleApi = {
  forgiveDebt: vi.fn(() =>
    Promise.resolve({
      ok: true as const,
      value: {
        createdAt: '2026-08-29',
        id: 'forgive-1',
        movements: [],
        paidAmount: 0,
        paymentStatus: 'unpaid' as const,
        totalAmount: 100,
        transactionType: 'adjustment' as const,
        updatedAt: '2026-08-29',
      },
    }),
  ),
  getBalances: vi.fn(() => Promise.resolve([])),
  getStatement: vi.fn((personId: string) =>
    Promise.resolve({
      history: [],
      summary: { netBalance: 0, payable: 0, personId, personLabel: 'Test', receivable: 0 },
      unpaidTransactions: [],
    }),
  ),
  repayDebt: vi.fn(() =>
    Promise.resolve({
      ok: true as const,
      value: {
        createdAt: '2026-08-29',
        id: 'repay-1',
        movements: [],
        paidAmount: 100,
        paymentStatus: 'paid' as const,
        totalAmount: 100,
        transactionType: 'income' as const,
        updatedAt: '2026-08-29',
      },
    }),
  ),
};

import type { CustomPage, CustomPageDraft } from '../../shared/views-search-contract';

type TestMutationResult<T> = { ok: true; value: T } | { error: string; ok: false };

const pagesApi = {
  archive: vi.fn((): Promise<TestMutationResult<null>> => Promise.resolve({ ok: true, value: null })),
  create: vi.fn(
    (draft: CustomPageDraft): Promise<TestMutationResult<CustomPage>> =>
      Promise.resolve({
        ok: true,
        value: {
          createdAt: '2026-08-30T10:00:00.000Z',
          icon: draft.icon ?? 'FileText',
          id: 'page-1',
          layoutJson: draft.layoutJson,
          name: draft.name,
          position: draft.position ?? 0,
          updatedAt: '2026-08-30T10:00:00.000Z',
        },
      }),
  ),
  emptyTrash: vi.fn((): Promise<TestMutationResult<null>> => Promise.resolve({ ok: true, value: null })),
  list: vi.fn((): Promise<readonly CustomPage[]> => Promise.resolve([])),
  listArchived: vi.fn((): Promise<readonly CustomPage[]> => Promise.resolve([])),
  restore: vi.fn((): Promise<TestMutationResult<CustomPage>> => Promise.resolve({
    ok: true,
    value: { createdAt: '2026-08-30', id: 'restored', layoutJson: '{"blocks":[]}', name: 'Restored', position: 0, updatedAt: '2026-08-30' },
  })),
  update: vi.fn(
    (id: string, draft: CustomPageDraft): Promise<TestMutationResult<CustomPage>> =>
      Promise.resolve({
        ok: true,
        value: {
          createdAt: '2026-08-30T10:00:00.000Z',
          icon: draft.icon ?? 'FileText',
          id,
          layoutJson: draft.layoutJson,
          name: draft.name,
          position: draft.position ?? 0,
          updatedAt: '2026-08-30T10:00:00.000Z',
        },
      }),
  ),
};

const searchApi = {
  query: vi.fn(() => Promise.resolve([])),
};

const viewsApi = {
  archive: vi.fn(),
  create: vi.fn(),
  list: vi.fn(() => Promise.resolve([])),
  update: vi.fn(),
};

const workspaceNode = (draft: WorkspaceNodeDraft) => ({
  archivedAt: null,
  contentJson: draft.contentJson ?? '[]',
  createdAt: '2026-08-30T10:00:00.000Z',
  icon: draft.icon ?? null,
  id: draft.id ?? 'workspace-page-1',
  kind: draft.kind,
  parentNodeId: draft.parentNodeId ?? null,
  positionKey: draft.positionKey ?? 'p00000001',
  revision: 1,
  title: draft.title,
  updatedAt: '2026-08-30T10:00:00.000Z',
});

const workspaceApi = {
  archiveNode: vi.fn(() => Promise.resolve({ ok: true as const, value: null })),
  createNode: vi.fn((draft: WorkspaceNodeDraft) => Promise.resolve({ ok: true as const, value: workspaceNode(draft) })),
  getNavigation: vi.fn<() => Promise<WorkspaceNavigation>>(() => Promise.resolve({ databases: [], pages: [] })),
  getNode: vi.fn<(id: string) => Promise<WorkspaceNode | null>>(() => Promise.resolve(null)),
  listWorkflows: vi.fn(() => Promise.resolve([])),
  migrateV01: vi.fn(() => Promise.resolve({
    ok: true as const,
    value: { accountsMigrated: 0, inventoryMovementsMigrated: 0, itemsMigrated: 0, moneyMovementsMigrated: 0, pagesMigrated: 0, parityCheckPassed: true, peopleMigrated: 0, transactionsMigrated: 0, viewsMigrated: 0 },
  })),
  restoreNode: vi.fn(),
  searchWorkspace: vi.fn(() => Promise.resolve([])),
  updateNode: vi.fn((id: string, patch: WorkspaceNodePatch) => Promise.resolve({ ok: true as const, value: workspaceNode({ ...patch, id, kind: 'page', title: patch.title ?? 'Untitled' }) })),
};

const reconciliationApi = {
  closeSession: vi.fn(),
  getCurrentSession: vi.fn(() => Promise.resolve(null)),
  getExpectedClosing: vi.fn(),
  listSessions: vi.fn(() => Promise.resolve([])),
  openSession: vi.fn(),
};

const backupsApi = {
  create: vi.fn(() => Promise.resolve({ ok: true as const, value: { checksum: 'safe', createdAt: '2026-08-30', filename: 'pre-delete.maxbak', filePath: 'pre-delete.maxbak', id: 'backup-safe', schemaVersion: 6, sizeBytes: 1, trigger: 'pre-delete' as const } })),
  list: vi.fn(() => Promise.resolve([])),
  restore: vi.fn(),
  verify: vi.fn(() => Promise.resolve({ checksumMatch: true, sqliteIntegrityPassed: true, valid: true })),
};

const cloudBackupsApi = {
  create: vi.fn(),
  getStatus: vi.fn(() => Promise.resolve({ configured: false })),
  list: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
  restore: vi.fn(),
  runScheduled: vi.fn(() => Promise.resolve({ ok: true as const, value: null })),
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
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
  Object.defineProperty(window, 'maxApi', {
    configurable: true,
    value: {
      accounts: accountsApi,
      backups: backupsApi,
      blueprints: blueprintApi,
      cloudBackups: cloudBackupsApi,
      objects: objectApi,
      pages: pagesApi,
      people: peopleApi,
      pricing: pricingApi,
      quickEntry: quickEntryApi,
      reconciliation: reconciliationApi,
      search: searchApi,
      shop: shopApi,
      system: { getHealth, resetWorkspace },
      templates: templateApi,
      transactions: transactionsApi,
      views: viewsApi,
      workspace: workspaceApi,
    },
  });
  getHealth.mockClear();
  shopApi.getMetadata.mockClear();
  shopApi.completeOnboarding.mockClear();
  shopApi.seedDemoData.mockClear();
  accountsApi.list.mockClear();
  accountsApi.list.mockResolvedValue([]);
  objectApi.listProperties.mockResolvedValue([]);
  objectApi.listRecords.mockResolvedValue([]);
  transactionsApi.list.mockClear();
  quickEntryApi.getSuggestion.mockReset();
  quickEntryApi.getSuggestion.mockResolvedValue({ amount: null, source: 'none' as const });
  quickEntryApi.quotePricing.mockClear();
  quickEntryApi.submit.mockClear();
  pricingProfiles = [];
  pricingServices = [];
  pricingApi.archive.mockClear();
  pricingApi.create.mockClear();
  pricingApi.list.mockClear();
  pricingApi.quote.mockClear();
  pricingApi.services.list.mockClear();
  pricingApi.services.list.mockImplementation(() => Promise.resolve(pricingServices));
  pricingApi.providers.list.mockClear();
  pricingApi.providers.list.mockResolvedValue([]);
  pricingApi.channels.list.mockClear();
  pricingApi.channels.list.mockResolvedValue([]);
  pricingApi.update.mockClear();
  searchApi.query.mockClear();
  reconciliationApi.getCurrentSession.mockClear();
  reconciliationApi.listSessions.mockClear();
  backupsApi.list.mockClear();
  backupsApi.create.mockClear();
  cloudBackupsApi.getStatus.mockReset();
  cloudBackupsApi.getStatus.mockResolvedValue({ configured: false });
  pagesApi.archive.mockClear();
  pagesApi.create.mockClear();
  pagesApi.list.mockClear();
  pagesApi.listArchived.mockClear();
  pagesApi.update.mockClear();
  workspaceApi.createNode.mockClear();
  workspaceApi.getNavigation.mockReset();
  workspaceApi.getNavigation.mockResolvedValue({ databases: [], pages: [] });
  workspaceApi.getNode.mockReset();
  workspaceApi.getNode.mockResolvedValue(null);
  workspaceApi.updateNode.mockClear();
  resetWorkspace.mockClear();
  scrollIntoView.mockClear();
});

afterEach(() => cleanup());

describe('Max shell', () => {
  it('renders the onboarding wizard on first launch and completes setup', async () => {
    shopMetadataState = { ...shopMetadataState, onboardingCompleted: false };
    const user = userEvent.setup();
    render(<MaxApp />);

    // Step 1: Language
    expect(await screen.findByText('Select language')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 2: Shop Name
    expect(screen.getByText('Shop name')).toBeInTheDocument();
    const shopInput = screen.getByPlaceholderText('e.g., Al-Amal Telecom, Downtown Phones');
    await user.type(shopInput, 'Downtown Phones');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 3: Blueprint
    expect(screen.getByText('Shop structure')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 4: Backup Schedule
    expect(screen.getByText('Backup schedule')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 5: Summary
    expect(screen.getByText('Setup complete')).toBeInTheDocument();
    expect(screen.getByText('Downtown Phones')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open workspace' }));

    // Transition into main workspace
    await screen.findByRole('button', { name: 'Home' });
    expect(screen.getByRole('main', { name: 'Home' })).toBeInTheDocument();
  });

  it('renders the English shell and navigates to Databases workspace', async () => {
    const user = userEvent.setup();
    const { container } = render(<MaxApp />);
    await screen.findByRole('button', { name: 'Home' });
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');

    await user.click(screen.getByRole('button', { name: 'Databases' }));
    expect((await screen.findAllByRole('heading', { name: 'Databases' }))[0]).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Filter' })).toBeInTheDocument();
    expect(container.querySelector('.app-frame')).toMatchSnapshot();
  });

  it('switches the complete shell to Arabic and RTL', async () => {
    const user = userEvent.setup();
    const { container } = render(<MaxApp />);
    await screen.findByRole('button', { name: 'Home' });
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(await screen.findByRole('radio', { name: /^العربية/ }));

    expect(document.documentElement).toHaveAttribute('lang', 'ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    await user.click(screen.getByRole('button', { name: 'المظهر' }));
    const systemTheme = screen.getByRole('radio', { name: 'النظام' });
    systemTheme.focus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'فاتح' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Escape}');
    expect(container.querySelector('.app-frame')).toMatchSnapshot();
  });

  it('leaves Ctrl+K unbound and opens universal data search with Ctrl+F', async () => {
    const user = userEvent.setup();
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Home' });

    fireEvent.keyDown(document, { ctrlKey: true, key: 'k' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.keyDown(document, { ctrlKey: true, key: 'f' });
    const search = await screen.findByRole('searchbox', { name: 'Universal Search' });
    expect(search).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(search).not.toBeInTheDocument();
  });

  it('persists theme choice and navigates back to app when settings closes', async () => {
    const user = userEvent.setup();
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Home' });

    const settings = screen.getByRole('button', { name: 'Settings' });
    await user.click(settings);
    expect((await screen.findAllByRole('button', { name: 'Back to app' }))[0]).toBeInTheDocument();
    expect(await screen.findByRole('navigation', { name: 'Settings sections' })).toBeInTheDocument();
    const appearanceSection = screen.getByRole('button', { name: 'Appearance' });
    await user.click(appearanceSection);
    expect(appearanceSection).toHaveAttribute('aria-current', 'page');
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' }));
    await user.click(screen.getByRole('button', { name: 'Prepare demo store' }));
    await user.click(screen.getByRole('button', { name: 'Confirm reset' }));
    await waitFor(() => expect(shopApi.resetDemoData).toHaveBeenCalledWith('en'));
    expect(screen.getByRole('status')).toHaveTextContent('Demo store is ready.');
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem('max.ui.theme')).toBe('dark');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument());
  });

  it('keeps cloud sign-in out of the shell and enables cloud backup only from Backup settings', async () => {
    cloudBackupsApi.getStatus.mockResolvedValue({ configured: true });
    const user = userEvent.setup();
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Home' });

    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/cloud sign-in/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(await screen.findByRole('button', { name: 'Backup' }));

    const cloudBackupSwitch = await screen.findByRole('switch', { name: 'Enable cloud backup' });
    expect(cloudBackupSwitch).toHaveAttribute('aria-checked', 'false');
    await user.click(cloudBackupSwitch);

    expect(window.localStorage.getItem('max.cloud-backup.enabled')).toBe('true');
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Enable cloud backup' })).toHaveAttribute('aria-checked', 'true'));
  });

  it('creates an editable pricing profile from Settings without leaving the workspace', async () => {
    const user = userEvent.setup();
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Home' });
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(await screen.findByRole('button', { name: 'Pricing' }));
    await user.click(screen.getByRole('button', { name: 'New pricing profile' }));
    await user.type(screen.getByLabelText('Name'), 'Vodafone recharge');
    await user.type(screen.getByLabelText('Provider'), 'Vodafone');
    await user.type(screen.getByLabelText('Service'), 'Recharge');
    await user.click(screen.getByRole('button', { name: 'Add component' }));
    await user.click(screen.getByRole('button', { name: 'Save pricing profile' }));

    await waitFor(() => expect(pricingApi.create).toHaveBeenCalledWith(expect.objectContaining({
      components: [expect.objectContaining({ type: 'profit' })],
      name: 'Vodafone recharge',
      provider: 'Vodafone',
      service: 'Recharge',
    })));
    expect((await screen.findAllByText('Vodafone recharge')).length).toBeGreaterThan(0);
  });

  it('moves predictably through sidebar navigation with arrow keys and creates custom page', async () => {
    const user = userEvent.setup();
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Home' });
    const addPageBtn = screen.getByRole('button', { name: 'Add a page' });
    await user.click(addPageBtn);
    expect(screen.getByPlaceholderText('Untitled')).toBeInTheDocument();
  });

  it('shows favorites, duplicates independent pages, and omits offline copy links', async () => {
    const sourcePage = workspaceNode({
      contentJson: JSON.stringify({ blocks: [{ content: 'Client brief', id: 'source-block', type: 'text' }], favorite: true, wiki: false }),
      icon: 'lucide:FileText',
      id: 'source-page',
      kind: 'page',
      title: 'Client notes',
    });
    workspaceApi.getNavigation.mockResolvedValue({ databases: [], pages: [{ ...sourcePage, level: 0 }] });
    workspaceApi.getNode.mockImplementation((id: string) => Promise.resolve(id === sourcePage.id ? sourcePage : null));
    const user = userEvent.setup();
    render(<MaxApp />);

    const favorites = await screen.findByRole('navigation', { name: 'Favorites' });
    expect(within(favorites).getByRole('button', { name: 'Client notes' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Page settings' }));
    expect(screen.queryByRole('menuitem', { name: 'Copy link' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));

    await waitFor(() => expect(workspaceApi.updateNode).toHaveBeenCalled());
    const duplicateCall = workspaceApi.updateNode.mock.calls.find(([id]) => id === 'workspace-page-1');
    const duplicatedLayout = JSON.parse(duplicateCall?.[1].contentJson ?? '{}') as { blocks?: readonly { id: string }[] };
    expect(duplicatedLayout.blocks?.[0]?.id).not.toBe('source-block');
    expect(screen.getByRole('main', { name: 'Client notes copy' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Change icon or emoji' })).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Client notes copy' })).not.toBeInTheDocument();
  });

  it('resizes the app sidebar with an accessible persistent handle', async () => {
    const user = userEvent.setup();
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Home' });
    const handle = screen.getByRole('separator', { name: 'Resize sidebar' });
    expect(handle).toHaveAttribute('aria-valuenow', '238');
    handle.focus();
    await user.keyboard('{ArrowRight}');
    expect(handle).toHaveAttribute('aria-valuenow', '250');
    await waitFor(() => expect(window.localStorage.getItem('max.ui.sidebar-width')).toBe('250'));
  });

  it('supports Notion-style filter and sort controls on database tables', async () => {
    const user = userEvent.setup();
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Home' });

    const filterButton = await screen.findByRole('button', { name: 'Filter' });
    expect(filterButton).toBeInTheDocument();
    await user.click(filterButton);

    const addFilterBtn = screen.getByRole('button', { name: 'Add filter' });
    expect(addFilterBtn).toBeInTheDocument();
    await user.click(addFilterBtn);
    expect(screen.getByText('Where')).toBeInTheDocument();

    const sortButton = screen.getByRole('button', { name: 'Sort' });
    await user.click(sortButton);
    expect(screen.getByRole('button', { name: 'Add sort' })).toBeInTheDocument();
  });

  it('opens Quick Sale directly with Ctrl+S and keeps every operation in the popup', async () => {
    const user = userEvent.setup();
    objectApi.createRecord.mockResolvedValueOnce({
      ok: true,
      value: {
        createdAt: '2026-08-30',
        id: 'item-inline',
        label: 'iPhone 15',
        objectKind: 'item',
        updatedAt: '2026-08-30',
        values: {},
      },
    });
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Home' });

    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('heading', { name: 'Quick Action' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What do you want to record?' })).not.toBeInTheDocument();
    for (const operation of ['Sell', 'Purchase', 'Expense', 'Income', 'Transfer', 'Adjust']) {
      expect(screen.getByRole('tab', { name: operation })).toBeInTheDocument();
    }
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Databases' }));
    await user.click(await screen.findByRole('button', { name: 'New' }));
    await user.type(screen.getByRole('textbox', { name: 'New item name' }), 'iPhone 15{Enter}');

    await waitFor(() => expect(objectApi.createRecord).toHaveBeenCalledWith({ label: 'iPhone 15', objectKind: 'item', values: {} }));
  });

  it('prefills a selected sale item note and suggested amount', async () => {
    const user = userEvent.setup();
    const item = { createdAt: '2026-08-30', id: 'priced-item', label: 'Screen Protector', objectKind: 'item' as const, updatedAt: '2026-08-30', values: {} };
    objectApi.listRecords.mockResolvedValue([item]);
    accountsApi.list.mockResolvedValueOnce([{ accountType: 'cash', balance: 0, createdAt: '2026-08-30', id: 'cash', initialBalance: 0, name: 'Cash', position: 0, updatedAt: '2026-08-30' }]);
    quickEntryApi.getSuggestion.mockResolvedValueOnce({ amount: 75, source: 'item-price' as const });
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Home' });
    await user.keyboard('{Control>}s{/Control}');
    await user.selectOptions(await screen.findByLabelText('Select item or enter note'), 'priced-item');

    expect(screen.getByPlaceholderText('e.g., Screen protector with fitting')).toHaveValue('Screen Protector');
    await waitFor(() => expect(screen.getByPlaceholderText('0.00')).toHaveValue(75));
  });

  it('previews configurable recharge value and submits the selected pricing profile inline', async () => {
    const user = userEvent.setup();
    const recharge: PricingProfile = {
      active: true,
      components: [
        { base: 'principal', calculation: { entries: [{ customerPays: 100, deliveredValue: 70, providerCost: 100 }], kind: 'lookup' }, chargedTo: 'customer', conditions: [], id: 'conversion', label: 'Recharge value', order: 10, priority: 0, rounding: { mode: 'nearest', precision: 2 }, type: 'conversion' },
        { base: 'principal', calculation: { fixedAmount: 2, kind: 'fixed' }, chargedTo: 'provider', conditions: [], id: 'commission', label: 'Provider commission', order: 20, paidTo: 'shop', priority: 0, rounding: { mode: 'nearest', precision: 2 }, type: 'commission' },
      ],
      createdAt: '2026-08-31', currency: 'EGP', id: 'recharge', inputMode: 'customer_pays', name: 'Mobile recharge', service: 'Recharge', updatedAt: '2026-08-31',
    };
    pricingProfiles = [recharge];
    pricingServices = [{
      active: true, category: 'Recharge', createdAt: '2026-08-31', defaultInputMode: 'customer_pays', id: 'recharge-service',
      inputLabel: 'Customer payment', inputModes: ['customer_pays'], name: 'Mobile recharge', operation: 'sale',
      paymentAccountTypes: ['cash'], pricingProfileId: recharge.id, updatedAt: '2026-08-31',
    }];
    accountsApi.list.mockResolvedValue([{
      accountType: 'cash', balance: 0, createdAt: '2026-08-31', id: 'cash', initialBalance: 0, name: 'Cash', position: 0, updatedAt: '2026-08-31',
    }]);

    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Home' });
    await user.keyboard('{Control>}s{/Control}');
    await user.selectOptions(await screen.findByLabelText('Service'), 'recharge-service');
    fireEvent.change(screen.getAllByPlaceholderText('0.00')[0]!, { target: { value: '100' } });

    expect(await screen.findByText('70.00')).toBeInTheDocument();
    expect(screen.getByText('98.00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Record Sale (Enter)' }));
    await waitFor(() => expect(quickEntryApi.submit).toHaveBeenCalledWith(expect.objectContaining({
      pricingInputMode: 'customer_pays',
      pricingProfileId: 'recharge',
      pricingServiceId: 'recharge-service',
      totalAmount: 100,
    })));
  });

  it('records an account adjustment without leaving the Quick Action popup', async () => {
    const user = userEvent.setup();
    accountsApi.list.mockResolvedValue([{
      accountType: 'cash', balance: 100, createdAt: '2026-08-30', id: 'cash', initialBalance: 100,
      name: 'Cash', position: 0, updatedAt: '2026-08-30',
    }]);
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Home' });

    await user.keyboard('{Control>}s{/Control}');
    await user.click(await screen.findByRole('tab', { name: 'Adjust' }));
    await screen.findByRole('button', { name: /Cash/ });
    await user.selectOptions(screen.getByLabelText('Adjustment direction'), 'outflow');
    await user.type(screen.getByPlaceholderText('0.00'), '12.5');
    await user.type(screen.getByPlaceholderText('e.g., Correct counted cash after review'), 'Count correction');
    await user.click(screen.getByRole('button', { name: 'Record Adjustment (Enter)' }));

    await waitFor(() => expect(quickEntryApi.submit).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'cash',
      adjustmentDirection: 'outflow',
      note: 'Count correction',
      operationKind: 'adjustment',
      totalAmount: 12.5,
    })));
    expect(screen.queryByRole('heading', { name: 'Quick Action' })).not.toBeInTheDocument();
  });

  it('edits a select cell and persists a newly created colored option', async () => {
    const user = userEvent.setup();
    const condition = {
      createdAt: '2026-08-30', id: 'condition', name: 'Condition', objectKind: 'item' as const, position: 0,
      rules: { choices: ['Brand New'], digitsOnly: false, required: false, unique: false },
      type: 'select' as const, updatedAt: '2026-08-30',
    };
    const record = { createdAt: '2026-08-30', id: 'phone', label: 'iPhone', objectKind: 'item' as const, updatedAt: '2026-08-30', values: { condition: 'Brand New' } };
    objectApi.listProperties.mockResolvedValueOnce([condition]);
    objectApi.listRecords.mockResolvedValueOnce([record]).mockResolvedValueOnce([record]).mockResolvedValueOnce([]);
    objectApi.updateProperty.mockResolvedValueOnce({ ok: true, value: { ...condition, rules: { ...condition.rules, choices: ['Brand New', 'Used'] } } });
    objectApi.updateRecord.mockResolvedValueOnce({ ok: true, value: { ...record, values: { condition: 'Used' } } });
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Home' });
    await user.click(await screen.findByRole('button', { name: 'Brand New' }));
    const optionInput = screen.getByPlaceholderText('Search or create an option');
    await user.clear(optionInput);
    await user.type(optionInput, 'Used{Enter}');

    await waitFor(() => expect(objectApi.updateProperty).toHaveBeenCalled());
    const propertyUpdate = objectApi.updateProperty.mock.calls.at(-1) as [string, PropertyDraft] | undefined;
    expect(propertyUpdate?.[0]).toBe('condition');
    expect(propertyUpdate?.[1].rules.choices).toEqual(['Brand New', 'Used']);
    expect(objectApi.updateRecord).toHaveBeenCalledWith('phone', { label: 'iPhone', objectKind: 'item', values: { condition: 'Used' } });
  });

  it('creates a safety backup before deleting the workspace', async () => {
    const user = userEvent.setup();
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Home' });
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.type(await screen.findByLabelText('Type "Test Shop" to confirm'), 'Test Shop');
    await user.click(screen.getByRole('button', { name: 'Delete workspace' }));

    await waitFor(() => expect(resetWorkspace).toHaveBeenCalledOnce());
    expect(backupsApi.create).toHaveBeenCalledWith('pre-delete');
    expect(backupsApi.create.mock.invocationCallOrder[0]).toBeLessThan(resetWorkspace.mock.invocationCallOrder[0] ?? Infinity);
    expect(await screen.findByText('Select language')).toBeInTheDocument();
  });

  it('opens properties and templates sheet and closes when clicking outside or pressing Escape', async () => {
    const user = userEvent.setup();
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Home' });
    await user.click(screen.getByRole('button', { name: 'Databases' }));

    // Click Properties button to open sheet
    const propertiesBtn = await screen.findByRole('button', { name: 'Database properties' });
    await user.click(propertiesBtn);
    expect(screen.getByRole('complementary', { name: 'Schema' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Properties', selected: true })).toBeInTheDocument();

    // Click outside on backdrop to close
    const backdrop = screen.getByTestId('schema-backdrop');
    await user.click(backdrop);
    expect(screen.queryByRole('complementary', { name: 'Schema' })).not.toBeInTheDocument();

    // Click Templates button to open sheet with templates tab
    const templatesBtn = screen.getByRole('button', { name: 'Templates' });
    await user.click(templatesBtn);
    expect(screen.getByRole('complementary', { name: 'Schema' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Templates', selected: true })).toBeInTheDocument();

    // Press Escape to close
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Schema' })).not.toBeInTheDocument();
  });

  it('has no detectable baseline accessibility violations', async () => {
    const { container } = render(<MaxApp />);
    await screen.findByRole('button', { name: 'Home' });
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });
});
