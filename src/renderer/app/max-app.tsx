import {
  CircleDollarSign,
  ContactRound,
  Database,
  FileText,
  Home,
  Package,
  ReceiptText,
  Scale,
  Search,
  Settings,
  X,
  Zap,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { BackupSchedule, Blueprint } from '../../shared/blueprint-contract';
import type { TransactionRecord } from '../../shared/transaction-contract';
import type { WorkspaceNavigation } from '../../shared/workspace-contract';
import { CustomPageView } from '../pages/custom-page-view';
import {
  loadHomePage,
  loadPersistentHomePage,
  saveHomePage,
  archivePersistentCustomPage,
  createPersistentCustomPage,
  loadPersistentCustomPages,
  updatePersistentCustomPage,
} from '../pages/pages-store';
import type { AppPage, CustomPage, EngineStatus, SettingsSectionId } from './app-types';
import { localeDirection, type Locale, type TranslationKey, translate } from './i18n';
import {
  preferenceKeys,
  readLocale,
  readSidebarCollapsed,
  readSidebarWidth,
  readTheme,
  resolveTheme,
  type ThemePreference,
} from './preferences';
import { Button } from '../ui/button';
import type { Command } from '../ui/command-menu';
import { EmptyPage } from '../ui/empty-page';
import { Sidebar } from '../ui/sidebar';
import { UndoToast } from '../ui/undo-toast';

const AccountsWorkspace = lazy(() => import('../accounts/accounts-workspace').then((module) => ({ default: module.AccountsWorkspace })));
const BlueprintDialog = lazy(() => import('../blueprints/blueprint-dialog').then((module) => ({ default: module.BlueprintDialog })));
const CommandMenu = lazy(() => import('../ui/command-menu').then((module) => ({ default: module.CommandMenu })));
const DatabasePage = lazy(() => import('../databases/DatabasePage').then((module) => ({ default: module.DatabasePage })));
const DatabasesWorkspace = lazy(() => import('../databases/databases-workspace').then((module) => ({ default: module.DatabasesWorkspace })));
const ObjectWorkspace = lazy(() => import('../objects/object-workspace').then((module) => ({ default: module.ObjectWorkspace })));
const Onboarding = lazy(() => import('../onboarding/onboarding').then((module) => ({ default: module.Onboarding })));
const QuickEntryDialog = lazy(() => import('../quick-entry/quick-entry-dialog').then((module) => ({ default: module.QuickEntryDialog })));
const ReconciliationWorkspace = lazy(() => import('../reconciliation/reconciliation-workspace').then((module) => ({ default: module.ReconciliationWorkspace })));
const SettingsPage = lazy(() => import('../ui/settings-page').then((module) => ({ default: module.SettingsPage })));
const TransactionsWorkspace = lazy(() => import('../transactions/transactions-workspace').then((module) => ({ default: module.TransactionsWorkspace })));
const UniversalSearchDialog = lazy(() => import('../search/universal-search-dialog').then((module) => ({ default: module.UniversalSearchDialog })));
const WorkflowLauncherDialog = lazy(() => import('../workflows/workflow-launcher-dialog').then((module) => ({ default: module.WorkflowLauncherDialog })));

const pageLabels: Record<string, TranslationKey> = {
  accounts: 'account',
  databases: 'databases',
  home: 'home',
  items: 'item',
  people: 'person',
  reconciliation: 'reconciliation',
  settings: 'settings',
  transactions: 'transaction',
};

const pageIcons: Record<string, LucideIcon> = {
  accounts: CircleDollarSign,
  databases: Database,
  home: Home,
  items: Package,
  people: ContactRound,
  reconciliation: Scale,
  settings: Settings,
  transactions: ReceiptText,
};

const pageSubtitles: Record<string, TranslationKey> = {
  accounts: 'pageSubtitleAccounts',
  databases: 'pageSubtitleDatabases',
  home: 'pageSubtitleHome',
  items: 'pageSubtitleItems',
  people: 'pageSubtitlePeople',
  reconciliation: 'pageSubtitleReconciliation',
  settings: 'pageSubtitleSettings',
  transactions: 'pageSubtitleTransactions',
};

function isEditingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export function MaxApp() {
  const [locale, setLocale] = useState<Locale>(() => readLocale(window.localStorage));
  const [theme, setTheme] = useState<ThemePreference>(() => readTheme(window.localStorage));
  const [systemUsesDark, setSystemUsesDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsed(window.localStorage));
  const [sidebarWidth, setSidebarWidth] = useState(() => readSidebarWidth(window.localStorage));
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>('settings-general');
  const [page, setPage] = useState<AppPage>('home');
  const [customPages, setCustomPages] = useState<readonly CustomPage[]>([]);
  const [workspaceNavigation, setWorkspaceNavigation] = useState<WorkspaceNavigation>({ databases: [], pages: [] });
  const [homePage, setHomePage] = useState<CustomPage>(() => loadHomePage(locale));
  const [commandOpen, setCommandOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [blueprintModalTab, setBlueprintModalTab] = useState<'export' | 'import'>();
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [dataRevision, setDataRevision] = useState(0);
  const [recentTxForUndo, setRecentTxForUndo] = useState<TransactionRecord>();
  const [objectCreateRequest, setObjectCreateRequest] = useState(0);
  const [requestedSavedViewId, setRequestedSavedViewId] = useState<string>();
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('checking');
  const [runtimePlatform, setRuntimePlatform] = useState<'linux' | 'macos' | 'windows'>();
  const [engineNoticeVisible, setEngineNoticeVisible] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [shopName, setShopName] = useState('');
  const [onboardingPreview, setOnboardingPreview] = useState(false);
  const [openRecordId, setOpenRecordId] = useState<string>();
  const startupLocale = useRef(locale);

  const effectiveTheme = resolveTheme(theme, systemUsesDark);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = (event: MediaQueryListEvent) => setSystemUsesDark(event.matches);
    media.addEventListener('change', updateSystemTheme);
    return () => media.removeEventListener('change', updateSystemTheme);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = localeDirection(locale);
    root.dataset.theme = effectiveTheme;
    root.dataset.themePreference = theme;
    root.style.colorScheme = effectiveTheme;
    window.localStorage.setItem(preferenceKeys.locale, locale);
    window.localStorage.setItem(preferenceKeys.theme, theme);
  }, [effectiveTheme, locale, theme]);

  useEffect(() => {
    window.localStorage.setItem(preferenceKeys.sidebarCollapsed, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(preferenceKeys.sidebarWidth, String(Math.round(sidebarWidth)));
  }, [sidebarWidth]);

  useEffect(() => {
    let active = true;
    void window.maxApi.system
      .getHealth()
      .then((health) => {
        if (active) {
          setRuntimePlatform(health.runtime.platform);
          setEngineStatus('ready');
        }
      })
      .catch(() => {
        if (active) {
          setEngineStatus('unavailable');
          setEngineNoticeVisible(true);
        }
      });

    void window.maxApi.shop
      .getMetadata()
      .then(async (data) => {
        if (active) {
          setOnboardingCompleted(data.onboardingCompleted);
          setShopName(data.shopName);
          if (data.locale) {
            setLocale((current) => (data.locale !== current ? data.locale : current));
          }
        }
        if (data.onboardingCompleted) {
          const migration = await window.maxApi.workspace.migrateV01();
          if (!migration.ok) throw new Error(migration.error.message);
          const [pages, persistedHome, navigation] = await Promise.all([
            loadPersistentCustomPages(),
            loadPersistentHomePage(data.locale ?? startupLocale.current),
            window.maxApi.workspace.getNavigation(),
          ]);
          if (active) {
            setCustomPages(pages);
            setHomePage(persistedHome);
            setWorkspaceNavigation(navigation);
          }
        }
      })
      .catch(() => {
        if (active) {
          setOnboardingCompleted(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 's') {
        event.preventDefault();
        setQuickEntryOpen(true);
      } else if (event.key === '/' && !isEditingTarget(event.target)) {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  function navigate(nextPage: AppPage) {
    setPage(nextPage);
    setOpenRecordId(undefined);
    setRequestedSavedViewId(undefined);
    setCommandOpen(false);
    setObjectCreateRequest(0);
  }

  const handleAddCustomPage = useCallback(async () => {
    const newPage = await createPersistentCustomPage(locale === 'ar' ? 'بدون عنوان' : 'Untitled', 'lucide:FileText', customPages.length);
    if (!newPage) return;
    setCustomPages((pages) => [...pages, newPage]);
    navigate(newPage.id);
  }, [customPages.length, locale]);

  async function handleDuplicateCustomPage(id: string) {
    const source = customPages.find((candidate) => candidate.id === id);
    if (!source) return;
    const sourceTitle = source.title.trim() || translate(locale, 'untitledPage');
    const copyTitle = locale === 'ar' ? `نسخة من ${sourceTitle}` : `${sourceTitle} copy`;
    const copy = await createPersistentCustomPage(copyTitle, source.icon, customPages.length);
    if (!copy) return;
    const hydratedCopy = {
      ...copy,
      blocks: source.blocks.map((block) => ({ ...block, id: `block_${crypto.randomUUID()}` })),
      favorite: false,
      wiki: source.wiki,
    };
    await updatePersistentCustomPage(hydratedCopy, customPages.length);
    setCustomPages((pages) => [...pages, hydratedCopy]);
    navigate(copy.id);
  }

  function handleUpdateCustomPage(id: string, update: Partial<Omit<CustomPage, 'createdAt' | 'id'>>) {
    setCustomPages((pages) => pages.map((candidate, position) => {
      if (candidate.id !== id) return candidate;
      const updated = { ...candidate, ...update, updatedAt: new Date().toISOString() };
      void updatePersistentCustomPage(updated, position);
      return updated;
    }));
  }

  function handleDeleteCustomPage(id: string) {
    const target = customPages.find((candidate) => candidate.id === id);
    if (target) void archivePersistentCustomPage(target);
    setCustomPages((pages) => pages.filter((candidate) => candidate.id !== id));
    if (page === id) {
      navigate('home');
    }
  }

  function handleUpdateHomePage(_id: string, update: Partial<Omit<CustomPage, 'createdAt' | 'id'>>) {
    const updated = {
      ...homePage,
      ...update,
    };
    setHomePage(updated);
    saveHomePage(updated);
  }

  async function handleCompleteOnboarding(
    nextShopName: string,
    nextLocale: Locale,
    backupSchedule: BackupSchedule,
    blueprint?: Blueprint,
    includeDemoData?: boolean,
  ) {
    const res = await window.maxApi.shop.completeOnboarding({
      backupSchedule,
      blueprint,
      includeDemoData,
      locale: nextLocale,
      shopName: nextShopName,
    });
    if (res.ok) {
      setShopName(res.value.shopName);
      setLocale(res.value.locale);
      setHomePage(loadHomePage(res.value.locale));
      setOnboardingCompleted(true);
      const migration = await window.maxApi.workspace.migrateV01();
      if (migration.ok) {
        const [pages, persistedHome, navigation] = await Promise.all([
          loadPersistentCustomPages(),
          loadPersistentHomePage(res.value.locale),
          window.maxApi.workspace.getNavigation(),
        ]);
        setCustomPages(pages);
        setHomePage(persistedHome);
        setWorkspaceNavigation(navigation);
      }
    }
  }

  const commands = useMemo<readonly Command[]>(() => {
    const defaultDests = ['home', 'databases', 'items', 'people', 'transactions', 'accounts', 'reconciliation'];
    const navigationCommands = defaultDests.map((destination) => {
      const pLabel = pageLabels[destination] ? translate(locale, pageLabels[destination]) : destination;
      return {
        id: `navigate-${destination}`,
        keywords: [destination, pLabel, 'navigate', 'انتقل'],
        label: locale === 'ar' ? `انتقل إلى ${pLabel}` : `Go to ${pLabel}`,
        run: () => navigate(destination),
      };
    });

    const customPageCommands = customPages.map((cp) => {
      const iconPrefix = cp.icon && !cp.icon.startsWith('lucide:') ? `${cp.icon} ` : '';
      return {
        id: `navigate-${cp.id}`,
        keywords: [cp.title, 'page', 'صفحة'],
        label: `${iconPrefix}${cp.title || translate(locale, 'untitledPage')}`,
        run: () => navigate(cp.id),
      };
    });

    return [
      ...navigationCommands,
      ...customPageCommands,
      {
        id: 'add-page',
        keywords: ['add', 'page', 'new', 'صفحة', 'جديدة', 'إضافة'],
        label: translate(locale, 'addPage'),
        run: () => void handleAddCustomPage(),
      },
      {
        id: 'open-settings',
        keywords: ['preferences', 'appearance', 'theme', 'language', 'إعدادات', 'مظهر'],
        label: translate(locale, 'openSettings'),
        run: () => navigate('settings'),
      },
      {
        id: 'quick-sale-entry',
        keywords: ['quick', 'sale', 'fast', 'بيع', 'سريع', 'تسجيل'],
        label: locale === 'ar' ? 'تسجيل بيع سريع (Ctrl+S)' : 'Quick Sale Entry (Ctrl+S)',
        run: () => setQuickEntryOpen(true),
      },
      {
        id: 'export-blueprint',
        keywords: ['blueprint', 'export', 'schema', 'تصدير', 'مخطط'],
        label: translate(locale, 'exportBlueprint'),
        run: () => setBlueprintModalTab('export'),
      },
      {
        id: 'import-blueprint',
        keywords: ['blueprint', 'import', 'schema', 'استيراد', 'مخطط'],
        label: translate(locale, 'importBlueprint'),
        run: () => setBlueprintModalTab('import'),
      },
      {
        id: 'switch-language',
        keywords: ['arabic', 'english', 'العربية', 'الإنجليزية'],
        label: locale === 'en' ? 'التبديل إلى العربية' : 'Switch to English',
        run: () => setLocale(locale === 'en' ? 'ar' : 'en'),
      },
      ...(['system', 'light', 'dark'] as ThemePreference[]).map((nextTheme) => ({
        id: `theme-${nextTheme}`,
        keywords: ['theme', 'appearance', 'سمة', 'مظهر', nextTheme],
        label: `${translate(locale, 'theme')}: ${translate(locale, nextTheme)}`,
        run: () => setTheme(nextTheme),
      })),
    ];
  }, [customPages, handleAddCustomPage, locale]);

  if (onboardingCompleted === false) {
    return <Suspense fallback={null}><Onboarding initialLocale={locale} onComplete={handleCompleteOnboarding} /></Suspense>;
  }

  if (onboardingPreview) {
    return <Suspense fallback={null}><Onboarding initialLocale={locale} onClose={() => setOnboardingPreview(false)} onComplete={() => { setOnboardingPreview(false); return Promise.resolve(); }} preview /></Suspense>;
  }

  const isCustomPage = customPages.some((candidate) => candidate.id === page);
  const activeCustomPage = isCustomPage ? customPages.find((p) => p.id === page) : undefined;
  const activeWorkspaceDatabase = workspaceNavigation.databases.find((database) => database.id === page);

  const pageLabel = page === 'home'
    ? homePage.title.trim() || translate(locale, 'home')
    : isCustomPage
      ? activeCustomPage?.title || translate(locale, 'untitledPage')
      : activeWorkspaceDatabase
        ? activeWorkspaceDatabase.title
      : page in pageLabels && pageLabels[page]
        ? translate(locale, pageLabels[page])
        : page;

  const PageIcon: LucideIcon = (!isCustomPage && page in pageIcons && pageIcons[page]) ? pageIcons[page] : FileText;
  const showPageHeader = !isCustomPage && !['databases', 'home', 'settings'].includes(page);

  function navigateSettingsSection(section: SettingsSectionId) {
    setSettingsSection(section);
    const revealSection = () => {
      const target = document.getElementById(section);
      target?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
      target?.focus({ preventScroll: true });
      return Boolean(target);
    };
    if (!revealSection()) window.setTimeout(revealSection, 0);
  }

  return (
    <div className="app-shell" data-app-ready={engineStatus === 'ready' ? 'true' : undefined}>
      <a className="skip-link" href="#main-content">
        {locale === 'ar' ? 'انتقل إلى المحتوى' : 'Skip to content'}
      </a>
      <Sidebar
        collapsed={sidebarCollapsed}
        customPages={customPages}
        databases={workspaceNavigation.databases}
        homePage={homePage}
        locale={locale}
        onAddCustomPage={() => void handleAddCustomPage()}
        onCollapse={() => setSidebarCollapsed((collapsed) => !collapsed)}
        onDeletePage={handleDeleteCustomPage}
        onDuplicatePage={(id) => void handleDuplicateCustomPage(id)}
        onNavigate={navigate}
        onOpenSettings={() => navigate('settings')}
        onRenamePage={(id, title) => handleUpdateCustomPage(id, { title })}
        onResize={setSidebarWidth}
        onSettingsSectionChange={navigateSettingsSection}
        onToggleFavorite={(id, favorite) => handleUpdateCustomPage(id, { favorite })}
        onReorderPages={(reordered) => {
          const newHome = reordered.find((p) => p.id === 'home');
          if (newHome) {
            setHomePage(newHome);
            saveHomePage(newHome);
          }
          const otherPages = reordered.filter((p) => p.id !== 'home');
          setCustomPages(otherPages);
          otherPages.forEach((candidate, position) => void updatePersistentCustomPage(candidate, position));
        }}
        page={page}
        settingsSection={settingsSection}
        width={sidebarWidth}
      />

      <div className="app-frame">
        <header className="topbar">
          <div className="topbar__title">
            <bdi>{shopName || translate(locale, 'workspace')}</bdi>
            <span aria-hidden="true">/</span>
            <bdi><strong>{pageLabel}</strong></bdi>
          </div>
          <div className="topbar__actions">
            <button className="command-trigger" onClick={() => setSearchOpen(true)} type="button">
              <Search aria-hidden="true" size={17} />
              <span>{locale === 'ar' ? 'ابحث في البيانات' : 'Search data'}</span>
              <kbd>{runtimePlatform === 'macos' ? '⌘' : 'Ctrl'} F</kbd>
            </button>
            <Button
              icon={<Workflow aria-hidden="true" size={16} />}
              onClick={() => setWorkflowOpen(true)}
              variant="ghost"
            >
              {locale === 'ar' ? 'سير العمل' : 'Workflows'}
            </Button>
            <Button
              className="quick-entry-trigger"
              icon={<Zap aria-hidden="true" size={16} />}
              onClick={() => setQuickEntryOpen(true)}
              variant="ghost"
            >
              {locale === 'ar' ? 'عملية سريعة' : 'Quick action'}
            </Button>
          </div>
        </header>

        <main aria-label={showPageHeader ? undefined : pageLabel} aria-labelledby={showPageHeader ? 'page-title' : undefined} className="content" data-custom-page={isCustomPage} data-page={page} id="main-content" tabIndex={-1}>
          {showPageHeader && <header className="page-header">
            <div className="page-header__icon" aria-hidden="true">
              <PageIcon size={28} strokeWidth={1.7} />
            </div>
            <div className="page-header__copy">
              <h1 id="page-title">{pageLabel}</h1>
              {page in pageSubtitles && pageSubtitles[page] && (
                <p>{translate(locale, pageSubtitles[page])}</p>
              )}
            </div>
          </header>}

          <Suspense fallback={<div aria-live="polite" className="page-loading" role="status">{locale === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}</div>}>
          {page === 'home' ? (
            <CustomPageView
              isHome
              locale={locale}
              onUpdatePage={handleUpdateHomePage}
              page={homePage}
            />
          ) : isCustomPage && activeCustomPage ? (
            <CustomPageView
              key={activeCustomPage.id}
              locale={locale}
              onUpdatePage={handleUpdateCustomPage}
              page={activeCustomPage}
            />
          ) : page === 'databases' ? (
            <DatabasesWorkspace key="databases" locale={locale} />
          ) : activeWorkspaceDatabase ? (
            <DatabasePage databaseId={activeWorkspaceDatabase.id} locale={locale} onOpenRecordId={openRecordId} />
          ) : page === 'settings' ? (
            <SettingsPage
              key="settings"
              locale={locale}
              onBackToApp={() => navigate('home')}
              onChangeLocale={setLocale}
              onChangeTheme={setTheme}
              onDemoDataSeeded={() => {
                setDataRevision((revision) => revision + 1);
                void loadPersistentCustomPages().then(setCustomPages);
                setHomePage(loadHomePage(locale));
                void window.maxApi.shop.getMetadata().then((metadata) => setShopName(metadata.shopName));
              }}
              onResetAppearance={() => setTheme('system')}
              onSectionChange={setSettingsSection}
              onShowOnboarding={() => setOnboardingPreview(true)}
              onWorkspaceDeleted={() => {
                setCustomPages([]);
                setHomePage(loadHomePage(locale));
                setShopName('');
                setOnboardingCompleted(false);
              }}
              theme={theme}
            />
          ) : page === 'items' || page === 'people' ? (
            <ObjectWorkspace
              createRequest={objectCreateRequest}
              key={page}
              locale={locale}
              objectKind={page === 'items' ? 'item' : 'person'}
              selectedViewId={requestedSavedViewId}
            />
          ) : page === 'accounts' ? (
            <AccountsWorkspace
              createRequest={objectCreateRequest}
              key="accounts"
              locale={locale}
              refreshRequest={dataRevision}
            />
          ) : page === 'transactions' ? (
            <TransactionsWorkspace
              createRequest={objectCreateRequest}
              key="transactions"
              locale={locale}
              refreshRequest={dataRevision}
            />
          ) : page === 'reconciliation' ? (
            <ReconciliationWorkspace key="reconciliation" locale={locale} />
          ) : (
            <EmptyPage
              locale={locale}
              onCreate={() => setObjectCreateRequest((r) => r + 1)}
              onNavigate={navigate}
              onOpenCommand={() => setCommandOpen(true)}
              page={page as 'accounts' | 'home' | 'items' | 'people' | 'reconciliation' | 'transactions'}
            />
          )}
          </Suspense>
        </main>
      </div>

      <Suspense fallback={null}>
      {commandOpen && <CommandMenu commands={commands} locale={locale} onClose={() => setCommandOpen(false)} />}
      {searchOpen && (
        <UniversalSearchDialog
          locale={locale}
          onClose={() => setSearchOpen(false)}
          onSelect={(res) => {
            if (res.kind === 'item') navigate('items');
            else if (res.kind === 'person') navigate('people');
            else if (res.kind === 'account') navigate('accounts');
            else if (res.kind === 'transaction') navigate('transactions');
            else if (res.kind === 'page') navigate(res.id);
            else if (res.kind === 'database') navigate(res.id);
            else if (res.kind === 'record' && res.databaseId) {
              setPage(res.databaseId);
              setOpenRecordId(res.id);
            } else if (res.kind === 'view' && 'databaseId' in res && typeof res.databaseId === 'string') {
              navigate(res.databaseId);
            }
          }}
        />
      )}
      {blueprintModalTab && (
        <BlueprintDialog
          initialTab={blueprintModalTab}
          locale={locale}
          onClose={() => setBlueprintModalTab(undefined)}
          onImportSuccess={() => {
            void window.maxApi.shop.getMetadata().then((d) => setShopName(d.shopName));
          }}
        />
      )}
      {quickEntryOpen && (
        <QuickEntryDialog
          locale={locale}
          onClose={() => setQuickEntryOpen(false)}
          onSuccess={(tx) => {
            setRecentTxForUndo(tx);
            if (page === 'transactions' || page === 'accounts') {
              setDataRevision((revision) => revision + 1);
            }
          }}
        />
      )}
      {workflowOpen && <WorkflowLauncherDialog locale={locale} onClose={() => setWorkflowOpen(false)} />}
      </Suspense>
      {recentTxForUndo && (
        <UndoToast
          locale={locale}
          onDismiss={() => setRecentTxForUndo(undefined)}
          onUndo={async (id) => {
            await window.maxApi.transactions.undo(id);
            if (page === 'transactions' || page === 'accounts') {
              setDataRevision((revision) => revision + 1);
            }
          }}
          transaction={recentTxForUndo}
        />
      )}
      {engineNoticeVisible && (
        <div className="toast" role="alert">
          <span>{translate(locale, 'engineIssue')}</span>
          <button aria-label={translate(locale, 'close')} onClick={() => setEngineNoticeVisible(false)} type="button">
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
