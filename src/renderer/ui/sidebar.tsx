import maxLogo from '../assets/max-logo.png';
import {
  AlertTriangle,
  BadgeDollarSign,
  Archive,
  ArrowLeft,
  ArrowRight,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
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
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import type { AppPage, CustomPage, SettingsSectionId } from '../app/app-types';
import { type Locale, translate } from '../app/i18n';
import type { NavigationItem } from '../../shared/workspace-contract';
import { PageIconRenderer } from './page-icon-renderer';

type SidebarProps = Readonly<{
  collapsed: boolean;
  customPages: readonly CustomPage[];
  databases: readonly NavigationItem[];
  locale: Locale;
  onExitSettings: () => void;
  onAddCustomPage: () => void;
  onAddSubpage: (parentId: string) => void;
  onCollapse: () => void;
  onDeletePage: (id: string) => void;
  onDuplicatePage: (id: string) => void;
  onNavigate: (page: AppPage) => void;
  onNavigateView: (databaseId: string, viewId: string) => void;
  onOpenSettings: () => void;
  onRenamePage: (id: string, title: string) => void;
  onResize: (width: number) => void;
  onSettingsSectionChange: (section: SettingsSectionId) => void;
  onToggleFavorite: (id: string, favorite: boolean) => void;
  onReorderNodes: (orderedIds: string[], movedId?: string, parentNodeId?: string | null) => void;
  page: AppPage;
  settingsSection: SettingsSectionId;
  width: number;
  runtimePlatform?: 'linux' | 'macos' | 'windows';
}>;

type WorkspaceNodeRow = Readonly<{
  database?: NavigationItem;
  depth: number;
  hasChildren: boolean;
  id: string;
  kind: 'database' | 'page';
  page?: CustomPage;
}>;

type WorkspaceViewRow = Readonly<{
  databaseId: string;
  depth: number;
  id: string;
  kind: 'view';
  name: string;
}>;

type WorkspaceRow = WorkspaceNodeRow | WorkspaceViewRow;

function SidebarAction({
  collapsed,
  icon: Icon,
  isActive,
  label,
  onClick,
  shortcut,
  title,
}: Readonly<{
  collapsed: boolean;
  icon: LucideIcon;
  isActive?: boolean;
  label: string;
  onClick: () => void;
  shortcut?: string;
  title?: string;
}>) {
  return (
    <button
      aria-current={isActive ? 'page' : undefined}
      aria-label={label}
      aria-keyshortcuts={shortcut === '⌘ ,' ? 'Meta+,' : shortcut === 'Ctrl ,' ? 'Control+,' : undefined}
      title={title ?? label}
      className="sidebar-action"
      data-active={isActive}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
      {!collapsed && <span className="sidebar-action__label">{label}</span>}
      {!collapsed && shortcut && <kbd className="sidebar-action__shortcut">{shortcut}</kbd>}
    </button>
  );
}

export function Sidebar({
  collapsed,
  customPages,
  databases,
  locale,
  onAddCustomPage,
  onAddSubpage,
  onCollapse,
  onDeletePage,
  onDuplicatePage,
  onExitSettings,
  onNavigate,
  onNavigateView,
  onOpenSettings,
  onRenamePage,
  onResize,
  onSettingsSectionChange,
  onToggleFavorite,
  onReorderNodes,
  page,
  settingsSection,
  width,
  runtimePlatform,
}: SidebarProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverEdge, setDragOverEdge] = useState<'after' | 'before'>('before');
  const [expandedPageIds, setExpandedPageIds] = useState<ReadonlySet<string>>(new Set());
  const [menuPageId, setMenuPageId] = useState<string>();
  const [legacyViewNames, setLegacyViewNames] = useState<Readonly<Record<string, readonly { id: string; name: string }[]>>>({});
  const [databaseViewNames, setDatabaseViewNames] = useState<Readonly<Record<string, readonly { id: string; name: string }[]>>>({});
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const resizeStartRef = useRef<{ pointerId: number; startWidth: number; startX: number } | undefined>(undefined);

  const favoritePages = customPages.filter((candidate) => candidate.favorite);

  useEffect(() => {
    const kinds = ['account', 'item', 'person', 'transaction'] as const;
    void Promise.all(kinds.map(async (kind) => [kind, await window.maxApi.views.list(kind)] as const))
      .then((results) => setLegacyViewNames(Object.fromEntries(
        results.map(([kind, views]) => [kind, views.map(({ id, name }) => ({ id, name }))]),
      )))
      .catch(() => undefined);
  }, [customPages]);

  useEffect(() => {
    let active = true;
    void Promise.all(databases.map(async (database) => [database.id, await window.maxApi.workspace.listViews(database.id)] as const))
      .then((results) => {
        if (!active) return;
        setDatabaseViewNames(Object.fromEntries(results.map(([databaseId, views]) => [
          databaseId,
          views.map(({ id, name }) => ({ id, name })),
        ])));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [databases]);

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
    event.dataTransfer.setData('text/plain', rootRows[index]?.id ?? '');
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
    const next = [...rootRows];
    const [moved] = next.splice(draggedIndex, 1);
    if (moved) {
      const adjustedTarget = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
      const insertAt = Math.max(0, adjustedTarget + (dragOverEdge === 'after' ? 1 : 0));
      next.splice(insertAt, 0, moved);
      const destination = rootRows[targetIndex];
      let parentNodeId: string | null = null;
      if (destination && destination.depth > 0) {
        for (let i = targetIndex - 1; i >= 0; i--) {
          if (rootRows[i]!.depth < destination.depth) { parentNodeId = rootRows[i]!.id; break; }
        }
      }
      if (parentNodeId !== moved.id) onReorderNodes(next.map(r => r.id), moved.id, parentNodeId);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  function moveNode(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rootRows.length) return;
    const next = [...rootRows];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    onReorderNodes(next.map(r => r.id));
  }

  const workspaceRows = useMemo<readonly WorkspaceRow[]>(() => {
    const pageIds = new Set(customPages.map(({ id }) => id));
    const embeddedDatabaseParent = new Map<string, string>();
    for (const candidate of customPages) {
      for (const block of candidate.blocks) {
        if (block.type === 'database-view' && block.databaseId) embeddedDatabaseParent.set(block.databaseId, candidate.id);
      }
    }

    const nodes = [
      ...customPages.map((candidate) => ({
        id: candidate.id,
        kind: 'page' as const,
        page: candidate,
        parentNodeId: candidate.parentNodeId,
        positionKey: candidate.positionKey ?? candidate.id,
      })),
      // A database belongs to the page it was created in: prefer the page that
      // embeds it, then its stored parent. Databases with no owning page are
      // left out entirely rather than listed alongside pages; they stay
      // reachable through search and the pages that reference them.
      ...databases.flatMap((database) => {
        const owner = embeddedDatabaseParent.get(database.id)
          ?? (pageIds.has(database.parentNodeId ?? '') ? database.parentNodeId : undefined);
        return owner
          ? [{ database, id: database.id, kind: 'database' as const, parentNodeId: owner, positionKey: database.positionKey }]
          : [];
      }),
    ];
    const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
    const childrenByParent = new Map<string, typeof nodes>();
    for (const node of nodes) {
      if (!node.parentNodeId || !nodeById.has(node.parentNodeId)) continue;
      const children = childrenByParent.get(node.parentNodeId) ?? [];
      children.push(node);
      childrenByParent.set(node.parentNodeId, children);
    }
    const sortNodes = (candidates: typeof nodes) => candidates.sort((left, right) => {
      return left.positionKey.localeCompare(right.positionKey);
    });
    for (const children of childrenByParent.values()) sortNodes(children);

    const rows: WorkspaceRow[] = [];
    const visited = new Set<string>();
    const walk = (node: (typeof nodes)[number], depth: number) => {
      if (visited.has(node.id)) return;
      visited.add(node.id);
      const childNodes = childrenByParent.get(node.id) ?? [];
      let views: readonly { id: string; name: string }[] = [];
      if (node.kind === 'database') {
        views = databaseViewNames[node.id] ?? [];
      } else {
        const legacyKind = node.page.blocks.find((block) => block.type === 'database-view' && !block.databaseId)?.databaseKind;
        const target = legacyKind === 'items' ? 'item'
          : legacyKind === 'people' ? 'person'
            : legacyKind === 'accounts' ? 'account'
              : legacyKind === 'transactions' ? 'transaction' : undefined;
        views = target ? legacyViewNames[target] ?? [] : [];
      }
      const embeddedViews = node.kind === 'page' ? node.page.blocks.flatMap((block) => block.type === 'database-view' && block.databaseId ? (databaseViewNames[block.databaseId] ?? []).map((view) => ({ ...view, databaseId: block.databaseId! })) : []) : [];
      rows.push({
        database: node.kind === 'database' ? node.database : undefined,
        depth,
        hasChildren: childNodes.length > 0 || views.length > 0 || embeddedViews.length > 0,
        id: node.id,
        kind: node.kind,
        page: node.kind === 'page' ? node.page : undefined,
      });
      if (!expandedPageIds.has(node.id)) return;
      if (node.kind === 'database') {
        for (const view of views) rows.push({ databaseId: node.id, depth: depth + 1, id: view.id, kind: 'view', name: view.name });
      }
      for (const view of embeddedViews) rows.push({ databaseId: view.databaseId, depth: depth + 1, id: view.id, kind: 'view', name: view.name });
      for (const child of childNodes) walk(child, depth + 1);
    };

    const roots = sortNodes(nodes.filter((node) => !node.parentNodeId || !nodeById.has(node.parentNodeId)));
    for (const root of roots) walk(root, 0);

    return rows;
  }, [customPages, databaseViewNames, databases, expandedPageIds, legacyViewNames]);

  const [settingsSearch, setSettingsSearch] = useState(() => {
    try { return window.localStorage.getItem('max:settings-search') || ''; } catch { return ''; }
  });
  useEffect(() => {
    try { window.localStorage.setItem('max:settings-search', settingsSearch); } catch { /* Storage may be unavailable. */ }
  }, [settingsSearch]);

  const rootRows = useMemo(() => workspaceRows.filter((r): r is WorkspaceNodeRow => r.kind !== 'view'), [workspaceRows]);

  const isRtl = locale === 'ar';
  const isSettings = page === 'settings';
  const collapseLabel = translate(locale, collapsed ? 'expandSidebar' : 'collapseSidebar');
  const CollapseIcon = collapsed
    ? (isRtl ? PanelRightOpen : PanelLeftOpen)
    : (isRtl ? PanelRightClose : PanelLeftClose);
  const settingsSections: readonly Readonly<{ icon: LucideIcon; id: SettingsSectionId; label: string }>[] = [
    { icon: Store, id: 'settings-general', label: locale === 'ar' ? 'عام' : 'General' },
    { icon: BadgeDollarSign, id: 'settings-quick-actions', label: locale === 'ar' ? 'الإجراءات السريعة' : 'Quick Actions' },
    { icon: Palette, id: 'settings-appearance', label: locale === 'ar' ? 'المظهر' : 'Appearance' },
    { icon: Database, id: 'settings-backup', label: locale === 'ar' ? 'النسخ الاحتياطي' : 'Backup' },
    { icon: Archive, id: 'settings-archive', label: locale === 'ar' ? 'الأرشيف والمهملات' : 'Archive & trash' },
    { icon: AlertTriangle, id: 'settings-danger', label: locale === 'ar' ? 'خطر' : 'Danger' },
  ];
  const filteredSettingsSections = (() => {
    const q = settingsSearch.trim().toLowerCase();
    if (!q) return settingsSections;
    return settingsSections.filter(s => s.label.toLowerCase().includes(q));
  })();

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

  const SettingsActionIcon = isSettings ? (isRtl ? ArrowRight : ArrowLeft) : Settings;
  const settingsActionLabel = translate(locale, isSettings ? 'back' : 'settings');
  const handleSettingsClick = isSettings ? onExitSettings : onOpenSettings;

  return (
    <aside className="sidebar" data-collapsed={collapsed} style={collapsed ? undefined : { width }}>
      <div className="sidebar__brand-row">
        <div aria-label="Max" className="brand" role="img">
          <img alt="" className="brand__mark" src={maxLogo} />
        </div>
        <button aria-label={collapseLabel} className="icon-button sidebar__collapse" onClick={onCollapse} type="button">
          <CollapseIcon aria-hidden="true" size={17} />
        </button>
      </div>

      <div className="sidebar__scroll">
        {isSettings ? (
          <>
            {!collapsed && (
              <div style={{ padding: '8px 14px' }}>
                <input
                  id="settings-search-input"
                  type="text"
                  autoFocus
                  placeholder={locale === 'ar' ? 'البحث في الإعدادات...' : 'Search settings...'}
                  value={settingsSearch}
                  onChange={(e) => setSettingsSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      if (settingsSearch) {
                        setSettingsSearch('');
                        e.stopPropagation();
                      } else {
                        onExitSettings();
                      }
                    }
                  }}
                  style={{
                    width: '100%',
                    background: 'var(--canvas-subtle)',
                    border: '1px solid var(--line)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '13px',
                    color: 'var(--text)',
                    marginBottom: '8px'
                  }}
                />
              </div>
            )}
            {!collapsed && <p className="sidebar__section-label">{locale === 'ar' ? 'الإعدادات' : 'Settings'}</p>}
            <nav aria-label={locale === 'ar' ? 'أقسام الإعدادات' : 'Settings sections'} className="sidebar__nav">
              {filteredSettingsSections.map(({ icon, id, label }) => (
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
                    <div className="sidebar-favorite-row" key={`favorite-${favorite.id}`}>
                      <button
                        aria-current={page === favorite.id ? 'page' : undefined}
                        aria-label={favorite.title.trim() || translate(locale, 'untitledPage')}
                        className="nav-item nav-item--favorite"
                        onClick={() => onNavigate(favorite.id)}
                        type="button"
                      >
                        <PageIconRenderer className="nav-item__custom-icon" fallback="lucide:Star" icon={favorite.icon || 'lucide:Star'} size={17} />
                        {!collapsed && <span className="nav-item__title">{favorite.title.trim() || translate(locale, 'untitledPage')}</span>}
                      </button>
                      {!collapsed && (
                        <button
                          aria-label={locale === 'ar' ? `إزالة ${favorite.title || 'الصفحة'} من المفضلة` : `Remove ${favorite.title || 'page'} from favorites`}
                          className="sidebar-favorite-remove"
                          onClick={() => onToggleFavorite(favorite.id, false)}
                          title={locale === 'ar' ? 'إزالة من المفضلة' : 'Remove from favorites'}
                          type="button"
                        >
                          <Star aria-hidden="true" fill="currentColor" size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </nav>
              </>
            )}
            {!collapsed && <p className="sidebar__section-label">{translate(locale, 'workspace')}</p>}
            <nav aria-label={translate(locale, 'workspace')} className="sidebar__nav">
              {workspaceRows.map((row, visibleIndex) => {
                if (row.kind === 'view') {
                  return (
                    <button
                      className="sidebar-view-row"
                      key={`${row.databaseId}-${row.id}`}
                      onClick={() => onNavigateView(row.databaseId, row.id)}
                      style={{ '--sidebar-tree-depth': row.depth } as React.CSSProperties}
                      type="button"
                    >
                      <span aria-hidden="true" className="sidebar-view-dot">•</span>
                      <span>{row.name}</span>
                    </button>
                  );
                }

                const p = row.page;
                const database = row.database;
                const isCurrent = page === row.id;
                const rootIndex = rootRows.findIndex(({ id }) => id === row.id);
                const isDragging = rootIndex >= 0 && draggedIndex === rootIndex;
                const isDragOver = rootIndex >= 0 && dragOverIndex === rootIndex;
                const title = database?.title ?? p?.title.trim() ?? '';
                const pageTitle = title || translate(locale, 'untitledPage');
                const icon = database?.icon ?? p?.icon ?? (row.kind === 'database' ? 'lucide:Database' : 'lucide:FileText');

                return (
                  <div
                    className="sidebar-page-tree"
                    data-drop-edge={isDragOver ? dragOverEdge : undefined}
                    draggable={rootIndex >= 0}
                    title={locale === 'ar' ? 'اسحب لإعادة الترتيب' : 'Drag to reorder'}
                    key={row.id}
                    onDragEnd={() => { setDraggedIndex(null); setDragOverIndex(null); }}
                    onDragOver={rootIndex >= 0 ? (event) => handleDragOver(event, rootIndex) : undefined}
                    onDragStart={(event) => { if (rootIndex >= 0) handleDragStart(event, rootIndex); }}
                    onDrop={rootIndex >= 0 ? (event) => { event.preventDefault(); event.stopPropagation(); handleDrop(rootIndex); } : undefined}
                    style={{ '--sidebar-tree-depth': row.depth } as React.CSSProperties}
                  >
                    <button
                      aria-current={isCurrent ? 'page' : undefined}
                      aria-label={pageTitle}
                      className="nav-item nav-item--custom-page"
                      data-drag-over={isDragOver}
                      data-dragging={isDragging}
                      onClick={() => onNavigate(row.id)}
                      onKeyDown={(event) => {
                        if (rootIndex >= 0 && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                          event.preventDefault();
                          moveNode(rootIndex, event.key === 'ArrowUp' ? -1 : 1);
                          return;
                        }
                        moveFocus(event, visibleIndex);
                      }}
                      ref={(element) => { itemRefs.current[visibleIndex] = element; }}
                      type="button"
                    >
                      <span className="nav-item__icon-slot">
                        <PageIconRenderer className="nav-item__custom-icon" fallback={row.kind === 'database' ? 'lucide:Database' : 'lucide:FileText'} icon={icon} size={18} />
                        {row.hasChildren && (
                          <span
                            aria-label={locale === 'ar' ? `إظهار محتويات ${pageTitle}` : `Show ${pageTitle} contents`}
                            aria-expanded={expandedPageIds.has(row.id)}
                            className="nav-item__expand"
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedPageIds((current) => {
                                const next = new Set(current);
                                if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                                return next;
                              });
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') return;
                              event.preventDefault();
                              event.stopPropagation();
                              setExpandedPageIds((current) => {
                                const next = new Set(current);
                                if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                                return next;
                              });
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            {expandedPageIds.has(row.id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </span>
                        )}
                      </span>
                      {!collapsed && <span className="nav-item__title">{pageTitle}</span>}
                    </button>
                    {!collapsed && p && (
                      <button aria-label={locale === 'ar' ? 'إعدادات الصفحة' : 'Page settings'} className="nav-item__menu-trigger" onClick={() => setMenuPageId(menuPageId === p.id ? undefined : p.id)} type="button">
                        <MoreHorizontal size={15} />
                      </button>
                    )}
                    {p && menuPageId === p.id && (
                      <div className="sidebar-page-menu" role="menu">
                        <button onClick={() => { setMenuPageId(undefined); setExpandedPageIds((current) => new Set(current).add(p.id)); onAddSubpage(p.id); }} role="menuitem" type="button"><Plus size={14} />{locale === 'ar' ? 'إضافة صفحة فرعية' : 'Add sub-page'}</button>
                        <button onClick={() => { setMenuPageId(undefined); onToggleFavorite(p.id, !p.favorite); }} role="menuitem" type="button"><Star fill={p.favorite ? 'currentColor' : 'none'} size={14} />{p.favorite ? (locale === 'ar' ? 'إزالة من المفضلة' : 'Remove from favorites') : (locale === 'ar' ? 'إضافة للمفضلة' : 'Add to favorites')}</button>
                        <button onClick={() => { setMenuPageId(undefined); onRenamePage(p.id, window.prompt(locale === 'ar' ? 'اسم الصفحة' : 'Page name', p.title) ?? p.title); }} role="menuitem" type="button"><Pencil size={15} />{locale === 'ar' ? 'إعادة تسمية' : 'Rename'}</button>
                        <button onClick={() => { setMenuPageId(undefined); onDuplicatePage(p.id); }} role="menuitem" type="button"><Copy size={15} />{locale === 'ar' ? 'إنشاء نسخة' : 'Duplicate'}</button>
                        <div className="sidebar-page-menu__separator" />
                        <button className="danger" onClick={() => { setMenuPageId(undefined); onDeletePage(p.id); }} role="menuitem" type="button"><Trash2 size={15} />{locale === 'ar' ? 'نقل إلى المهملات' : 'Move to trash'}</button>
                      </div>
                    )}
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
      </div>

      <div className="sidebar__footer">
        <SidebarAction
          collapsed={collapsed}
          icon={SettingsActionIcon}
          label={settingsActionLabel}
          onClick={handleSettingsClick}
          title={locale === 'ar' ? 'الإعدادات (Ctrl+, / ⌘+,)' : 'Settings (Ctrl+, / ⌘+,)'}
          shortcut={runtimePlatform === 'macos' ? '⌘ ,' : 'Ctrl ,'}
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
