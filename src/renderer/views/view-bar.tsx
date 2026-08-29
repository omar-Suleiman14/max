import {
  Bookmark,
  Plus,
  Trash2,
  X,
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
  activeSortRules: readonly ViewSortRule[];
  locale: Locale;
  onApplyView: (view?: SavedView) => void;
  selectedViewId?: string;
  targetKind: ViewTargetKind;
}>;

export function ViewBar({
  activeFilterRules,
  activeSortRules,
  locale,
  onApplyView,
  selectedViewId,
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
      onApplyView(res.value);
    } else {
      setError(res.error.message);
    }
  }

  async function handleDeleteView(id: string) {
    await window.maxApi.views.archive(id);
    await loadViews();
    if (selectedViewId === id) {
      onApplyView(undefined);
    }
  }

  return (
    <div className="view-bar">
      <div className="view-bar__tabs">
        <button
          className="view-tab"
          data-active={!selectedViewId}
          onClick={() => onApplyView(undefined)}
          type="button"
        >
          <Bookmark aria-hidden="true" size={14} />
          <span>{viewsCopy(locale, 'defaultView')}</span>
        </button>

        {views.map((v) => (
          <div key={v.id} className="view-tab-wrapper">
            <button
              className="view-tab"
              data-active={selectedViewId === v.id}
              onClick={() => onApplyView(v)}
              type="button"
            >
              <span>{v.name}</span>
            </button>
            <button
              aria-label={`${viewsCopy(locale, 'deleteView')}: ${v.name}`}
              className="view-tab-delete"
              onClick={() => void handleDeleteView(v.id)}
              type="button"
            >
              <Trash2 aria-hidden="true" size={12} />
            </button>
          </div>
        ))}

        <button
          className="view-tab view-tab--save"
          onClick={() => setSaveModalOpen(true)}
          type="button"
        >
          <Plus aria-hidden="true" size={14} />
          <span>{viewsCopy(locale, 'createView')}</span>
        </button>
      </div>

      {saveModalOpen && (
        <FocusedOverlay className="object-dialog" labelId="save-view-title" onClose={() => setSaveModalOpen(false)}>
          <header className="dialog-header">
            <div>
              <p className="eyebrow">MAX · {viewsCopy(locale, 'customViews')}</p>
              <h2 id="save-view-title">{viewsCopy(locale, 'saveCurrentView')}</h2>
            </div>
            <button aria-label={viewsCopy(locale, 'cancel')} className="icon-button" onClick={() => setSaveModalOpen(false)} type="button">
              <X aria-hidden="true" size={19} />
            </button>
          </header>

          <form className="object-form" onSubmit={(e) => void handleSaveView(e)}>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <label className="field">
              <span>{viewsCopy(locale, 'name')}</span>
              <input
                data-autofocus="true"
                onChange={(e) => setViewName(e.target.value)}
                placeholder={viewsCopy(locale, 'namePlaceholder')}
                required
                value={viewName}
              />
            </label>

            <footer className="form-footer">
              <Button onClick={() => setSaveModalOpen(false)}>{viewsCopy(locale, 'cancel')}</Button>
              <Button disabled={saving || !viewName.trim()} type="submit" variant="primary">
                {viewsCopy(locale, 'save')}
              </Button>
            </footer>
          </form>
        </FocusedOverlay>
      )}
    </div>
  );
}
