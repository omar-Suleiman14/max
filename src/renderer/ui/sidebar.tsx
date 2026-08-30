import {
  Archive,
  ArrowLeftToLine,
  ArrowRightToLine,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  GripVertical,
  Languages,
  MoreHorizontal,
  Pencil,
  Palette,
  Plus,
  Settings,
  Star,
  Store,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { AppPage, CustomPage, SettingsSectionId } from '../app/app-types';
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
  onDeletePage: (id: string) => void;
  onDuplicatePage: (id: string) => void;
  onNavigate: (page: AppPage) => void;
  onOpenSettings: () => void;
  onRenamePage: (id: string, title: string) => void;
  onResize: (width: number) => void;
  onSettingsSectionChange: (section: SettingsSectionId) => void;
  onToggleFavorite: (id: string, favorite: boolean) => void;
  onReorderPages: (pages: readonly CustomPage[]) => void;
  page: AppPage;
  settingsSection: SettingsSectionId;
  width: number;
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
  onDeletePage,
  onDuplicatePage,
  onNavigate,
  onOpenSettings,
  onRenamePage,
  onResize,
  onSettingsSectionChange,
  onToggleFavorite,
  onReorderPages,
  page,
  settingsSection,
  width,
}: SidebarProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverEdge, setDragOverEdge] = useState<'after' | 'before'>('before');
  const [expandedPageIds, setExpandedPageIds] = useState<ReadonlySet<string>>(new Set());
  const [menuPageId, setMenuPageId] = useState<string>();
  const [savedViewNames, setSavedViewNames] = useState<Readonly<Record<string, readonly { id: string; name: string }[]>>>({});
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const resizeStartRef = useRef<{ pointerId: number; startWidth: number; startX: number } | undefined>(undefined);

  // Unified list of all pages (Home + Custom Pages) - all movable and reorderable!
  const allWorkspacePages = [homePage, ...customPages];
  const favoritePages = allWorkspacePages.filter((candidate) => candidate.favorite);

  useEffect(() => {
    const kinds = ['account', 'item', 'person', 'transaction'] as const;
    void Promise.all(kinds.map(async (kind) => [kind, await window.maxApi.views.list(kind)] as const))
      .then((results) => setSavedViewNames(Object.fromEntries(
        results.map(([kind, views]) => [kind, views.map(({ id, name }) => ({ id, name }))]),
      )))
      .catch(() => undefined);
  }, [customPages]);

  useEffect(() => {
    if (!menuPageId) return;
    const closeOnPointerDown = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('.sidebar-page-menu, .nav-item__menu-trigger')) return;
      setMenuPageId(undefined);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setMenuPageId(undefined);
    };
    document.addEventListener('mousedown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuPageId]);

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

  function handleDragStart(event: React.DragEvent, index: number) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', allWorkspacePages[index]?.id ?? '');
    setDraggedIndex(index);
  }

  function handleDragOver(event: React.DragEvent, index: number) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    setDragOverEdge(event.clientY >= rect.top + rect.height / 2 ? 'after' : 'before');
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
      const adjustedTarget = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
      const insertAt = Math.max(0, adjustedTarget + (dragOverEdge === 'after' ? 1 : 0));
      next.splice(insertAt, 0, moved);
      onReorderPages(next);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  function movePage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= allWorkspacePages.length) return;
    const next = [...allWorkspacePages];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    onReorderPages(next);
    requestAnimationFrame(() => itemRefs.current[target]?.focus());
  }

  const isRtl = locale === 'ar';
  const isSettings = page === 'settings';
  const collapseLabel = translate(locale, collapsed ? 'expandSidebar' : 'collapseSidebar');
  const CollapseIcon = collapsed
    ? (isRtl ? ArrowLeftToLine : ArrowRightToLine)
    : (isRtl ? ArrowRightToLine : ArrowLeftToLine);
  const languageLabel = locale === 'en' ? 'العربية' : 'English';
  const settingsSections: readonly Readonly<{ icon: LucideIcon; id: SettingsSectionId; label: string }>[] = [
    { icon: Store, id: 'settings-general', label: locale === 'ar' ? 'عام' : 'General' },
    { icon: Palette, id: 'settings-appearance', label: locale === 'ar' ? 'المظهر' : 'Appearance' },
    { icon: Database, id: 'settings-backup', label: locale === 'ar' ? 'النسخ الاحتياطي' : 'Backup' },
    { icon: Archive, id: 'settings-archive', label: locale === 'ar' ? 'الأرشيف والمهملات' : 'Archive & trash' },
  ];

  function handleResizePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    resizeStartRef.current = { pointerId: event.pointerId, startWidth: width, startX: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handleResizePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = resizeStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const direction = isRtl ? -1 : 1;
    onResize(Math.min(420, Math.max(180, start.startWidth + (event.clientX - start.startX) * direction)));
  }

  function handleResizePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (resizeStartRef.current?.pointerId !== event.pointerId) return;
    resizeStartRef.current = undefined;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const visualDirection = event.key === 'ArrowRight' ? 1 : -1;
    onResize(Math.min(420, Math.max(180, width + visualDirection * (isRtl ? -12 : 12))));
  }

  const SettingsActionIcon = isSettings ? (isRtl ? ArrowRightToLine : ArrowLeftToLine) : Settings;
  const settingsActionLabel = translate(locale, isSettings ? 'backToApp' : 'settings');
  const handleSettingsClick = isSettings ? () => onNavigate('home') : onOpenSettings;

  return (
    <aside className="sidebar" data-collapsed={collapsed} style={collapsed ? undefined : { width }}>
      <div className="sidebar__brand-row">
        <div aria-label="Max" className="brand" role="img">
          <span aria-hidden="true" className="brand__mark">M</span>
        </div>
        <button aria-label={collapseLabel} className="icon-button sidebar__collapse" onClick={onCollapse} type="button">
          <CollapseIcon aria-hidden="true" size={17} />
        </button>
      </div>

      {isSettings ? (
        <>
          {!collapsed && <p className="sidebar__section-label">{locale === 'ar' ? 'الإعدادات' : 'Settings'}</p>}
          <nav aria-label={locale === 'ar' ? 'أقسام الإعدادات' : 'Settings sections'} className="sidebar__nav">
            {settingsSections.map(({ icon, id, label }) => (
              <SidebarAction
                collapsed={collapsed}
                icon={icon}
                isActive={settingsSection === id}
                key={id}
                label={label}
                onClick={() => onSettingsSectionChange(id)}
              />
            ))}
          </nav>
        </>
      ) : (
        <>
          {favoritePages.length > 0 && (
            <>
              {!collapsed && <p className="sidebar__section-label">{locale === 'ar' ? 'المفضلة' : 'Favorites'}</p>}
              <nav aria-label={locale === 'ar' ? 'المفضلة' : 'Favorites'} className="sidebar__nav sidebar__nav--favorites">
                {favoritePages.map((favorite) => (
                  <button
                    aria-current={page === favorite.id ? 'page' : undefined}
                    aria-label={favorite.title.trim() || translate(locale, favorite.id === 'home' ? 'home' : 'untitledPage')}
                    className="nav-item nav-item--favorite"
                    key={`favorite-${favorite.id}`}
                    onClick={() => onNavigate(favorite.id)}
                    type="button"
                  >
                    <PageIconRenderer className="nav-item__custom-icon" fallback="lucide:Star" icon={favorite.icon || 'lucide:Star'} size={17} />
                    {!collapsed && <span className="nav-item__title">{favorite.title.trim() || translate(locale, favorite.id === 'home' ? 'home' : 'untitledPage')}</span>}
                  </button>
                ))}
              </nav>
            </>
          )}
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
            <div
              key={p.id}
              className="sidebar-page-tree"
              data-drop-edge={isDragOver ? dragOverEdge : undefined}
              onDragEnd={() => {
                setDraggedIndex(null);
                setDragOverIndex(null);
              }}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
            >
              <button
                ref={(element) => { itemRefs.current[index] = element; }}
                aria-current={isCurrent ? 'page' : undefined}
                aria-label={pageTitle}
                className="nav-item nav-item--custom-page"
                data-drag-over={isDragOver}
                data-dragging={isDragging}
                onClick={() => onNavigate(p.id)}
                onKeyDown={(event) => {
                  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                    event.preventDefault();
                    movePage(index, event.key === 'ArrowUp' ? -1 : 1);
                    return;
                  }
                  moveFocus(event, index);
                }}
                type="button"
              >
                {!collapsed && (
                  <span
                    aria-label={locale === 'ar' ? 'اسحب لترتيب الصفحة' : 'Drag to reorder page'}
                    className="nav-item__grip"
                    draggable
                    onDragEnd={() => { setDraggedIndex(null); setDragOverIndex(null); }}
                    onDragStart={(event) => { event.stopPropagation(); handleDragStart(event, index); }}
                    role="img"
                  >
                    <GripVertical aria-hidden="true" size={12} />
                  </span>
                )}
                {(() => {
                  const databaseBlock = p.blocks.find((block) => block.type === 'database-view');
                  const target = databaseBlock?.databaseKind === 'items' ? 'item'
                    : databaseBlock?.databaseKind === 'people' ? 'person'
                      : databaseBlock?.databaseKind === 'accounts' ? 'account'
                        : databaseBlock?.databaseKind === 'transactions' ? 'transaction' : undefined;
                  const hasChildren = Boolean(target && savedViewNames[target]?.length);
                  return (
                    <span className="nav-item__icon-slot">
                      <PageIconRenderer className="nav-item__custom-icon" fallback={isHome ? 'lucide:Home' : 'lucide:FileText'} icon={p.icon || (isHome ? 'lucide:Home' : 'lucide:FileText')} size={18} />
                      {hasChildren && (
                        <span
                          aria-label={locale === 'ar' ? 'إظهار طرق العرض' : 'Show views'}
                          className="nav-item__expand"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedPageIds((current) => {
                              const next = new Set(current);
                              if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                              return next;
                            });
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          {expandedPageIds.has(p.id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </span>
                      )}
                    </span>
                  );
                })()}
                {!collapsed && <span className="nav-item__title">{pageTitle}</span>}
              </button>
              {!collapsed && !isHome && (
                <button aria-label={locale === 'ar' ? 'إعدادات الصفحة' : 'Page settings'} className="nav-item__menu-trigger" onClick={() => setMenuPageId(menuPageId === p.id ? undefined : p.id)} type="button">
                  <MoreHorizontal size={15} />
                </button>
              )}
              {menuPageId === p.id && (
                <div className="sidebar-page-menu" role="menu">
                  <button onClick={() => { setMenuPageId(undefined); onToggleFavorite(p.id, !p.favorite); }} role="menuitem" type="button"><Star fill={p.favorite ? 'currentColor' : 'none'} size={14} />{p.favorite ? (locale === 'ar' ? 'إزالة من المفضلة' : 'Remove from favorites') : (locale === 'ar' ? 'إضافة للمفضلة' : 'Add to favorites')}</button>
                  <button onClick={() => { setMenuPageId(undefined); onRenamePage(p.id, window.prompt(locale === 'ar' ? 'اسم الصفحة' : 'Page name', p.title) ?? p.title); }} role="menuitem" type="button"><Pencil size={15} />{locale === 'ar' ? 'إعادة تسمية' : 'Rename'}</button>
                  <button onClick={() => { setMenuPageId(undefined); onDuplicatePage(p.id); }} role="menuitem" type="button"><Copy size={15} />{locale === 'ar' ? 'إنشاء نسخة' : 'Duplicate'}</button>
                  <div className="sidebar-page-menu__separator" />
                  <button className="danger" onClick={() => { setMenuPageId(undefined); onDeletePage(p.id); }} role="menuitem" type="button"><Trash2 size={15} />{locale === 'ar' ? 'نقل إلى المهملات' : 'Move to trash'}</button>
                </div>
              )}
              {expandedPageIds.has(p.id) && (() => {
                const kind = p.blocks.find((block) => block.type === 'database-view')?.databaseKind;
                const target = kind === 'items' ? 'item' : kind === 'people' ? 'person' : kind === 'accounts' ? 'account' : kind === 'transactions' ? 'transaction' : undefined;
                return target ? <div className="sidebar-view-children">{savedViewNames[target]?.map((view) => <button key={view.id} onClick={() => onNavigate(p.id)} type="button"><span className="sidebar-view-dot" />{view.name}</button>)}</div> : null;
              })()}
            </div>
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
        </>
      )}

      {/* FOOTER ACTIONS (DATABASES ABOVE SETTINGS) */}
      <div className="sidebar__footer">
        {!isSettings && <SidebarAction collapsed={collapsed} icon={Database} isActive={page === 'databases'} label={translate(locale, 'databases')} onClick={() => onNavigate('databases')} />}
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
      {!collapsed && (
        <div
          aria-label={locale === 'ar' ? 'تغيير عرض الشريط الجانبي' : 'Resize sidebar'}
          aria-orientation="vertical"
          aria-valuemax={420}
          aria-valuemin={180}
          aria-valuenow={Math.round(width)}
          className="sidebar__resize-handle"
          onDoubleClick={() => onResize(238)}
          onKeyDown={handleResizeKeyDown}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          role="separator"
          tabIndex={0}
        />
      )}
    </aside>
  );
}
