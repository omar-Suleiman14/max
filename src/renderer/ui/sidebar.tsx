import {
  ArrowLeftToLine,
  ArrowRightToLine,
  CircleDollarSign,
  ContactRound,
  Home,
  Languages,
  Package,
  ReceiptText,
  Settings,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';

import type { AppPage, EngineStatus, NavigationItem } from '../app/app-types';
import { type Locale, translate } from '../app/i18n';

type SidebarProps = Readonly<{
  collapsed: boolean;
  engineStatus: EngineStatus;
  locale: Locale;
  onChangeLocale: () => void;
  onCollapse: () => void;
  onNavigate: (page: AppPage) => void;
  onOpenSettings: () => void;
  page: AppPage;
}>;

const navigation: readonly NavigationItem[] = [
  { icon: Home, page: 'home' },
  { icon: Package, page: 'items' },
  { icon: ContactRound, page: 'people' },
  { icon: ReceiptText, page: 'transactions' },
  { icon: CircleDollarSign, page: 'accounts' },
  { icon: SlidersHorizontal, page: 'views' },
];

const pageLabelKey: Record<AppPage, 'account' | 'home' | 'item' | 'person' | 'transaction' | 'view'> = {
  accounts: 'account',
  home: 'home',
  items: 'item',
  people: 'person',
  transactions: 'transaction',
  views: 'view',
};

function SidebarAction({
  collapsed,
  icon: Icon,
  label,
  onClick,
}: Readonly<{
  collapsed: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}>) {
  return (
    <button aria-label={label} className="sidebar-action" onClick={onClick} type="button">
      <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

export function Sidebar({
  collapsed,
  engineStatus,
  locale,
  onChangeLocale,
  onCollapse,
  onNavigate,
  onOpenSettings,
  page,
}: SidebarProps) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = navigation.length - 1;
    let nextIndex: number | undefined;
    if (event.key === 'ArrowDown') nextIndex = index === lastIndex ? 0 : index + 1;
    if (event.key === 'ArrowUp') nextIndex = index === 0 ? lastIndex : index - 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = lastIndex;
    if (nextIndex === undefined) return;
    event.preventDefault();
    itemRefs.current[nextIndex]?.focus();
  }

  const collapseLabel = translate(locale, collapsed ? 'expandSidebar' : 'collapseSidebar');
  const CollapseIcon = collapsed ? ArrowRightToLine : ArrowLeftToLine;
  const languageLabel = locale === 'en' ? 'العربية' : 'English';
  const engineLabel = translate(
    locale,
    engineStatus === 'checking' ? 'engineChecking' : engineStatus === 'unavailable' ? 'engineIssue' : 'engineReady',
  );

  return (
    <aside className="sidebar" data-collapsed={collapsed}>
      <div className="sidebar__brand-row">
        <div className="brand" aria-label="Max">
          <span className="brand__mark" aria-hidden="true">M</span>
          {!collapsed && (
            <span className="brand__wordmark">
              <strong>{translate(locale, 'appName')}</strong>
              <small>v0.1</small>
            </span>
          )}
        </div>
        <button aria-label={collapseLabel} className="icon-button sidebar__collapse" onClick={onCollapse} type="button">
          <CollapseIcon aria-hidden="true" size={17} />
        </button>
      </div>

      {!collapsed && <p className="sidebar__section-label">{translate(locale, 'workspace')}</p>}
      <nav aria-label={translate(locale, 'workspace')} className="sidebar__nav">
        {navigation.map(({ icon: Icon, page: itemPage }, index) => {
          const label = translate(locale, pageLabelKey[itemPage]);
          return (
            <button
              key={itemPage}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              aria-current={page === itemPage ? 'page' : undefined}
              aria-label={label}
              className="nav-item"
              onClick={() => onNavigate(itemPage)}
              onKeyDown={(event) => moveFocus(event, index)}
              type="button"
            >
              <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
              {!collapsed && <span>{label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="sidebar__footer">
        <div aria-live="polite" className="engine-status" data-status={engineStatus} role="status" title={engineLabel}>
          <span className="engine-status__dot" aria-hidden="true" />
          {!collapsed && (
            <span>{engineLabel}</span>
          )}
        </div>
        <SidebarAction collapsed={collapsed} icon={Languages} label={languageLabel} onClick={onChangeLocale} />
        <SidebarAction collapsed={collapsed} icon={Settings} label={translate(locale, 'settings')} onClick={onOpenSettings} />
      </div>
    </aside>
  );
}
