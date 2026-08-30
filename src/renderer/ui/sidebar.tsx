import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Database,
  GripVertical,
  Languages,
  Plus,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';

import type { AppPage, CustomPage } from '../app/app-types';
import { type Locale, translate } from '../app/i18n';
import { PageIconRenderer } from './page-icon-renderer';

type SidebarProps = Readonly<{
  collapsed: boolean;
  customPages: readonly CustomPage[];
  homePage: CustomPage;
  locale: Locale;
  onAddCustomPage: () => void;
  onChangeLocale: () => void;
  onCollapse: () => void;
  onNavigate: (page: AppPage) => void;
  onOpenSettings: () => void;
  onReorderPages: (pages: readonly CustomPage[]) => void;
  page: AppPage;
}>;

function SidebarAction({
  collapsed,
  icon: Icon,
  isActive,
  label,
  onClick,
}: Readonly<{
  collapsed: boolean;
  icon: LucideIcon;
  isActive?: boolean;
  label: string;
  onClick: () => void;
}>) {
  return (
    <button
      aria-current={isActive ? 'page' : undefined}
      aria-label={label}
      className="sidebar-action"
      data-active={isActive}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

export function Sidebar({
  collapsed,
  customPages,
  homePage,
  locale,
  onAddCustomPage,
  onChangeLocale,
  onCollapse,
  onNavigate,
  onOpenSettings,
  onReorderPages,
  page,
}: SidebarProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Unified list of all pages (Home + Custom Pages) - all movable and reorderable!
  const allWorkspacePages = [homePage, ...customPages];

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowDown', 'ArrowUp', 'End', 'Home'].includes(event.key)) return;
    const items = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null);
    if (items.length === 0) return;
    const lastIndex = items.length - 1;
    let nextIndex = index;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = lastIndex;
    else if (event.key === 'ArrowDown') nextIndex = index >= lastIndex ? 0 : index + 1;
    else nextIndex = index <= 0 ? lastIndex : index - 1;
    event.preventDefault();
    items[nextIndex]?.focus();
  }

  function handleDragStart(index: number) {
    setDraggedIndex(index);
  }

  function handleDragOver(event: React.DragEvent, index: number) {
    event.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  }

  function handleDrop(targetIndex: number) {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    const next = [...allWorkspacePages];
    const [moved] = next.splice(draggedIndex, 1);
    if (moved) {
      next.splice(targetIndex, 0, moved);
      onReorderPages(next);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  const isRtl = locale === 'ar';
  const isSettings = page === 'settings';
  const collapseLabel = translate(locale, collapsed ? 'expandSidebar' : 'collapseSidebar');
  const CollapseIcon = collapsed
    ? (isRtl ? ArrowLeftToLine : ArrowRightToLine)
    : (isRtl ? ArrowRightToLine : ArrowLeftToLine);
  const languageLabel = locale === 'en' ? 'العربية' : 'English';

  const SettingsActionIcon = isSettings ? (isRtl ? ArrowRightToLine : ArrowLeftToLine) : Settings;
  const settingsActionLabel = translate(locale, isSettings ? 'backToApp' : 'settings');
  const handleSettingsClick = isSettings ? () => onNavigate('home') : onOpenSettings;

  return (
    <aside className="sidebar" data-collapsed={collapsed}>
      <div className="sidebar__brand-row">
        <div aria-label="Max" className="brand" role="img">
          <span aria-hidden="true" className="brand__mark">M</span>
        </div>
        <button aria-label={collapseLabel} className="icon-button sidebar__collapse" onClick={onCollapse} type="button">
          <CollapseIcon aria-hidden="true" size={17} />
        </button>
      </div>

      {!collapsed && <p className="sidebar__section-label">{translate(locale, 'workspace')}</p>}
      <nav aria-label={translate(locale, 'workspace')} className="sidebar__nav">
        {/* ALL WORKSPACE PAGES (HOME + CUSTOM PAGES) - ALL MOVABLE & DRAGGABLE */}
        {allWorkspacePages.map((p, index) => {
          const isHome = p.id === 'home';
          const isCurrent = page === p.id;
          const isDragging = draggedIndex === index;
          const isDragOver = dragOverIndex === index;
          const pageTitle = p.title.trim() || (isHome ? translate(locale, 'home') : translate(locale, 'untitledPage'));

          return (
            <button
              key={p.id}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              aria-current={isCurrent ? 'page' : undefined}
              aria-label={pageTitle}
              className="nav-item nav-item--custom-page"
              data-drag-over={isDragOver}
              data-dragging={isDragging}
              draggable
              onClick={() => onNavigate(p.id)}
              onDragEnd={() => {
                setDraggedIndex(null);
                setDragOverIndex(null);
              }}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragStart={() => handleDragStart(index)}
              onDrop={() => handleDrop(index)}
              onKeyDown={(event) => moveFocus(event, index)}
              type="button"
            >
              {!collapsed && (
                <span className="nav-item__grip" title={locale === 'ar' ? 'سحب للترتيب' : 'Drag to reorder'}>
                  <GripVertical aria-hidden="true" size={12} />
                </span>
              )}
              <PageIconRenderer
                className="nav-item__custom-icon"
                fallback={isHome ? 'lucide:Home' : 'lucide:FileText'}
                icon={p.icon || (isHome ? 'lucide:Home' : 'lucide:FileText')}
                size={18}
              />
              {!collapsed && <span className="nav-item__title">{pageTitle}</span>}
            </button>
          );
        })}

        {/* ADD A PAGE BUTTON (Visible in both Expanded & Minimized sidebar) */}
        <button
          aria-label={translate(locale, 'addPage')}
          className="sidebar-add-page-btn"
          onClick={onAddCustomPage}
          title={translate(locale, 'addPage')}
          type="button"
        >
          <Plus size={15} />
          {!collapsed && <span>{translate(locale, 'addPage')}</span>}
        </button>
      </nav>

      {/* FOOTER ACTIONS (DATABASES ABOVE SETTINGS) */}
      <div className="sidebar__footer">
        <SidebarAction
          collapsed={collapsed}
          icon={Database}
          isActive={page === 'databases'}
          label={translate(locale, 'databases')}
          onClick={() => onNavigate('databases')}
        />
        <SidebarAction
          collapsed={collapsed}
          icon={Languages}
          label={languageLabel}
          onClick={onChangeLocale}
        />
        <SidebarAction
          collapsed={collapsed}
          icon={SettingsActionIcon}
          label={settingsActionLabel}
          onClick={handleSettingsClick}
        />
      </div>
    </aside>
  );
}
