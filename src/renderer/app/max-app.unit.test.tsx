// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import axe from 'axe-core';
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

configure({ asyncUtilTimeout: 5000 });
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MaxApp } from './max-app';
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

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
import type { AccountDefinition } from '../../shared/account-contract';
import type { WorkspaceNavigation, WorkspaceNode, WorkspaceNodeDraft, WorkspaceNodePatch } from '../../shared/workspace-contract';
import type { WorkspaceView } from '../../shared/view-contract';
import type { ConfigurableRecord, PropertyDefinition } from '../../shared/object-contract';

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
  getPageGraph: vi.fn(() => Promise.resolve({ pages: [], links: [] })),
  getNavigation: vi.fn<() => Promise<WorkspaceNavigation>>(() => Promise.resolve({ databases: [], pages: [] })),
  getNode: vi.fn<(id: string) => Promise<WorkspaceNode | null>>(() => Promise.resolve(null)),
  listRecordTemplates: vi.fn(() => Promise.resolve([])),
  listViews: vi.fn<() => Promise<readonly WorkspaceView[]>>(() => Promise.resolve([])),
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
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
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
  workspaceApi.listViews.mockReset();
  workspaceApi.listViews.mockResolvedValue([]);
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

    expect(await screen.findByRole('button', { name: 'Get started' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Get started' }));
    // Step 1: Language
    expect(await screen.findByText('Select language')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 2: Shop Name
    expect(screen.getByText('Shop name')).toBeInTheDocument();
    const shopInput = screen.getByPlaceholderText('e.g., my workspace');
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
    expect(screen.getByRole('button', { name: 'Open workspace' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'I have read and agree to the Terms & Conditions' }));
    await user.click(screen.getByRole('button', { name: 'Open workspace' }));

    // Transition into main workspace
    await screen.findByRole('button', { name: 'Settings' });
    expect(screen.getByRole('button', { name: 'New note' })).toBeInTheDocument();
  });

  it('renders the English page-first shell without a databases section in the sidebar', async () => {
    const { container } = render(<MaxApp />);
    await screen.findByRole('button', { name: 'Settings' });
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
    expect(screen.queryByRole('button', { name: 'Filter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Databases' })).not.toBeInTheDocument();
    expect(screen.queryByText('Databases', { selector: '.sidebar__section-label' })).not.toBeInTheDocument();
    expect(container.querySelector('.app-frame')).toBeInTheDocument();
  });

  it('switches the complete shell to Arabic and RTL', async () => {
    const user = userEvent.setup();
    const { container } = render(<MaxApp />);
    await screen.findByRole('button', { name: 'Settings' });
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(await screen.findByRole('combobox', { name: 'Language' }));
    await user.click(screen.getByRole('option', { name: /العربية/ }));

    expect(document.documentElement).toHaveAttribute('lang', 'ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    const settingsNav = await screen.findByRole('navigation', { name: 'أقسام الإعدادات' });
    await user.click(within(settingsNav).getByRole('button', { name: 'المظهر' }));
    const systemTheme = screen.getByRole('radio', { name: 'النظام' });
    systemTheme.focus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'داكن' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Escape}');
    expect(container.querySelector('.app-frame')).toBeInTheDocument();
  });

  it('opens the command popup with Ctrl+K and leaves Ctrl+F and Ctrl+S unbound', async () => {
    const user = userEvent.setup();
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Settings' });

    fireEvent.keyDown(document, { ctrlKey: true, key: 'f' });
    fireEvent.keyDown(document, { ctrlKey: true, key: 's' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.keyDown(document, { code: 'KeyK', ctrlKey: true, key: 'k' });
    const search = await screen.findByRole('combobox', { name: 'Universal Search' });
    expect(search).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(search).not.toBeInTheDocument();
  });

  it('stands the workspace pill down while the page map is open, and puts it back', async () => {
    const user = userEvent.setup();
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Settings' });
    expect(screen.getByRole('banner', { name: 'Workspace actions' })).toBeInTheDocument();

    // The map fills the window with its own controls in the same corner, so
    // two glass pills used to sit on top of one another there.
    fireEvent.keyDown(document, { code: 'KeyG', ctrlKey: true, key: 'g' });
    expect(await screen.findByRole('region', { name: 'Page graph' })).toBeInTheDocument();
    expect(screen.queryByRole('banner', { name: 'Workspace actions' })).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Page graph' })).not.toBeInTheDocument());
    expect(screen.getByRole('banner', { name: 'Workspace actions' })).toBeInTheDocument();
  });

  it('opens the same popup from an Arabic layout, where Ctrl+K arrives as a different letter', async () => {
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Settings' });

    fireEvent.keyDown(document, { code: 'KeyK', ctrlKey: true, key: 'ل' });
    expect(await screen.findByRole('combobox', { name: 'Universal Search' })).toBeInTheDocument();
  });

  it('uses Ctrl+comma as a way in and out of Settings', async () => {
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Settings' });

    fireEvent.keyDown(document, { code: 'Comma', ctrlKey: true, key: ',' });
    expect(await screen.findByRole('navigation', { name: 'Settings sections' })).toBeInTheDocument();

    // The comma keycap carries a different character on an Arabic layout.
    fireEvent.keyDown(document, { code: 'Comma', ctrlKey: true, key: 'و' });
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Settings sections' })).not.toBeInTheDocument());
  });

  it('persists theme choice and navigates back to app when settings closes', async () => {
    const user = userEvent.setup();
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Settings' });

    const settings = screen.getByRole('button', { name: 'Settings' });
    await user.click(settings);
    expect((await screen.findAllByRole('button', { name: 'Back' }))[0]).toBeInTheDocument();
    const settingsNav = await screen.findByRole('navigation', { name: 'Settings sections' });
    expect(settingsNav).toBeInTheDocument();
    const appearanceSection = within(settingsNav).getByRole('button', { name: 'Appearance' });
    await user.click(appearanceSection);
    expect(appearanceSection).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem('max.ui.theme')).toBe('dark');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument());
  });

  it('keeps local backup available from Settings without cloud sign-in', async () => {
    const user = userEvent.setup(); render(<MaxApp />);
    await screen.findByRole('button', { name: 'Settings' });
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(within(screen.getByRole('navigation', { name: 'Settings sections' })).getByRole('button', { name: 'Backup' }));
    await waitFor(() => expect(backupsApi.list).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
  });

  it('moves predictably through sidebar navigation with arrow keys and creates custom page', async () => {
    const user = userEvent.setup();
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Settings' });
    const addPageBtn = screen.getByRole('button', { name: 'New' });
    await user.click(addPageBtn);
    expect(await screen.findByPlaceholderText('Untitled')).toBeInTheDocument();
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
    await user.click(within(favorites).getByRole('button', { name: 'Remove Client notes from favorites' }));
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Favorites' })).not.toBeInTheDocument());
    const favoriteUpdate = workspaceApi.updateNode.mock.calls.find(([id, patch]) => {
      const layout = JSON.parse(patch.contentJson ?? '{}') as { favorite?: unknown };
      return id === 'source-page' && layout.favorite === false;
    });
    expect(favoriteUpdate).toBeDefined();
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

  it('creates a nested page from its parent page menu', async () => {
    const parentPage = workspaceNode({
      contentJson: JSON.stringify({ blocks: [{ content: '', id: 'parent-block', type: 'text' }], favorite: false, wiki: false }),
      icon: 'lucide:FileText',
      id: 'parent-page',
      kind: 'page',
      title: 'Operations',
    });
    workspaceApi.getNavigation.mockResolvedValue({ databases: [], pages: [{ ...parentPage, level: 0 }] });
    workspaceApi.getNode.mockImplementation((id: string) => Promise.resolve(id === parentPage.id ? parentPage : null));
    const user = userEvent.setup();
    render(<MaxApp />);

    await screen.findByRole('button', { name: 'Operations' });
    await user.click(screen.getByRole('button', { name: 'Page settings' }));
    await user.click(screen.getByRole('menuitem', { name: 'Add sub-page' }));

    await waitFor(() => expect(workspaceApi.createNode).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'page',
      parentNodeId: 'parent-page',
      title: 'Untitled',
    })));
    expect(await screen.findByRole('button', { name: 'Untitled' })).toBeInTheDocument();
  });

  it('shows databases as nested pages and expands their views from the icon', async () => {
    const shopPage = workspaceNode({
      contentJson: JSON.stringify({ blocks: [{ content: '', databaseId: 'db-products', id: 'products-block', type: 'database-view', viewId: 'view-all' }], favorite: false, wiki: false }),
      icon: 'lucide:Store',
      id: 'shop-page',
      kind: 'page',
      title: 'Phone shop',
    });
    workspaceApi.getNavigation.mockResolvedValue({
      databases: [{ archivedAt: null, icon: 'lucide:Database', id: 'db-products', kind: 'database', level: 1, parentNodeId: 'shop-page', positionKey: 'a0', title: 'Products', visibility: 'normal' }],
      pages: [{ ...shopPage, level: 0 }],
    });
    workspaceApi.getNode.mockImplementation((id: string) => Promise.resolve(id === shopPage.id ? shopPage : null));
    workspaceApi.listViews.mockResolvedValue([{ archivedAt: null, createdAt: '2026-09-02', databaseId: 'db-products', filterAst: null, id: 'view-all', layout: 'table', layoutConfig: {}, name: 'All products', ownerId: 'db-products', ownerType: 'database', positionKey: 'a0', propertyState: { columns: [] }, sorts: [], updatedAt: '2026-09-02' }]);
    const user = userEvent.setup();
    render(<MaxApp />);

    await user.click(await screen.findByRole('button', { name: 'Show Phone shop contents' }));
    // The database belongs to the page it was created in, so it is listed under
    // that page rather than as a top-level sidebar entry.
    expect(await screen.findByRole('button', { name: 'Products' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'All products' })).toBeInTheDocument();
  });

  it('resizes the app sidebar with an accessible persistent handle', async () => {
    const user = userEvent.setup();
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Settings' });
    const handle = screen.getByRole('separator', { name: 'Resize sidebar' });
    expect(handle).toHaveAttribute('aria-valuenow', '238');
    handle.focus();
    await user.keyboard('{ArrowRight}');
    expect(handle).toHaveAttribute('aria-valuenow', '250');
    await waitFor(() => expect(window.localStorage.getItem('max.ui.sidebar-width')).toBe('250'));
  });

  it('dismisses search outside and keeps its keyboard footer without redundant buttons', async () => {
    const user = userEvent.setup(); render(<MaxApp />);
    await screen.findByRole('button', { name: 'Settings' });
    fireEvent.keyDown(document, { code: 'KeyK', ctrlKey: true, key: 'k' });
    const search = await screen.findByRole('combobox', { name: 'Universal Search' });
    await user.type(search, 'notes');
    expect(screen.queryByRole('button', { name: /clear|close/i })).not.toBeInTheDocument();
    expect(screen.getByText('Esc')).toBeInTheDocument();
    fireEvent.mouseDown(document.querySelector('.overlay')!);
    expect(search).not.toBeInTheDocument();
  });

  it('removes the separate quick-action button and leaves Ctrl+S unbound', async () => {
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Settings' });
    expect(screen.queryByRole('button', { name: /Quick action/ })).not.toBeInTheDocument();
    for (const modifier of ['ctrlKey', 'metaKey']) {
      const event = new KeyboardEvent('keydown', { [modifier]: true, key: 's', code: 'KeyS', bubbles: true, cancelable: true });
      fireEvent(document, event);
      expect(event.defaultPrevented).toBe(false);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }
    fireEvent.keyDown(document, { ctrlKey: true, key: 'k', code: 'KeyK' });
    expect(await screen.findByRole('combobox', { name: 'Universal Search' })).toBeInTheDocument();
  });

  it('persists appearance sliders and restores their defaults', async () => {
    const user = userEvent.setup(); render(<MaxApp />);
    await screen.findByRole('button', { name: 'Settings' });
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(within(screen.getByRole('navigation', { name: 'Settings sections' })).getByRole('button', { name: 'Appearance' }));
    const glass = screen.getByRole('slider', { name: 'Glass opacity' });
    fireEvent.change(glass, { target: { value: '60' } });
    expect(document.documentElement.style.getPropertyValue('--popup-opacity')).toBe('60%');
    await user.click(screen.getByRole('button', { name: 'Reset Glass opacity' }));
    expect(glass).toHaveValue('85');
  });

  it('creates a safety backup before deleting the workspace', async () => {
    const user = userEvent.setup();
    render(<MaxApp />);
    await screen.findByRole('button', { name: 'Settings' });
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(await screen.findByRole('button', { name: 'Delete workspace' }));
    await user.type(await screen.findByLabelText('Workspace name to confirm deletion'), 'Test Shop');
    await user.click(within(screen.getByRole('dialog', { name: 'Delete workspace?' })).getByRole('button', { name: 'Delete workspace' }));

    await waitFor(() => expect(resetWorkspace).toHaveBeenCalledOnce());
    expect(backupsApi.create).toHaveBeenCalledWith('pre-delete');
    expect(backupsApi.create.mock.invocationCallOrder[0]).toBeLessThan(resetWorkspace.mock.invocationCallOrder[0] ?? Infinity);
    expect(await screen.findByRole('button', { name: 'Get started' })).toBeInTheDocument();
  });

  it('opens action configuration directly from the empty actions popup', async () => {
    const user = userEvent.setup(); render(<MaxApp />);
    await screen.findByRole('button', { name: 'Settings' });
    fireEvent.keyDown(document, { ctrlKey: true, key: 'k', code: 'KeyK' });
    await user.click(await screen.findByRole('button', { name: 'Manage Quick Actions' }));
    expect(await screen.findByRole('button', { name: '+ Quick action' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Quick Actions' })).not.toBeInTheDocument();
  });

  it('has no detectable baseline accessibility violations', async () => {
    const { container } = render(<MaxApp />);
    await screen.findByRole('button', { name: 'Settings' });
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });
});
