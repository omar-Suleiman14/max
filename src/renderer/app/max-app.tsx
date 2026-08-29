import { ChevronDown, Command as CommandIcon, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import type { BackupSchedule, Blueprint } from '../../shared/blueprint-contract';
import { BlueprintDialog } from '../blueprints/blueprint-dialog';
import { Onboarding } from '../onboarding/onboarding';
import type { AppPage, EngineStatus } from './app-types';
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
import { FocusedOverlay } from '../ui/focused-overlay';
import { SettingsDialog } from '../ui/settings-dialog';
import { Sidebar } from '../ui/sidebar';
import { ObjectWorkspace } from '../objects/object-workspace';

const pageLabels: Record<AppPage, TranslationKey> = {
  accounts: 'account',
  home: 'home',
  items: 'item',
  people: 'person',
  transactions: 'transaction',
  views: 'view',
};

const pageSubtitles: Record<AppPage, TranslationKey> = {
  accounts: 'pageSubtitleAccounts',
  home: 'pageSubtitleHome',
  items: 'pageSubtitleItems',
  people: 'pageSubtitlePeople',
  transactions: 'pageSubtitleTransactions',
  views: 'pageSubtitleViews',
};

const createLabels: Record<AppPage, TranslationKey> = {
  accounts: 'accountCreate',
  home: 'createSomething',
  items: 'itemCreate',
  people: 'personCreate',
  transactions: 'transactionCreate',
  views: 'viewCreate',
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
  const [commandOpen, setCommandOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [blueprintModalTab, setBlueprintModalTab] = useState<'export' | 'import'>();
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [creationNoticeOpen, setCreationNoticeOpen] = useState(false);
  const [objectCreateRequest, setObjectCreateRequest] = useState(0);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('checking');
  const [runtimePlatform, setRuntimePlatform] = useState<'linux' | 'macos' | 'windows'>();
  const [engineNoticeVisible, setEngineNoticeVisible] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [shopName, setShopName] = useState('');

  const createMenuRef = useRef<HTMLDivElement>(null);
  const createMenuTriggerRef = useRef<HTMLButtonElement>(null);
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
        setSettingsOpen(false);
        setBlueprintModalTab(undefined);
        setCommandOpen(true);
      } else if (event.key === '/' && !isEditingTarget(event.target)) {
        event.preventDefault();
        setCommandOpen(true);
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (!createMenuOpen) return;
    createMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    function closeWhenOutside(event: MouseEvent) {
      if (event.target instanceof Node && !createMenuRef.current?.contains(event.target)) {
        setCreateMenuOpen(false);
      }
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setCreateMenuOpen(false);
        createMenuTriggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', closeWhenOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeWhenOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [createMenuOpen]);

  function moveWithinCreateMenu(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'End', 'Home'].includes(event.key)) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const lastIndex = items.length - 1;
    if (lastIndex < 0) return;
    let nextIndex = currentIndex;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = lastIndex;
    else if (event.key === 'ArrowDown') nextIndex = currentIndex >= lastIndex ? 0 : currentIndex + 1;
    else nextIndex = currentIndex <= 0 ? lastIndex : currentIndex - 1;
    event.preventDefault();
    items[nextIndex]?.focus();
  }

  function navigate(nextPage: AppPage) {
    setPage(nextPage);
    setCommandOpen(false);
    setCreateMenuOpen(false);
  }

  function beginCreation() {
    setCreateMenuOpen(false);
    if (page === 'items' || page === 'people') {
      setObjectCreateRequest((request) => request + 1);
    } else {
      setCreationNoticeOpen(true);
    }
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
    const navigationCommands = (Object.keys(pageLabels) as AppPage[]).map((destination) => {
      const pageLabel = translate(locale, pageLabels[destination]);
      return {
        id: `navigate-${destination}`,
        keywords: [destination, pageLabel, 'navigate', 'انتقل'],
        label: locale === 'ar' ? `انتقل إلى ${pageLabel}` : `Go to ${pageLabel}`,
        run: () => navigate(destination),
      };
    });
    return [
      ...navigationCommands,
      {
        id: 'open-settings',
        keywords: ['preferences', 'appearance', 'theme', 'language', 'إعدادات', 'مظهر'],
        label: translate(locale, 'openSettings'),
        run: () => setSettingsOpen(true),
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
  }, [locale]);

  if (onboardingCompleted === false) {
    return <Onboarding initialLocale={locale} onComplete={handleCompleteOnboarding} />;
  }

  const pageLabel = translate(locale, pageLabels[page]);
  const createLabel = translate(locale, createLabels[page]);

  return (
    <div className="app-shell" data-app-ready={engineStatus === 'ready' ? 'true' : undefined}>
      <a className="skip-link" href="#main-content">
        {locale === 'ar' ? 'انتقل إلى المحتوى' : 'Skip to content'}
      </a>
      <Sidebar
        collapsed={sidebarCollapsed}
        engineStatus={engineStatus}
        locale={locale}
        onChangeLocale={() => setLocale(locale === 'en' ? 'ar' : 'en')}
        onCollapse={() => setSidebarCollapsed((collapsed) => !collapsed)}
        onNavigate={navigate}
        onOpenSettings={() => setSettingsOpen(true)}
        page={page}
      />

      <div className="app-frame">
        <header className="topbar">
          <div className="topbar__title">
            <p>
              {shopName ? `${shopName} · ` : ''}
              {translate(locale, 'workspace')} /
            </p>
            <strong>{pageLabel}</strong>
          </div>
          <div className="topbar__actions">
            <button className="command-trigger" onClick={() => setCommandOpen(true)} type="button">
              <Search aria-hidden="true" size={17} />
              <span>{translate(locale, 'commandSearch')}</span>
              <kbd>{runtimePlatform === 'macos' ? <CommandIcon aria-hidden="true" size={12} /> : 'Ctrl'} K</kbd>
            </button>
            <div className="create-menu" ref={createMenuRef}>
              <Button
                ref={createMenuTriggerRef}
                aria-expanded={createMenuOpen}
                aria-haspopup="menu"
                icon={<Plus aria-hidden="true" size={18} />}
                onClick={() => setCreateMenuOpen((open) => !open)}
                variant="primary"
              >
                {translate(locale, 'newAction')}
                <ChevronDown aria-hidden="true" className="button__chevron" size={15} />
              </Button>
              {createMenuOpen && (
                <div aria-label={translate(locale, 'createMenu')} className="popover-menu" onKeyDown={moveWithinCreateMenu} role="menu">
                  <button onClick={beginCreation} role="menuitem" type="button">
                    <Plus aria-hidden="true" size={17} />
                    <span>
                      <strong>{createLabel}</strong>
                      <small>{translate(locale, pageSubtitles[page])}</small>
                    </span>
                  </button>
                  <button onClick={() => { setCreateMenuOpen(false); setCommandOpen(true); }} role="menuitem" type="button">
                    <Search aria-hidden="true" size={17} />
                    <span>
                      <strong>{translate(locale, 'openCommand')}</strong>
                      <small>{runtimePlatform === 'macos' ? '⌘ K' : translate(locale, 'pressCommand')}</small>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main aria-labelledby="page-title" className="content" id="main-content" tabIndex={-1}>
          <header className="page-header">
            <div>
              <p className="eyebrow">{translate(locale, 'workspace')}</p>
              <h1 id="page-title">{pageLabel}</h1>
              <p>{translate(locale, pageSubtitles[page])}</p>
            </div>
          </header>
          {page === 'items' || page === 'people' ? (
            <ObjectWorkspace
              createRequest={objectCreateRequest}
              key={page}
              locale={locale}
              objectKind={page === 'items' ? 'item' : 'person'}
            />
          ) : (
            <EmptyPage
              locale={locale}
              onCreate={beginCreation}
              onNavigate={navigate}
              onOpenCommand={() => setCommandOpen(true)}
              page={page}
            />
          )}
        </main>
      </div>

      {commandOpen && <CommandMenu commands={commands} locale={locale} onClose={() => setCommandOpen(false)} />}
      {settingsOpen && (
        <SettingsDialog
          locale={locale}
          onChangeLocale={setLocale}
          onChangeTheme={setTheme}
          onClose={() => setSettingsOpen(false)}
          onResetAppearance={() => setTheme('system')}
          theme={theme}
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
      {creationNoticeOpen && (
        <FocusedOverlay className="scope-dialog" labelId="scope-dialog-title" onClose={() => setCreationNoticeOpen(false)}>
          <div className="scope-dialog__icon">
            <Plus aria-hidden="true" size={23} />
          </div>
          <p className="eyebrow">{translate(locale, 'nextStep')}</p>
          <h2 id="scope-dialog-title">{translate(locale, 'configureFirst')}</h2>
          <p>{translate(locale, 'configureFirstBody')}</p>
          <Button data-autofocus="true" onClick={() => setCreationNoticeOpen(false)} variant="primary">
            {translate(locale, 'returnToWorkspace')}
          </Button>
        </FocusedOverlay>
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
