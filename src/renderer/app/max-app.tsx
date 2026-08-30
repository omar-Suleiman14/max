import {
  CircleDollarSign,
  Command as CommandIcon,
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
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { BackupSchedule, Blueprint } from '../../shared/blueprint-contract';
import type { TransactionRecord } from '../../shared/transaction-contract';
import { BlueprintDialog } from '../blueprints/blueprint-dialog';
import { DatabasesWorkspace } from '../databases/databases-workspace';
import { Onboarding } from '../onboarding/onboarding';
import { CustomPageView } from '../pages/custom-page-view';
import {
  createCustomPage,
  deleteCustomPage,
  loadCustomPages,
  loadHomePage,
  saveCustomPages,
  saveHomePage,
  updateCustomPage,
} from '../pages/pages-store';
import type { AppPage, CustomPage, EngineStatus } from './app-types';
import { localeDirection, type Locale, type TranslationKey, translate } from './i18n';
import {
  preferenceKeys,
  readLocale,
  readSidebarCollapsed,
  readTheme,
  resolveTheme,
  type ThemePreference,
} from './preferences';
import { Button } from '../ui/button';
import { CommandMenu, type Command } from '../ui/command-menu';
import { EmptyPage } from '../ui/empty-page';
import { SettingsPage } from '../ui/settings-page';
import { Sidebar } from '../ui/sidebar';
import { AccountsWorkspace } from '../accounts/accounts-workspace';
import { ReconciliationWorkspace } from '../reconciliation/reconciliation-workspace';
import { UniversalSearchDialog } from '../search/universal-search-dialog';
import { QuickEntryDialog } from '../quick-entry/quick-entry-dialog';
import { UndoToast } from '../ui/undo-toast';
import { TransactionsWorkspace } from '../transactions/transactions-workspace';
import { ObjectWorkspace } from '../objects/object-workspace';

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
  const [page, setPage] = useState<AppPage>('home');
  const [customPages, setCustomPages] = useState<readonly CustomPage[]>(() => loadCustomPages());
  const [homePage, setHomePage] = useState<CustomPage>(() => loadHomePage());
  const [commandOpen, setCommandOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [blueprintModalTab, setBlueprintModalTab] = useState<'export' | 'import'>();
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [recentTxForUndo, setRecentTxForUndo] = useState<TransactionRecord>();
  const [objectCreateRequest, setObjectCreateRequest] = useState(0);
  const [requestedSavedViewId, setRequestedSavedViewId] = useState<string>();
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('checking');
  const [runtimePlatform, setRuntimePlatform] = useState<'linux' | 'macos' | 'windows'>();
  const [engineNoticeVisible, setEngineNoticeVisible] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [shopName, setShopName] = useState('');

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
      .then((data) => {
        if (active) {
          setOnboardingCompleted(data.onboardingCompleted);
          setShopName(data.shopName);
          if (data.locale) {
            setLocale((current) => (data.locale !== current ? data.locale : current));
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
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        setBlueprintModalTab(undefined);
        setCommandOpen(true);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'e') {
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
    setRequestedSavedViewId(undefined);
    setCommandOpen(false);
    setObjectCreateRequest(0);
  }

  const handleAddCustomPage = useCallback(() => {
    const newPage = createCustomPage('', 'lucide:FileText');
    setCustomPages(loadCustomPages());
    navigate(newPage.id);
  }, []);

  function handleUpdateCustomPage(id: string, update: Partial<Omit<CustomPage, 'createdAt' | 'id'>>) {
    updateCustomPage(id, update);
    setCustomPages(loadCustomPages());
  }

  function handleDeleteCustomPage(id: string) {
    deleteCustomPage(id);
    setCustomPages(loadCustomPages());
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
  ) {
    const res = await window.maxApi.shop.completeOnboarding({
      backupSchedule,
      blueprint,
      locale: nextLocale,
      shopName: nextShopName,
    });
    if (res.ok) {
      setShopName(res.value.shopName);
      setLocale(res.value.locale);
      setOnboardingCompleted(true);
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
        run: handleAddCustomPage,
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
        label: locale === 'ar' ? 'تسجيل بيع سريع (Ctrl+E)' : 'Quick Sale Entry (Ctrl+E)',
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
    return <Onboarding initialLocale={locale} onComplete={handleCompleteOnboarding} />;
  }

  const isCustomPage = page.startsWith('page_');
  const activeCustomPage = isCustomPage ? customPages.find((p) => p.id === page) : undefined;

  const pageLabel = page === 'home'
    ? homePage.title.trim() || translate(locale, 'home')
    : isCustomPage
      ? activeCustomPage?.title || translate(locale, 'untitledPage')
      : page in pageLabels && pageLabels[page]
        ? translate(locale, pageLabels[page])
        : page;

  const PageIcon: LucideIcon = (!isCustomPage && page in pageIcons && pageIcons[page]) ? pageIcons[page] : FileText;

  return (
    <div className="app-shell" data-app-ready={engineStatus === 'ready' ? 'true' : undefined}>
      <a className="skip-link" href="#main-content">
        {locale === 'ar' ? 'انتقل إلى المحتوى' : 'Skip to content'}
      </a>
      <Sidebar
        collapsed={sidebarCollapsed}
        customPages={customPages}
        homePage={homePage}
        locale={locale}
        onAddCustomPage={handleAddCustomPage}
        onChangeLocale={() => setLocale(locale === 'en' ? 'ar' : 'en')}
        onCollapse={() => setSidebarCollapsed((collapsed) => !collapsed)}
        onNavigate={navigate}
        onOpenSettings={() => navigate('settings')}
        onReorderPages={(reordered) => {
          const newHome = reordered.find((p) => p.id === 'home');
          if (newHome) {
            setHomePage(newHome);
            saveHomePage(newHome);
          }
          const otherPages = reordered.filter((p) => p.id !== 'home');
          setCustomPages(otherPages);
          saveCustomPages(otherPages);
        }}
        page={page}
      />

      <div className="app-frame">
        <header className="topbar">
          <div className="topbar__title">
            <bdi>{shopName || translate(locale, 'workspace')}</bdi>
            <span aria-hidden="true">/</span>
            <bdi><strong>{pageLabel}</strong></bdi>
          </div>
          <div className="topbar__actions">
            <button className="command-trigger" onClick={() => setCommandOpen(true)} type="button">
              <Search aria-hidden="true" size={17} />
              <span>{translate(locale, 'commandSearch')}</span>
              <kbd>{runtimePlatform === 'macos' ? <CommandIcon aria-hidden="true" size={12} /> : 'Ctrl'} K</kbd>
            </button>
            <Button
              className="quick-entry-trigger"
              icon={<Zap aria-hidden="true" size={16} />}
              onClick={() => setQuickEntryOpen(true)}
              variant="ghost"
            >
              {locale === 'ar' ? 'بيع سريع' : 'Quick sale'}
            </Button>
          </div>
        </header>

        <main aria-labelledby="page-title" className="content" data-page={page} id="main-content" tabIndex={-1}>
          <header className="page-header">
            <div className="page-header__icon" aria-hidden="true">
              <PageIcon size={28} strokeWidth={1.7} />
            </div>
            <div className="page-header__copy">
              <h1 id="page-title">{pageLabel}</h1>
              {page in pageSubtitles && pageSubtitles[page] && (
                <p>{translate(locale, pageSubtitles[page])}</p>
              )}
            </div>
          </header>

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
              onDeletePage={handleDeleteCustomPage}
              onUpdatePage={handleUpdateCustomPage}
              page={activeCustomPage}
            />
          ) : page === 'databases' ? (
            <DatabasesWorkspace key="databases" locale={locale} />
          ) : page === 'settings' ? (
            <SettingsPage
              key="settings"
              locale={locale}
              onBackToApp={() => navigate('home')}
              onChangeLocale={setLocale}
              onChangeTheme={setTheme}
              onResetAppearance={() => setTheme('system')}
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
            />
          ) : page === 'transactions' ? (
            <TransactionsWorkspace
              createRequest={objectCreateRequest}
              key="transactions"
              locale={locale}
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
        </main>
      </div>

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
              setObjectCreateRequest((r) => r + 1);
            }
          }}
        />
      )}
      {recentTxForUndo && (
        <UndoToast
          locale={locale}
          onDismiss={() => setRecentTxForUndo(undefined)}
          onUndo={async (id) => {
            await window.maxApi.transactions.undo(id);
            if (page === 'transactions' || page === 'accounts') {
              setObjectCreateRequest((r) => r + 1);
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
