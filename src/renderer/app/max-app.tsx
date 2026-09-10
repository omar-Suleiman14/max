import { UpdateNotice } from '../ui/update-notice';
import { useWorkspaceDisplay } from '../pages/workspace-display-preferences';
import { useAppearance } from './appearance';
import { NavigationHistory } from '../pages/navigation-history';
import { readSessionValue, usePagePosition } from './page-session';
import { LegacyDatabaseLink } from '../databases/LegacyDatabaseLink';
import { ScrollOutline } from '../ui/scroll-outline';
import { TERMS_VERSION } from '../../shared/terms';
import {
  Waypoints,
  CircleDollarSign,
  ContactRound,
  Database,
  FileText,
  Package,
  ReceiptText,
  Scale,
  Search,
  Settings,
  X,
  PlusCircle,

  type LucideIcon,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { BackupSchedule } from '../../shared/blueprint-contract';
import type { WorkspaceTemplateV2 as Blueprint } from '../../shared/template-v2-contract';
import type { WorkspaceNavigation } from '../../shared/workspace-contract';
import { CustomPageView } from '../pages/custom-page-view';
import {
  createPersistentCustomPage,
  loadPersistentCustomPages,
  updatePersistentCustomPage,
} from '../pages/pages-store';
import { EMPTY_WORKSPACE_PAGE, type AppPage, type CustomPage, type EngineStatus, type SettingsSectionId } from './app-types';
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
import type { Command } from '../ui/command-menu';
import { quickActionModifier, readQuickActionsEnabled } from '../workflows/quick-actions-preferences';
import { EmptyPage } from '../ui/empty-page';
import { Sidebar } from '../ui/sidebar';

const WorkspaceGraph = lazy(() => import('../pages/workspace-graph').then(module => ({ default: module.WorkspaceGraph })));
const SettingsPage = lazy(() => import('../ui/settings-page').then(module => ({ default: module.SettingsPage })));
const BlueprintDialog = lazy(() => import('../blueprints/blueprint-dialog').then((module) => ({ default: module.BlueprintDialog })));
const CommandMenu = lazy(() => import('../ui/command-menu').then((module) => ({ default: module.CommandMenu })));
const DatabasePage = lazy(() => import('../databases/DatabasePage').then((module) => ({ default: module.DatabasePage })));
const DatabasesWorkspace = lazy(() => import('../databases/databases-workspace').then((module) => ({ default: module.DatabasesWorkspace })));
const Onboarding = lazy(() => import('../onboarding/onboarding').then((module) => ({ default: module.Onboarding })));
const WorkflowLauncherDialog = lazy(() => import('../workflows/workflow-launcher-dialog').then((module) => ({ default: module.WorkflowLauncherDialog })));
const UniversalSearchDialog = lazy(() => import('../search/universal-search-dialog').then((module) => ({ default: module.UniversalSearchDialog })));

const pageLabels: Record<string, TranslationKey> = {
  accounts: 'account',
  databases: 'databases',

  items: 'item',
  people: 'person',
  reconciliation: 'reconciliation',
  settings: 'settings',
  transactions: 'transaction',
};

const pageIcons: Record<string, LucideIcon> = {
  accounts: CircleDollarSign,
  databases: Database,

  items: Package,
  people: ContactRound,
  reconciliation: Scale,
  settings: Settings,
  transactions: ReceiptText,
};

const pageSubtitles: Record<string, TranslationKey> = {
  accounts: 'pageSubtitleAccounts',
  databases: 'pageSubtitleDatabases',

  items: 'pageSubtitleItems',
  people: 'pageSubtitlePeople',
  reconciliation: 'pageSubtitleReconciliation',
  settings: 'pageSubtitleSettings',
  transactions: 'pageSubtitleTransactions',
};

/** Return the ID of the first workspace page or database, sorted by position key. */
function firstWorkspacePageId(
  customPages: readonly { id: string; positionKey?: string }[],
  workspacePages: readonly { id: string; positionKey: string }[],
  databases: readonly { id: string; positionKey: string }[],
): string {
  const all = [
    ...customPages.map((p) => ({ id: p.id, key: p.positionKey ?? p.id })),
    ...workspacePages.map((p) => ({ id: p.id, key: p.positionKey })),
    ...databases.map((d) => ({ id: d.id, key: d.positionKey })),
  ].sort((a, b) => a.key.localeCompare(b.key));
  return all[0]?.id ?? EMPTY_WORKSPACE_PAGE;
}

function isEditingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export function MaxApp() {
  useAppearance();
  const [locale, setLocale] = useState<Locale>(() => readLocale(window.localStorage));
  const [theme, setTheme] = useState<ThemePreference>(() => readTheme(window.localStorage));
  const [systemUsesDark, setSystemUsesDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsed(window.localStorage));
  const [sidebarWidth, setSidebarWidth] = useState(() => readSidebarWidth(window.localStorage));
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>('settings-general');
  const [page, setPage] = useState<AppPage>(() => {
    // Sessions stored before the home page was removed still point at it.
    const restored = readSessionValue('page', '');
    return restored === 'home' ? '' : restored;
  });
  const previousPage = useRef<AppPage>(page === 'settings' ? '' : page);
  usePagePosition(page);
  useEffect(() => { if (page !== 'settings') previousPage.current = page; }, [page]);
  const [customPages, setCustomPages] = useState<readonly CustomPage[]>([]);
  const [workspaceNavigation, setWorkspaceNavigation] = useState<WorkspaceNavigation>({ databases: [], pages: [] });
  const [commandOpen, setCommandOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [blueprintModalTab, setBlueprintModalTab] = useState<'export' | 'import'>();
  const [graphEnabled] = useWorkspaceDisplay('graph');
  useEffect(() => { if (!graphEnabled || page === 'settings') setGraphOpen(false); }, [graphEnabled, page]);
  const [graphOpen, setGraphOpen] = useState(() => readSessionValue('graph-open', 'false') === 'true');
  useEffect(() => { localStorage.setItem('max:session:graph-open', String(graphOpen)); }, [graphOpen]);
  const [quickActionOpen, setQuickActionOpen] = useState<number | null>(null);
  const [quickActionsEnabled, setQuickActionsEnabled] = useState(readQuickActionsEnabled);
  const [requestedSavedViewId, setRequestedSavedViewId] = useState<string>();
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('checking');
  const [runtimePlatform, setRuntimePlatform] = useState<'linux' | 'macos' | 'windows'>();
  const [engineNoticeVisible, setEngineNoticeVisible] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [shopName, setShopName] = useState('');
  const [onboardingPreview, setOnboardingPreview] = useState(false);
  const [openRecordId, setOpenRecordId] = useState<string>();

  const effectiveTheme = resolveTheme(theme, systemUsesDark);

  const navigateSettingsSection = useCallback((section: SettingsSectionId) => {
    if (page !== 'settings') previousPage.current = page;
    setGraphOpen(false);
    setPage('settings');
    setSettingsSection(section);
    const revealSection = () => {
      const target = document.getElementById(section);
      const heading = target?.previousElementSibling;
      const anchor = heading?.matches('.apple-settings-group-title') ? heading : target;
      const scroller = document.getElementById('main-content');
      if (anchor && scroller) {
        scroller.scrollTo({
          top: Math.max(0, scroller.scrollTop + anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24),
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
      }
      target?.focus({ preventScroll: true });
      return Boolean(target);
    };
    if (!revealSection()) window.setTimeout(revealSection, 0);
  }, [page]);

  useEffect(() => {
    const updateQuickActions = () => setQuickActionsEnabled(readQuickActionsEnabled());
    window.addEventListener('max:quick-actions-preference-changed', updateQuickActions);
    return () => window.removeEventListener('max:quick-actions-preference-changed', updateQuickActions);
  }, []);

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
          const migration = await window.maxApi.workspace.migrateV01(data.locale);
          if (!migration.ok) throw new Error(migration.error.message);
          const [pages, navigation] = await Promise.all([
            loadPersistentCustomPages(),
            window.maxApi.workspace.getNavigation(),
          ]);
          if (active) {
            setCustomPages(pages);
            setWorkspaceNavigation(navigation);
            setPage((current) => current === 'settings'
              || current in pageLabels
              || pages.some((item) => item.id === current)
              || navigation.pages.some((item) => item.id === current)
              || navigation.databases.some((item) => item.id === current || item.legacyAlias === current)
              ? current
              : firstWorkspacePageId(pages, navigation.pages, navigation.databases));
          }
        }
      })
      .catch(() => {
        if (active) {
          setOnboardingCompleted(true);
          setPage((current) => current || EMPTY_WORKSPACE_PAGE);
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
        if (document.querySelector('[data-page="settings"]')) {
          document.getElementById('settings-search-input')?.focus();
        } else {
          setSearchOpen(true);
        }
      } else if (quickActionsEnabled && (event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 's') {
        event.preventDefault();
        setQuickActionOpen((prev) => prev === null ? 0 : null);
      } else if (graphEnabled && page !== 'settings' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') {
        event.preventDefault(); setGraphOpen(value => !value);
      } else if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault();
        navigateSettingsSection('settings-general');
      } else if (event.key === '/' && !isEditingTarget(event.target)) {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [quickActionsEnabled, graphEnabled, navigateSettingsSection, page]);

  function navigate(nextPage: AppPage) {
    setGraphOpen(false);
    setPage(nextPage);
    setOpenRecordId(undefined);
    setRequestedSavedViewId(undefined);
    setCommandOpen(false);
  }

  useEffect(() => {
    const open = (event: Event) => { const id = (event as CustomEvent<unknown>).detail; if (typeof id === 'string') { setGraphOpen(false); setPage(id); setOpenRecordId(undefined); setRequestedSavedViewId(undefined); setCommandOpen(false); } };
    window.addEventListener('max:open-page', open); return () => window.removeEventListener('max:open-page', open);
  }, []);

  function navigateDatabaseView(databaseId: string, viewId: string) {
    setGraphOpen(false);
    setPage(databaseId);
    setOpenRecordId(undefined);
    setRequestedSavedViewId(viewId);
    setCommandOpen(false);
  }

  const refreshWorkspaceNavigation = useCallback(() => {
    void window.maxApi.workspace.getNavigation().then(setWorkspaceNavigation);
  }, []);
  useEffect(() => {
    const restorePages = () => { void Promise.all([window.maxApi.workspace.getNavigation(), loadPersistentCustomPages()]).then(([navigation, pages]) => { setWorkspaceNavigation(navigation); setCustomPages(pages); }); };
    window.addEventListener('max:workspace-changed', refreshWorkspaceNavigation);
    window.addEventListener('max:pages-restored', restorePages);
    window.addEventListener('max:workspace-imported', restorePages);
    return () => { window.removeEventListener('max:workspace-changed', refreshWorkspaceNavigation); window.removeEventListener('max:pages-restored', restorePages); window.removeEventListener('max:workspace-imported', restorePages); };
  }, [refreshWorkspaceNavigation]);

  const handleAddCustomPage = useCallback(async () => {
    const newPage = await createPersistentCustomPage(locale === 'ar' ? 'بدون عنوان' : 'Untitled', 'lucide:FileText', customPages.length);
    if (!newPage) return;
    setCustomPages((pages) => [...pages, newPage]);
    navigate(newPage.id);
  }, [customPages.length, locale]);

  async function handleAddSubpage(parentId: string) {
    const siblingCount = customPages.filter((candidate) => candidate.parentNodeId === parentId).length;
    const newPage = await createPersistentCustomPage(
      locale === 'ar' ? 'بدون عنوان' : 'Untitled',
      'lucide:FileText',
      siblingCount,
      parentId,
    );
    if (!newPage) return;
    setCustomPages((pages) => [...pages, newPage]);
    navigate(newPage.id);
  }

  async function handleDuplicateCustomPage(id: string) {
    const source = customPages.find((candidate) => candidate.id === id);
    if (!source) return;
    const sourceTitle = source.title.trim() || translate(locale, 'untitledPage');
    const copyTitle = locale === 'ar' ? `نسخة من ${sourceTitle}` : `${sourceTitle} copy`;
    const copy = await createPersistentCustomPage(copyTitle, source.icon, customPages.length, source.parentNodeId);
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

  async function handleDeleteCustomPage(id: string) {
    try {
      const result = await window.maxApi.workspace.archiveNode(id);
      if (!result.ok) { alert(result.error.message); return; }
      if (page === id) navigate(firstWorkspacePageId(customPages.filter((p) => p.id !== id), workspaceNavigation.pages, workspaceNavigation.databases));
      setCustomPages((pages) => pages.filter((candidate) => candidate.id !== id));
      window.dispatchEvent(new Event('max:workspace-changed'));
      window.dispatchEvent(new Event('max:pages-restored'));
    } catch { alert(locale === 'ar' ? 'تعذر نقل العنصر إلى المهملات.' : 'Could not move this item to Trash.'); }
  }

  async function handleCompleteOnboarding(
    nextShopName: string,
    nextLocale: Locale,
    backupSchedule: BackupSchedule,
    blueprint?: Blueprint,
    includeDemoData?: boolean,
    templateId?: 'blank' | 'custom' | 'phone-shop',
  ) {
    const res = await window.maxApi.shop.completeOnboarding({
      acceptedTermsVersion: TERMS_VERSION,
      backupSchedule,
      blueprint,
      includeDemoData,
      locale: nextLocale,
      shopName: nextShopName,
      templateId,
    });
    if (!res.ok) throw new Error(res.error.message);
    if (res.ok) {
      setShopName(res.value.shopName);
      setLocale(res.value.locale);
      setOnboardingCompleted(true);
      const migration = await window.maxApi.workspace.migrateV01(res.value.locale);
      if (migration.ok) {
        const [pages, navigation] = await Promise.all([
          loadPersistentCustomPages(),
          window.maxApi.workspace.getNavigation(),
        ]);
        setCustomPages(pages);
        setWorkspaceNavigation(navigation);
        setPage(firstWorkspacePageId(pages, navigation.pages, navigation.databases));
        if (templateId === 'custom' && !blueprint) {
          setBlueprintModalTab('import');
        }
      }
    }
  }

  const commands = useMemo<readonly Command[]>(() => {
    const defaultDests = ['databases', 'items', 'people', 'transactions', 'accounts', 'reconciliation'];
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
        run: () => navigateSettingsSection('settings-general'),
      },
      {
        id: 'quick-operation',
        keywords: ['quick', 'sale', 'fast', 'بيع', 'سريع', 'تسجيل'],
        label: locale === 'ar' ? 'عملية سريعة (Ctrl+S)' : 'Quick Operation (Ctrl+S)',
        run: () => setQuickActionOpen(0),
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
  }, [customPages, handleAddCustomPage, locale, navigateSettingsSection]);

  if (onboardingCompleted === null) {
    return null;
  }

  if (onboardingCompleted === false) {
    return <Suspense fallback={null}><Onboarding initialLocale={locale} onComplete={handleCompleteOnboarding} /></Suspense>;
  }

  if (onboardingPreview) {
    return <Suspense fallback={null}><Onboarding initialLocale={locale} onClose={() => setOnboardingPreview(false)} onComplete={() => { setOnboardingPreview(false); return Promise.resolve(); }} preview /></Suspense>;
  }

  // The landing page is resolved from the workspace once navigation loads.
  if (!page) return null;

  const isCustomPage = customPages.some((candidate) => candidate.id === page);
  const activeCustomPage = customPages.find((p) => p.id === page);
  const activeWorkspaceDatabase = workspaceNavigation.databases.find((database) => database.id === page || database.legacyAlias === page);

  const pageLabel = isCustomPage
      ? activeCustomPage?.title || translate(locale, 'untitledPage')
      : activeWorkspaceDatabase
        ? activeWorkspaceDatabase.title
      : page in pageLabels && pageLabels[page]
        ? translate(locale, pageLabels[page])
      : page === EMPTY_WORKSPACE_PAGE
        ? translate(locale, 'workspace')
        : page;

  const PageIcon: LucideIcon = (!isCustomPage && page in pageIcons && pageIcons[page]) ? pageIcons[page] : FileText;
  const showPageHeader = !isCustomPage && !activeWorkspaceDatabase && !['databases', 'settings', EMPTY_WORKSPACE_PAGE].includes(page);

  return (
    <div className="app-shell" data-app-ready={engineStatus === 'ready' ? 'true' : undefined}>
      <a className="skip-link" href="#main-content">
        {locale === 'ar' ? 'انتقل إلى المحتوى' : 'Skip to content'}
      </a>
      <Sidebar
        collapsed={sidebarCollapsed}
        customPages={customPages}
        databases={workspaceNavigation.databases}
        locale={locale}
        onAddCustomPage={() => void handleAddCustomPage()}
        onAddSubpage={(parentId) => void handleAddSubpage(parentId)}
        onCollapse={() => setSidebarCollapsed((collapsed) => !collapsed)}
        onDeletePage={(id) => { void handleDeleteCustomPage(id); }}
        onDuplicatePage={(id) => void handleDuplicateCustomPage(id)}
        onExitSettings={() => navigate(previousPage.current || firstWorkspacePageId(customPages, workspaceNavigation.pages, workspaceNavigation.databases))}
        onNavigate={navigate}
        onNavigateView={navigateDatabaseView}
        onOpenSettings={() => navigateSettingsSection('settings-general')}
        onRenamePage={(id, title) => handleUpdateCustomPage(id, { title })}
        onResize={setSidebarWidth}
        onSettingsSectionChange={navigateSettingsSection}
        onToggleFavorite={(id, favorite) => handleUpdateCustomPage(id, { favorite })}
        onReorderNodes={(reorderedIds, movedId, parentNodeId) => {
          const updatedCustomPages = [...customPages];
          const updatedDatabases = [...workspaceNavigation.databases];
          reorderedIds.forEach((id, position) => {
            const positionKey = `p${String(position).padStart(8, '0')}`;
            const customIndex = updatedCustomPages.findIndex((p) => p.id === id);
            if (customIndex !== -1) {
              updatedCustomPages[customIndex] = { ...updatedCustomPages[customIndex], positionKey, ...(id === movedId ? { parentNodeId } : {}) } as typeof updatedCustomPages[0];
            } else {
              const dbIndex = updatedDatabases.findIndex((d) => d.id === id);
              if (dbIndex !== -1) {
                updatedDatabases[dbIndex] = { ...updatedDatabases[dbIndex], positionKey, ...(id === movedId ? { parentNodeId } : {}) } as typeof updatedDatabases[0];
              }
            }
            window.maxApi.workspace.updateNode(id, { positionKey, ...(id === movedId ? { parentNodeId } : {}) }).catch(() => undefined);
          });
          setCustomPages(updatedCustomPages);
          setWorkspaceNavigation({ ...workspaceNavigation, databases: updatedDatabases });
        }}
        page={page}
        settingsSection={settingsSection}
        runtimePlatform={runtimePlatform}
        width={sidebarWidth}
      />

      <div className="app-frame">
        <header className="topbar">
          <div className="topbar__title">
            <NavigationHistory page={page} onNavigate={navigate} locale={locale} />
            <bdi>{shopName || translate(locale, 'workspace')}</bdi>
            <span aria-hidden="true">/</span>
            <bdi><strong>{pageLabel}</strong></bdi>
          </div>
          <div className="topbar__actions">
            <UpdateNotice locale={locale} onOpen={() => navigateSettingsSection('settings-danger')} />
            {graphEnabled && page !== 'settings' && <button type="button" className="topbar-tool" aria-pressed={graphOpen} aria-keyshortcuts={`${runtimePlatform === 'macos' ? 'Meta' : 'Control'}+g`} onClick={() => setGraphOpen(value => !value)}><Waypoints size={17}/><span>{locale === 'ar' ? 'خريطة' : 'Graph'}</span><kbd>{quickActionModifier(runtimePlatform)} G</kbd></button>}
            {page !== 'settings' && (
              <button className="topbar-tool" aria-keyshortcuts={`${runtimePlatform === 'macos' ? 'Meta' : 'Control'}+f`} onClick={() => setSearchOpen(true)} type="button">
                <Search aria-hidden="true" size={17} />
                <span>{locale === 'ar' ? 'بحث' : 'Search'}</span>
                <kbd>{quickActionModifier(runtimePlatform)} F</kbd>
              </button>
            )}

            {quickActionsEnabled && <button className="topbar-tool topbar-tool--quick" aria-keyshortcuts={`${runtimePlatform === 'macos' ? 'Meta' : 'Control'}+s`} onClick={() => setQuickActionOpen(0)} type="button">
              <PlusCircle aria-hidden="true" size={16} />
              <span>{locale === 'ar' ? 'عملية سريعة' : 'Quick action'}</span>
              <kbd>{quickActionModifier(runtimePlatform)} S</kbd>
            </button>}
          </div>
        </header>

        <main style={{ position: 'relative' }} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.querySelector('.notion-editor-canvas')?.dispatchEvent(new Event('max:focus-page-end')); }} aria-label={showPageHeader ? undefined : pageLabel} aria-labelledby={showPageHeader ? 'page-title' : undefined} className="content" data-custom-page={isCustomPage} data-page={page} id="main-content" tabIndex={-1}>
          {graphOpen && <Suspense fallback={<div className="page-loading" />}><WorkspaceGraph locale={locale} onClose={() => setGraphOpen(false)} /></Suspense>}
          <div style={{ display: graphOpen ? 'none' : 'contents' }}>
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

          <Suspense fallback={<div className="page-loading" />}>
          {isCustomPage && activeCustomPage ? (
            <CustomPageView
              key={activeCustomPage.id}
              locale={locale}
              onUpdatePage={handleUpdateCustomPage}
              onWorkspaceChange={refreshWorkspaceNavigation}
              page={activeCustomPage}
            />
          ) : page === 'databases' ? (
            <DatabasesWorkspace key="databases" locale={locale} />
          ) : activeWorkspaceDatabase ? (
            <DatabasePage key={activeWorkspaceDatabase.id} databaseId={activeWorkspaceDatabase.id} initialViewId={requestedSavedViewId} locale={locale} onOpenRecordId={openRecordId} onArchived={() => navigate(firstWorkspacePageId(customPages, workspaceNavigation.pages, workspaceNavigation.databases.filter((d) => d.id !== activeWorkspaceDatabase.id)))} />
          ) : page === 'settings' ? (
            <SettingsPage
              key="settings"
              activeSection={settingsSection}
              onVisibleSectionChange={setSettingsSection}
              locale={locale}
              onBackToApp={() => navigate(previousPage.current)}
              onChangeLocale={setLocale}
              onChangeTheme={setTheme}
              onDemoDataSeeded={() => {
                window.dispatchEvent(new Event('max:workspace-changed'));
                void loadPersistentCustomPages().then(setCustomPages);
                void window.maxApi.shop.getMetadata().then((metadata) => setShopName(metadata.shopName));
              }}
              onResetAppearance={() => setTheme('system')}
              onSectionChange={setSettingsSection}
              onShowOnboarding={() => setOnboardingPreview(true)}
              onWorkspaceDeleted={() => {
                setCustomPages([]);
                setShopName('');
                setOnboardingCompleted(false);
              }}
              theme={theme}
            />
          ) : ['items', 'people', 'accounts', 'transactions'].includes(page) ? (
            <LegacyDatabaseLink key={page} alias={page} locale={locale} />
          ) : (
            <EmptyPage
              locale={locale}
              onCreate={() => { void handleAddCustomPage(); }}
              onOpenCommand={() => setCommandOpen(true)}
              page={page}
            />
          )}
          </Suspense>
        </div>
        </main>
        <ScrollOutline locale={locale} pageKey={page} />
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
      {quickActionOpen !== null && (
        <WorkflowLauncherDialog locale={locale} onClose={() => setQuickActionOpen(null)} onConfigure={() => { setQuickActionOpen(null); navigateSettingsSection('settings-quick-actions'); }} />
      )}
      </Suspense>

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
