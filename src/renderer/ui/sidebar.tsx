import { autoScrollDuringDrag, setDragPreview } from './drag-preview';
import { ActivitySpinner } from './activity-spinner';
import maxLogo from '../assets/max-logo.png';
import type { UpdateStatus } from '../../shared/update-contract';
import { revealSetting, searchSettings, settingsEntryLabel } from './settings-index';
import {
  AlertTriangle,
  ArrowUpCircle,
  BadgeDollarSign,
  Archive,
  ArrowLeft,
  ArrowRight,
  PanelLeft,
  PanelRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  MoreHorizontal,
  Pencil,
  Palette,
  Plus,
  Search,
  Settings,
  Star,
  LayoutGrid,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import type { AppPage, CustomPage, SettingsSectionId } from '../app/app-types';
import { type Locale, translate } from '../app/i18n';
import type { NavigationItem } from '../../shared/workspace-contract';
import { PageIconRenderer } from './page-icon-renderer';
import { byKey, orderFavorites, planFavoriteMove, planMove, planStep, type DropEdge, type NodeMove, type TreeNode } from '../../shared/tree-order';
import { readSidebarExpanded, writeSidebarExpanded } from '../app/preferences';

type SidebarProps = Readonly<{
  collapsed: boolean;
  customPages: readonly CustomPage[];
  databases: readonly NavigationItem[];
  locale: Locale;
  onExitSettings: () => void;
  onAddCustomPage: () => void;
  onAddSubpage: (parentId: string) => void;
  onCollapse: () => void;
  onDeletePage: (id: string) => void | Promise<boolean>;
  onDuplicatePage: (id: string) => void;
  onNavigate: (page: AppPage) => void;
  onNavigateView: (databaseId: string, viewId: string) => void;
  onOpenSettings: () => void;
  /** Renames a page or a database. */
  onRenamePage: (id: string, title: string) => void;
  onRestoreNode?: (id: string) => void | Promise<unknown>;
  onReorderFavorites?: (keys: ReadonlyMap<string, string>) => void;
  onResize: (width: number) => void;
  onSettingsSectionChange: (section: SettingsSectionId) => void;
  onToggleFavorite: (id: string, favorite: boolean) => void;
  /** Writes planned position changes; usually one node with a fractional key. */
  onMoveNodes: (moves: readonly NodeMove[]) => void;
  onUpdateClick?: () => void;
  page: AppPage;
  settingsSection: SettingsSectionId;
  updateState?: UpdateStatus;
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
  onMoveNodes,
  onReorderFavorites,
  onRestoreNode,
  onUpdateClick,
  page,
  settingsSection,
  updateState,
  width,
  runtimePlatform,
}: SidebarProps) {
  const [dragged, setDragged] = useState<Readonly<{ id: string; list: 'favorites' | 'tree' }>>();
  const [dropTarget, setDropTarget] = useState<Readonly<{ edge: DropEdge; id: string }>>();
  const [expandedPageIds, setExpandedPageIds] = useState<ReadonlySet<string>>(() => readSidebarExpanded(window.localStorage));
  // The menu is keyed by list as well as id: a favourite and its tree row are two places.
  const [menu, setMenu] = useState<Readonly<{ id: string; list: 'favorites' | 'tree' }>>();
  const [trashed, setTrashed] = useState<Readonly<{ id: string; title: string }>>();
  // Renaming happens in the row itself. It used to call window.prompt, which
  // Electron does not implement: the dialog never appeared, the call returned
  // null, and the menu item looked like it simply did nothing.
  const [renamingPageId, setRenamingPageId] = useState<string>();
  const [renameDraft, setRenameDraft] = useState('');
  const [legacyViewNames, setLegacyViewNames] = useState<Readonly<Record<string, readonly { id: string; name: string }[]>>>({});
  const [databaseViewNames, setDatabaseViewNames] = useState<Readonly<Record<string, readonly { id: string; name: string }[]>>>({});
  const resizeStartRef = useRef<{ pointerId: number; startWidth: number; startX: number } | undefined>(undefined);

  const favoritePages = orderFavorites(customPages.filter((candidate) => candidate.favorite));
  const updateBusy = updateState && ['checking', 'downloading', 'installing'].includes(updateState.state);
  const updateLabel = updateState?.state === 'checking' ? (locale === 'ar' ? 'جارٍ البحث…' : 'Checking for updates…')
    : updateState?.state === 'installing' ? (locale === 'ar' ? 'جارٍ إعادة التشغيل…' : 'Restarting to install…')
      : updateState?.state === 'error' ? (locale === 'ar' ? 'تعذر التحديث · إعادة المحاولة' : 'Update failed · Retry')
        : updateState?.state === 'downloading' ? (locale === 'ar' ? 'جارٍ التنزيل…' : 'Downloading…')
          : updateState?.state === 'ready' ? (locale === 'ar' ? 'تحديث جاهز' : 'Update ready')
            : (locale === 'ar' ? `${updateState?.availableVersion ?? ''} متاح` : `${updateState?.availableVersion ?? ''} available`);

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
    if (!menu) return;
    const closeOnPointerDown = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('.sidebar-page-menu, .nav-item__menu-trigger')) return;
      setMenu(undefined);
    };
    document.addEventListener('mousedown', closeOnPointerDown);
    return () => document.removeEventListener('mousedown', closeOnPointerDown);
  }, [menu]);

  useEffect(() => { writeSidebarExpanded(window.localStorage, expandedPageIds); }, [expandedPageIds]);

  function toggleExpanded(id: string, open?: boolean) {
    setExpandedPageIds((current) => {
      const isOpen = current.has(id);
      if (open === isOpen) return current;
      const next = new Set(current);
      if (isOpen) next.delete(id); else next.add(id);
      return next;
    });
  }

  function focusRow(selector: string) {
    requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus());
  }

  function closeMenu(returnFocus: boolean) {
    const current = menu;
    setMenu(undefined);
    if (returnFocus && current) focusRow(current.list === 'favorites' ? `[data-sidebar-favorite="${current.id}"]` : `[data-sidebar-row="${current.id}"]`);
  }

  async function moveToTrash(id: string, title: string) {
    const moved = await onDeletePage(id);
    if (moved !== false) setTrashed({ id, title });
  }



  function moveFocus(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowDown', 'ArrowUp', 'End', 'Home'].includes(event.key)) return;
    const items = [...(event.currentTarget.closest('.sidebar__scroll')?.querySelectorAll<HTMLButtonElement>('[data-sidebar-row], [data-sidebar-favorite]') ?? [])];
    const index = items.indexOf(event.currentTarget);
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

  function dropEdge(event: React.DragEvent, allowInside: boolean): DropEdge {
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = (event.clientY - rect.top) / Math.max(1, rect.height);
    if (allowInside && offset > .25 && offset < .75) return 'inside';
    return offset >= .5 ? 'after' : 'before';
  }

  function handleDragStart(event: React.DragEvent, id: string, list: 'favorites' | 'tree') {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setDragPreview(event.dataTransfer, event.currentTarget as HTMLElement);
    setDragged({ id, list });
  }

  function handleDragOver(event: React.DragEvent, id: string, list: 'favorites' | 'tree', allowInside: boolean) {
    if (dragged?.list !== list) return;
    event.preventDefault();
    autoScrollDuringDrag(event.currentTarget as HTMLElement, event.clientY);
    event.dataTransfer.dropEffect = 'move';
    const edge = dropEdge(event, allowInside && list === 'tree');
    if (dropTarget?.id !== id || dropTarget.edge !== edge) setDropTarget({ edge, id });
  }

  function endDrag() { setDragged(undefined); setDropTarget(undefined); }

  function handleDrop(targetId: string) {
    const source = dragged;
    const target = dropTarget;
    endDrag();
    if (!source || !target || source.id === targetId) return;
    if (source.list === 'favorites') {
      if (target.edge === 'inside') return;
      const keys = planFavoriteMove(favoritePages, source.id, targetId, target.edge);
      if (keys.size) onReorderFavorites?.(keys);
      return;
    }
    const moves = planMove(treeNodes, source.id, targetId, target.edge);
    if (moves.length) {
      if (target.edge === 'inside') toggleExpanded(targetId, true);
      onMoveNodes(moves);
    }
  }

  function stepNode(id: string, direction: -1 | 1) {
    const moves = planStep(treeNodes, id, direction);
    if (moves.length) onMoveNodes(moves);
    focusRow(`[data-sidebar-row="${id}"]`);
  }

  function stepFavorite(id: string, direction: -1 | 1) {
    const index = favoritePages.findIndex((favorite) => favorite.id === id);
    const neighbour = favoritePages[index + direction];
    if (!neighbour) return;
    const keys = planFavoriteMove(favoritePages, id, neighbour.id, direction < 0 ? 'before' : 'after');
    if (keys.size) onReorderFavorites?.(keys);
    focusRow(`[data-sidebar-favorite="${id}"]`);
  }

  /** Up and Down walk the rows, Right and Left open and close a row (mirrored in Arabic), Alt+Up and Alt+Down move it. */
  function rowKeyDown(event: KeyboardEvent<HTMLButtonElement>, row: Readonly<{ id: string; hasChildren?: boolean; list: 'favorites' | 'tree' }>) {
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const direction = event.key === 'ArrowUp' ? -1 : 1;
      if (row.list === 'favorites') stepFavorite(row.id, direction); else stepNode(row.id, direction);
      return;
    }
    if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
      event.preventDefault();
      setMenu({ id: row.id, list: row.list });
      return;
    }
    if (row.list === 'tree' && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      const opening = (event.key === 'ArrowRight') !== (locale === 'ar');
      if (row.hasChildren) { event.preventDefault(); toggleExpanded(row.id, opening); }
      return;
    }
    moveFocus(event);
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
    const sortNodes = (candidates: typeof nodes) => candidates.sort(byKey);
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

  // The box starts empty every time settings open. A query kept from a previous
  // session would hide most of the settings behind a filter nobody typed.
  const [settingsSearch, setSettingsSearch] = useState('');

  /** Every page and owned database with its effective parent, for planning moves. */
  const treeNodes = useMemo<readonly TreeNode[]>(() => {
    const pageIds = new Set(customPages.map(({ id }) => id));
    const owners = new Map<string, string>();
    for (const candidate of customPages) for (const block of candidate.blocks) if (block.type === 'database-view' && block.databaseId) owners.set(block.databaseId, candidate.id);
    return [
      ...customPages.map((candidate) => ({ id: candidate.id, kind: 'page' as const, parentNodeId: candidate.parentNodeId ?? null, positionKey: candidate.positionKey ?? candidate.id })),
      ...databases.flatMap((database) => {
        const owner = owners.get(database.id) ?? (pageIds.has(database.parentNodeId ?? '') ? database.parentNodeId : undefined);
        return owner ? [{ id: database.id, kind: 'database' as const, parentNodeId: owner, positionKey: database.positionKey }] : [];
      }),
    ];
  }, [customPages, databases]);

  // Opening a nested page reveals it: its ancestors expand.
  useEffect(() => {
    const parentOf = new Map(treeNodes.map((node) => [node.id, node.parentNodeId ?? null] as const));
    const ancestors: string[] = [];
    for (let current = parentOf.get(page) ?? null; current && !ancestors.includes(current); current = parentOf.get(current) ?? null) ancestors.push(current);
    if (ancestors.some((id) => !expandedPageIds.has(id))) setExpandedPageIds((current) => new Set([...current, ...ancestors]));
    // Only a change of page should reveal it; collapsing afterwards is the reader's choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, treeNodes]);

  const isRtl = locale === 'ar';
  const isSettings = page === 'settings';
  const collapseLabel = translate(locale, collapsed ? 'expandSidebar' : 'collapseSidebar');
  const CollapseIcon = isRtl ? PanelRight : PanelLeft;
  const settingsSections: readonly Readonly<{ icon: LucideIcon; id: SettingsSectionId; label: string }>[] = [
    { icon: LayoutGrid, id: 'settings-general', label: locale === 'ar' ? 'عام' : 'General' },
    { icon: BadgeDollarSign, id: 'settings-quick-actions', label: locale === 'ar' ? 'الإجراءات السريعة' : 'Quick Actions' },
    { icon: Palette, id: 'settings-appearance', label: locale === 'ar' ? 'المظهر' : 'Appearance' },
    { icon: Database, id: 'settings-backup', label: locale === 'ar' ? 'النسخ الاحتياطي' : 'Backup' },
    { icon: Archive, id: 'settings-archive', label: locale === 'ar' ? 'الأرشيف والمهملات' : 'Archive & trash' },
    { icon: AlertTriangle, id: 'settings-danger', label: locale === 'ar' ? 'خطر' : 'Danger' },
  ];
  // Searching looks through the settings themselves, not the six section
  // names: typing "language" or "trash" should land on that row.
  const settingsResults = searchSettings(settingsSearch, locale);
  const searchingSettings = settingsSearch.trim().length > 0;

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

  /**
   * One menu for every sidebar row. Pages, favourites and databases share it
   * and show the actions that apply to them.
   */
  function renderMenu(item: Readonly<{ id: string; kind: 'database' | 'page'; page?: CustomPage; title: string }>) {
    const ar = locale === 'ar';
    const p = item.page;
    const actions = [
      ...(p ? [{ icon: Plus, id: 'subpage', label: ar ? 'إضافة صفحة فرعية' : 'Add sub-page', run: () => { toggleExpanded(item.id, true); onAddSubpage(item.id); } }] : []),
      ...(p ? [{ icon: Star, id: 'favorite', label: p.favorite ? (ar ? 'إزالة من المفضلة' : 'Remove from favorites') : (ar ? 'إضافة للمفضلة' : 'Add to favorites'), run: () => onToggleFavorite(item.id, !p.favorite) }] : []),
      { icon: Pencil, id: 'rename', label: ar ? 'إعادة تسمية' : 'Rename', run: () => { setRenameDraft(item.kind === 'page' ? (p?.title ?? '') : item.title); setRenamingPageId(item.id); } },
      ...(p ? [{ icon: Copy, id: 'duplicate', label: ar ? 'إنشاء نسخة' : 'Duplicate', run: () => onDuplicatePage(item.id) }] : []),
      { danger: true, icon: Trash2, id: 'trash', label: ar ? 'نقل إلى المهملات' : 'Move to Trash', run: () => { void moveToTrash(item.id, item.title); } },
    ];
    return (
      <div
        aria-label={item.title}
        className="sidebar-page-menu"
        onKeyDown={(event) => {
          const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitem]')];
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(true); }
          else if (event.key === 'Tab') closeMenu(false);
          else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
          else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); items[event.key === 'Home' ? 0 : items.length - 1]?.focus(); }
        }}
        ref={(element) => { if (element && !element.contains(document.activeElement)) element.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus(); }}
        role="menu"
      >
        {actions.map(({ danger, icon: Icon, id, label, run }) => <Fragment key={id}>
          {danger && <div className="sidebar-page-menu__separator" role="separator" />}
          <button className={danger ? 'danger' : undefined} onClick={() => { closeMenu(id !== 'rename'); run(); }} role="menuitem" tabIndex={-1} type="button">
            <Icon fill={id === 'favorite' && p?.favorite ? 'currentColor' : 'none'} size={14} />{label}
          </button>
        </Fragment>)}
      </div>
    );
  }

  return (
    <aside className="sidebar" data-collapsed={collapsed} style={collapsed ? undefined : { width }}>
      <div className="sidebar__brand-row">
        <div aria-label="Max" className="brand" role="img">
          <img alt="" className="brand__mark" src={maxLogo} />
        </div>
        <button aria-label={collapseLabel} aria-keyshortcuts={`${runtimePlatform === 'macos' ? 'Meta' : 'Control'}+b`} title={`${collapseLabel} (${runtimePlatform === 'macos' ? '⌘' : 'Ctrl'} B)`} className="icon-button sidebar__collapse" onClick={onCollapse} type="button">
          <CollapseIcon aria-hidden="true" size={17} />
        </button>
      </div>

      <div className="sidebar__scroll">
        {isSettings ? (
          <>
            {!collapsed && (
              <div className="sidebar__settings-search">
                <Search aria-hidden="true" size={14} />
                <input
                  id="settings-search-input"
                  type="text"
                  aria-label={locale === 'ar' ? 'البحث في الإعدادات' : 'Search settings'}
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
                />
              </div>
            )}
            {!collapsed && <p className="sidebar__section-label">{searchingSettings ? (locale === 'ar' ? 'النتائج' : 'Results') : (locale === 'ar' ? 'الإعدادات' : 'Settings')}</p>}
            {searchingSettings && !collapsed ? (
              <nav aria-label={locale === 'ar' ? 'نتائج البحث في الإعدادات' : 'Settings search results'} className="sidebar__nav sidebar__nav--settings-results">
                {settingsResults.length === 0 && <p className="sidebar__empty-search">{locale === 'ar' ? 'لا توجد نتائج.' : 'No settings found.'}</p>}
                {settingsResults.map((entry) => {
                  const section = settingsSections.find(({ id }) => id === entry.section);
                  return (
                    <button
                      className="nav-item settings-result"
                      key={entry.id}
                      onClick={() => { onSettingsSectionChange(entry.section); revealSetting(entry.id); }}
                      type="button"
                    >
                      <span className="settings-result__label">{settingsEntryLabel(entry, locale)}</span>
                      <span className="settings-result__section">{section?.label}</span>
                    </button>
                  );
                })}
              </nav>
            ) : (
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
            )}
          </>
        ) : (
          <>
            {favoritePages.length > 0 && (
              <>
                {!collapsed && <p className="sidebar__section-label">{locale === 'ar' ? 'المفضلة' : 'Favorites'}</p>}
                <nav aria-label={locale === 'ar' ? 'المفضلة' : 'Favorites'} className="sidebar__nav sidebar__nav--favorites">
                  {favoritePages.map((favorite) => {
                    const favoriteTitle = favorite.title.trim() || translate(locale, 'untitledPage');
                    const isDragOver = dragged?.list === 'favorites' && dropTarget?.id === favorite.id;
                    return (
                      <div
                        className="sidebar-favorite-row"
                        data-drop-edge={isDragOver ? dropTarget.edge : undefined}
                        draggable
                        key={`favorite-${favorite.id}`}
                        onContextMenu={(event) => { event.preventDefault(); setMenu({ id: favorite.id, list: 'favorites' }); }}
                        onDragEnd={endDrag}
                        onDragOver={(event) => handleDragOver(event, favorite.id, 'favorites', false)}
                        onDragStart={(event) => handleDragStart(event, favorite.id, 'favorites')}
                        onDrop={(event) => { event.preventDefault(); event.stopPropagation(); handleDrop(favorite.id); }}
                      >
                        <button
                          aria-current={page === favorite.id ? 'page' : undefined}
                          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Shift+F10"
                          aria-label={favoriteTitle}
                          className="nav-item nav-item--favorite"
                          data-dragging={dragged?.id === favorite.id && dragged.list === 'favorites'}
                          data-sidebar-favorite={favorite.id}
                          onClick={() => onNavigate(favorite.id)}
                          onKeyDown={(event) => rowKeyDown(event, { id: favorite.id, list: 'favorites' })}
                          type="button"
                        >
                          <PageIconRenderer className="nav-item__custom-icon" fallback="lucide:Star" icon={favorite.icon || 'lucide:Star'} size={17} />
                          {!collapsed && <span className="nav-item__title">{favoriteTitle}</span>}
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
                        {menu?.list === 'favorites' && menu.id === favorite.id && renderMenu({ id: favorite.id, kind: 'page', page: favorite, title: favoriteTitle })}
                      </div>
                    );
                  })}
                </nav>
              </>
            )}
            {!collapsed && <p className="sidebar__section-label">{translate(locale, 'workspace')}</p>}
            <nav aria-label={translate(locale, 'workspace')} className="sidebar__nav">
              {workspaceRows.map((row) => {
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
                const isDragging = dragged?.list === 'tree' && dragged.id === row.id;
                const isDragOver = dragged?.list === 'tree' && dropTarget?.id === row.id;
                const title = database?.title ?? p?.title.trim() ?? '';
                const pageTitle = title || translate(locale, 'untitledPage');
                const icon = database?.icon ?? p?.icon ?? (row.kind === 'database' ? 'lucide:Database' : 'lucide:FileText');
                const expanded = expandedPageIds.has(row.id);
                const renaming = renamingPageId === row.id;

                return (
                  <div
                    className="sidebar-page-tree"
                    data-drop-edge={isDragOver ? dropTarget.edge : undefined}
                    draggable={!renaming}
                    title={locale === 'ar' ? 'اسحب لإعادة الترتيب أو إلى داخل صفحة' : 'Drag to reorder, or onto a page to nest it'}
                    key={row.id}
                    onContextMenu={(event) => { event.preventDefault(); setMenu({ id: row.id, list: 'tree' }); }}
                    onDragEnd={endDrag}
                    onDragOver={(event) => handleDragOver(event, row.id, 'tree', row.kind === 'page')}
                    onDragStart={(event) => handleDragStart(event, row.id, 'tree')}
                    onDrop={(event) => { event.preventDefault(); event.stopPropagation(); handleDrop(row.id); }}
                    style={{ '--sidebar-tree-depth': row.depth } as React.CSSProperties}
                  >
                    <button
                      aria-current={isCurrent ? 'page' : undefined}
                      aria-expanded={row.hasChildren ? expanded : undefined}
                      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Shift+F10"
                      aria-label={pageTitle}
                      className="nav-item nav-item--custom-page"
                      data-drag-over={isDragOver}
                      data-dragging={isDragging}
                      data-sidebar-row={row.id}
                      onClick={() => onNavigate(row.id)}
                      onKeyDown={(event) => rowKeyDown(event, { hasChildren: row.hasChildren, id: row.id, list: 'tree' })}
                      type="button"
                    >
                      <span className="nav-item__icon-slot">
                        <PageIconRenderer className="nav-item__custom-icon" fallback={row.kind === 'database' ? 'lucide:Database' : 'lucide:FileText'} icon={icon} size={18} />
                        {row.hasChildren && (
                          // Pointer shortcut only: the row button carries aria-expanded and answers Right and Left.
                          <span
                            aria-hidden="true"
                            className="nav-item__expand"
                            onClick={(event) => { event.stopPropagation(); toggleExpanded(row.id); }}
                          >
                            {expanded ? <ChevronDown size={15} /> : (locale === 'ar' ? <ChevronLeft size={15} /> : <ChevronRight size={15} />)}
                          </span>
                        )}
                      </span>
                      {!collapsed && (renaming
                        ? <input
                            aria-label={row.kind === 'database' ? (locale === 'ar' ? 'اسم قاعدة البيانات' : 'Database name') : (locale === 'ar' ? 'اسم الصفحة' : 'Page name')}
                            autoFocus
                            className="nav-item__rename"
                            onBlur={() => { onRenamePage(row.id, renameDraft.trim() || title); setRenamingPageId(undefined); }}
                            onChange={(event) => setRenameDraft(event.target.value)}
                            onClick={(event) => { event.stopPropagation(); event.preventDefault(); }}
                            onKeyDown={(event) => {
                              event.stopPropagation();
                              if (event.key === 'Enter') { event.preventDefault(); onRenamePage(row.id, renameDraft.trim() || title); setRenamingPageId(undefined); focusRow(`[data-sidebar-row="${row.id}"]`); }
                              if (event.key === 'Escape') { event.preventDefault(); setRenamingPageId(undefined); focusRow(`[data-sidebar-row="${row.id}"]`); }
                            }}
                            value={renameDraft}
                          />
                        : <span className="nav-item__title">{pageTitle}</span>)}
                    </button>
                    {!collapsed && (
                      <button
                        aria-expanded={menu?.list === 'tree' && menu.id === row.id}
                        aria-haspopup="menu"
                        aria-label={row.kind === 'database' ? (locale === 'ar' ? `خيارات ${pageTitle}` : `${pageTitle} options`) : (locale === 'ar' ? 'إعدادات الصفحة' : 'Page settings')}
                        className="nav-item__menu-trigger"
                        onClick={() => setMenu(menu?.list === 'tree' && menu.id === row.id ? undefined : { id: row.id, list: 'tree' })}
                        type="button"
                      >
                        <MoreHorizontal size={15} />
                      </button>
                    )}
                    {menu?.list === 'tree' && menu.id === row.id && renderMenu({ id: row.id, kind: row.kind, page: p, title: pageTitle })}
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
            {trashed && (
              <div className="sidebar-trash-notice" role="status">
                <span>{locale === 'ar' ? `نُقلت «${trashed.title}» إلى المهملات` : `"${trashed.title}" moved to Trash`}</span>
                {onRestoreNode && <button type="button" onClick={() => { const { id } = trashed; setTrashed(undefined); void onRestoreNode(id); }}>{locale === 'ar' ? 'تراجع' : 'Undo'}</button>}
                <button type="button" aria-label={locale === 'ar' ? 'إغلاق' : 'Dismiss'} onClick={() => setTrashed(undefined)}><X aria-hidden="true" size={13} /></button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="sidebar__footer">
        {updateState && ['checking', 'available', 'downloading', 'ready', 'installing', 'error'].includes(updateState.state) && onUpdateClick && (
          <button type="button" aria-label={updateLabel} title={updateLabel} aria-busy={updateBusy} className={`sidebar-action sidebar-update${updateState.state === 'ready' ? ' sidebar-update--ready' : ''}`} onClick={onUpdateClick}>
            {updateBusy
              ? <ActivitySpinner size={17} />
              : <ArrowUpCircle aria-hidden="true" size={17} />}
            {!collapsed && <span className="sidebar-action__label">
              {updateLabel}
            </span>}
          </button>
        )}
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
          onDoubleClick={() => onResize(270)}
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
