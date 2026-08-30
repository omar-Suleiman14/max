import {
  ArrowUpDown,
  Bookmark,
  ChevronDown,
  Filter,
  FileText,
  Plus,
  SlidersHorizontal,
  TableProperties,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import type {
  SavedView,
  SavedViewDraft,
  ViewFilterRule,
  ViewSortRule,
  ViewTargetKind,
} from '../../shared/views-search-contract';
import type { Locale } from '../app/i18n';
import { viewsCopy } from './views-i18n';

type ViewBarProps = Readonly<{
  activeFilterRules: readonly ViewFilterRule[];
  activeSortRules: readonly ViewSortRule[];
  filterOpen: boolean;
  locale: Locale;
  onApplyView: (view?: SavedView) => void;
  onCreateRecord?: () => void;
  onOpenProperties?: () => void;
  onOpenTemplates?: () => void;
  onToggleFilter: () => void;
  onToggleSort: () => void;
  onViewsChanged?: () => void;
  selectedViewId?: string;
  sortOpen: boolean;
  targetKind: ViewTargetKind;
}>;

export function ViewBar({
  activeFilterRules,
  activeSortRules,
  filterOpen,
  locale,
  onApplyView,
  onCreateRecord,
  onOpenProperties,
  onOpenTemplates,
  onToggleFilter,
  onToggleSort,
  onViewsChanged,
  selectedViewId,
  sortOpen,
  targetKind,
}: ViewBarProps) {
  const [views, setViews] = useState<readonly SavedView[]>([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [viewMenuId, setViewMenuId] = useState<string>();
  const [viewMenuPosition, setViewMenuPosition] = useState<{ left: number; top: number }>();
  const [editingViewId, setEditingViewId] = useState<string>();
  const [editingName, setEditingName] = useState('');
  const defaultNameKey = `max:default-view-name:${targetKind}`;
  const [defaultViewName, setDefaultViewName] = useState(
    () => window.localStorage.getItem(defaultNameKey) || viewsCopy(locale, 'defaultView'),
  );

  const loadViews = useCallback(async () => {
    try {
      const vList = await window.maxApi.views.list(targetKind);
      setViews(vList);
    } catch {
      // ignore
    }
  }, [targetKind]);

  useEffect(() => {
    void loadViews();
  }, [loadViews]);

  async function handleSaveView(e: FormEvent) {
    e.preventDefault();
    const name = viewName.trim();
    if (!name) {
      setError(locale === 'ar' ? 'اكتب اسمًا لطريقة العرض.' : 'Enter a view name.');
      return;
    }

    setSaving(true);
    setError(undefined);

    const draft: SavedViewDraft = {
      filterRules: activeFilterRules,
      name,
      sortRules: activeSortRules,
      targetKind,
    };

    const res = await window.maxApi.views.create(draft);
    setSaving(false);
    if (res.ok) {
      setViewName('');
      setSaveModalOpen(false);
      await loadViews();
      onViewsChanged?.();
      onApplyView(res.value);
    } else {
      setError(res.error.message);
    }
  }

  async function handleDeleteView(id: string) {
    await window.maxApi.views.archive(id);
    await loadViews();
    onViewsChanged?.();
    if (selectedViewId === id) {
      onApplyView(undefined);
    }
  }

  async function commitViewName(id: string) {
    const name = editingName.trim();
    if (!name) return;
    if (id === 'default') {
      window.localStorage.setItem(defaultNameKey, name);
      setDefaultViewName(name);
    } else {
      const current = views.find((view) => view.id === id);
      if (!current) return;
      await window.maxApi.views.update(id, {
        filterRules: current.filterRules,
        groupByPropertyId: current.groupByPropertyId,
        name,
        position: current.position,
        sortRules: current.sortRules,
        targetKind: current.targetKind,
      });
      await loadViews();
      onViewsChanged?.();
    }
    setEditingViewId(undefined);
    setEditingName('');
  }

  const hasFilterRules = activeFilterRules.length > 0;
  const hasSortRules = activeSortRules.length > 0;

  function toggleViewMenu(id: string, target: HTMLButtonElement) {
    if (viewMenuId === id) {
      setViewMenuId(undefined);
      return;
    }
    const rect = target.getBoundingClientRect();
    setViewMenuPosition({ left: Math.min(rect.left, window.innerWidth - 185), top: rect.bottom + 4 });
    setViewMenuId(id);
  }

  return (
    <div className="notion-view-bar">
      {/* Left side: View Tabs */}
      <div className="notion-view-bar__tabs">
        <div className="notion-view-tab-wrapper">
          <button className="notion-view-tab" data-active={!selectedViewId} onClick={() => onApplyView(undefined)} onDoubleClick={() => { setEditingViewId('default'); setEditingName(defaultViewName); }} type="button">
            <TableProperties aria-hidden="true" size={14} />
            {editingViewId === 'default' ? <input autoFocus className="notion-view-name-input" onBlur={() => void commitViewName('default')} onChange={(event) => setEditingName(event.target.value)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Enter') void commitViewName('default'); if (event.key === 'Escape') setEditingViewId(undefined); }} value={editingName} /> : <span>{defaultViewName}</span>}
          </button>
          <button aria-label={locale === 'ar' ? 'خيارات العرض' : 'View options'} className="notion-view-tab-menu" onClick={(event) => toggleViewMenu('default', event.currentTarget)} type="button"><ChevronDown size={12} /></button>
        </div>

        {views.map((v) => (
          <div key={v.id} className="notion-view-tab-wrapper">
            <button
              className="notion-view-tab"
              data-active={selectedViewId === v.id}
              onClick={() => onApplyView(v)}
              type="button"
            >
              <Bookmark aria-hidden="true" size={13} />
              {editingViewId === v.id ? <input autoFocus className="notion-view-name-input" onBlur={() => void commitViewName(v.id)} onChange={(event) => setEditingName(event.target.value)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Enter') void commitViewName(v.id); if (event.key === 'Escape') setEditingViewId(undefined); }} value={editingName} /> : <span>{v.name}</span>}
            </button>
            <button
              aria-label={`${locale === 'ar' ? 'خيارات العرض' : 'View options'}: ${v.name}`}
              className="notion-view-tab-menu"
              onClick={(event) => toggleViewMenu(v.id, event.currentTarget)}
              type="button"
            >
              <ChevronDown aria-hidden="true" size={12} />
            </button>
          </div>
        ))}

        <button
          aria-label={viewsCopy(locale, 'createView')}
          className="notion-view-tab-add"
          onClick={() => setSaveModalOpen(true)}
          title={viewsCopy(locale, 'createView')}
          type="button"
        >
          <Plus aria-hidden="true" size={14} />
        </button>
      </div>

      {/* Right side: Action Tools + Blue New Button */}
      <div className="notion-view-bar__actions">
        <button
          aria-expanded={filterOpen}
          className="notion-db-tool-btn"
          data-active={hasFilterRules || filterOpen}
          onClick={onToggleFilter}
          title={viewsCopy(locale, 'filterBy')}
          type="button"
        >
          <Filter aria-hidden="true" size={14} />
          <span>{viewsCopy(locale, 'filterBy')}</span>
          {hasFilterRules && <span className="notion-db-badge">{activeFilterRules.length}</span>}
        </button>

        <button
          aria-expanded={sortOpen}
          className="notion-db-tool-btn"
          data-active={hasSortRules || sortOpen}
          onClick={onToggleSort}
          title={viewsCopy(locale, 'sortBy')}
          type="button"
        >
          <ArrowUpDown aria-hidden="true" size={14} />
          <span>{viewsCopy(locale, 'sortBy')}</span>
          {hasSortRules && <span className="notion-db-badge">{activeSortRules.length}</span>}
        </button>

        {onOpenProperties && (
          <button
            aria-label={locale === 'ar' ? 'خيارات الخصائص' : 'Database properties'}
            className="notion-db-tool-btn"
            onClick={onOpenProperties}
            title={locale === 'ar' ? 'الخصائص' : 'Properties'}
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" size={14} />
            <span>{locale === 'ar' ? 'الخصائص' : 'Properties'}</span>
          </button>
        )}
        {onOpenTemplates && (
          <button className="notion-db-tool-btn" onClick={onOpenTemplates} title={locale === 'ar' ? 'القوالب' : 'Templates'} type="button"><FileText aria-hidden="true" size={14} /><span>{locale === 'ar' ? 'القوالب' : 'Templates'}</span></button>
        )}

        {(hasFilterRules || hasSortRules) && !selectedViewId && (
          <button
            className="notion-db-save-btn"
            onClick={() => setSaveModalOpen(true)}
            type="button"
          >
            {viewsCopy(locale, 'createView')}
          </button>
        )}

        {/* Notion Blue Split New Button */}
        {onCreateRecord && (
          <div className="notion-db-new-split-btn">
            <button
              className="notion-db-new-btn"
              onClick={onCreateRecord}
              type="button"
            >
              <span>{locale === 'ar' ? 'جديد' : 'New'}</span>
            </button>
            <button
              aria-label="New options"
              className="notion-db-new-dropdown-btn"
              onClick={onCreateRecord}
              type="button"
            >
              <ChevronDown size={13} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>

      {saveModalOpen && (
        <div aria-labelledby="view-dialog-title" className="notion-save-view-popover" role="dialog">
            <form onSubmit={(e) => void handleSaveView(e)}>
              <label htmlFor="view-name-input" id="view-dialog-title">{viewsCopy(locale, 'createView')}</label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="notion-save-view-popover__row">
                <input autoFocus id="view-name-input" onChange={(e) => { setViewName(e.target.value); setError(undefined); }} onKeyDown={(e) => { if (e.key === 'Escape') setSaveModalOpen(false); }} placeholder={viewsCopy(locale, 'name')} value={viewName} />
                <button disabled={saving || !viewName.trim()} type="submit">{saving ? '…' : viewsCopy(locale, 'save')}</button>
              </div>
            </form>
        </div>
      )}
      {viewMenuId && viewMenuPosition && createPortal(
        <div className="notion-view-menu notion-view-menu--floating" role="menu" style={viewMenuPosition}>
          <button onClick={() => {
            const view = views.find((candidate) => candidate.id === viewMenuId);
            setEditingName(view?.name ?? defaultViewName);
            setEditingViewId(viewMenuId);
            setViewMenuId(undefined);
          }} role="menuitem" type="button">{locale === 'ar' ? 'إعادة تسمية' : 'Rename'}</button>
          {viewMenuId !== 'default' && <button className="danger" onClick={() => { const id = viewMenuId; setViewMenuId(undefined); void handleDeleteView(id); }} role="menuitem" type="button">{viewsCopy(locale, 'deleteView')}</button>}
        </div>,
        document.body,
      )}
    </div>
  );
}
