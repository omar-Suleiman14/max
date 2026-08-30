import {
  ArrowUpDown,
  Bookmark,
  ChevronDown,
  Filter,
  Layers,
  Plus,
  SlidersHorizontal,
  TableProperties,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import type {
  SavedView,
  SavedViewDraft,
  ViewFilterRule,
  ViewSortRule,
  ViewTargetKind,
} from '../../shared/views-search-contract';
import type { Locale } from '../app/i18n';
import { Button } from '../ui/button';
import { FocusedOverlay } from '../ui/focused-overlay';
import { viewsCopy } from './views-i18n';

type ViewBarProps = Readonly<{
  activeFilterRules: readonly ViewFilterRule[];
  activeGroupBy?: string;
  activeSortRules: readonly ViewSortRule[];
  filterOpen: boolean;
  groupByOpen?: boolean;
  locale: Locale;
  onApplyView: (view?: SavedView) => void;
  onCreateRecord?: () => void;
  onOpenProperties?: () => void;
  onToggleFilter: () => void;
  onToggleGroupBy?: () => void;
  onToggleSort: () => void;
  onViewsChanged?: () => void;
  selectedViewId?: string;
  sortOpen: boolean;
  targetKind: ViewTargetKind;
}>;

export function ViewBar({
  activeFilterRules,
  activeGroupBy,
  activeSortRules,
  filterOpen,
  groupByOpen,
  locale,
  onApplyView,
  onCreateRecord,
  onOpenProperties,
  onToggleFilter,
  onToggleGroupBy,
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
    if (!name) return;

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

  const hasFilterRules = activeFilterRules.length > 0;
  const hasSortRules = activeSortRules.length > 0;

  return (
    <div className="notion-view-bar">
      {/* Left side: View Tabs */}
      <div className="notion-view-bar__tabs">
        <button
          className="notion-view-tab"
          data-active={!selectedViewId}
          onClick={() => onApplyView(undefined)}
          type="button"
        >
          <TableProperties aria-hidden="true" size={14} />
          <span>{viewsCopy(locale, 'defaultView')}</span>
        </button>

        {views.map((v) => (
          <div key={v.id} className="notion-view-tab-wrapper">
            <button
              className="notion-view-tab"
              data-active={selectedViewId === v.id}
              onClick={() => onApplyView(v)}
              type="button"
            >
              <Bookmark aria-hidden="true" size={13} />
              <span>{v.name}</span>
            </button>
            <button
              aria-label={`${viewsCopy(locale, 'deleteView')}: ${v.name}`}
              className="notion-view-tab-delete"
              onClick={() => void handleDeleteView(v.id)}
              type="button"
            >
              <Trash2 aria-hidden="true" size={12} />
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
        {onToggleGroupBy && (
          <button
            aria-expanded={groupByOpen}
            className="notion-db-tool-btn"
            data-active={Boolean(activeGroupBy) || groupByOpen}
            onClick={onToggleGroupBy}
            title={viewsCopy(locale, 'groupBy')}
            type="button"
          >
            <Layers aria-hidden="true" size={14} />
            <span>{viewsCopy(locale, 'groupBy')}</span>
            {activeGroupBy && <span className="notion-db-badge">1</span>}
          </button>
        )}

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

        {(hasFilterRules || hasSortRules || Boolean(activeGroupBy)) && !selectedViewId && (
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
        <FocusedOverlay
          labelId="view-dialog-title"
          onClose={() => setSaveModalOpen(false)}
        >
          <div
            aria-labelledby="view-dialog-title"
            aria-modal="true"
            className="dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <h2 id="view-dialog-title">{viewsCopy(locale, 'createView')}</h2>
            <form className="dialog__body" onSubmit={(e) => void handleSaveView(e)}>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-field">
                <label htmlFor="view-name-input">{viewsCopy(locale, 'name')}</label>
                <input
                  autoFocus
                  id="view-name-input"
                  onChange={(e) => setViewName(e.target.value)}
                  placeholder={viewsCopy(locale, 'name')}
                  required
                  value={viewName}
                />
              </div>
              <div className="dialog__actions">
                <Button onClick={() => setSaveModalOpen(false)} type="button" variant="ghost">
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button disabled={saving || !viewName.trim()} type="submit" variant="primary">
                  {saving ? (locale === 'ar' ? 'جار الحفظ...' : 'Saving...') : viewsCopy(locale, 'save')}
                </Button>
              </div>
            </form>
          </div>
        </FocusedOverlay>
      )}
    </div>
  );
}
