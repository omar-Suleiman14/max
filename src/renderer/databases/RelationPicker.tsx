import { Link2, Search, X, Check } from 'lucide-react';
import { useEffect, useState, useCallback, useRef } from 'react';

import type { RelationTargetSummary } from '../../shared/relation-contract';
import type { Locale } from '../app/i18n';

type RelationPickerProps = Readonly<{
  isOpen: boolean;
  locale?: Locale;
  onClose: () => void;
  onLink: (targetRecordId: string) => Promise<void>;
  onUnlink: (targetRecordId: string) => Promise<void>;
  recordId: string;
  relationId: string;
  selectedTargetIds: readonly string[];
  title?: string;
}>;

export function RelationPicker({
  isOpen,
  locale = 'en',
  onClose,
  onLink,
  onUnlink,
  recordId,
  relationId,
  selectedTargetIds,
  title = 'Link Records',
}: RelationPickerProps) {
  const [query, setQuery] = useState('');
  const [targets, setTargets] = useState<readonly RelationTargetSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const [selectedSet, setSelectedSet] = useState<Set<string>>(() => new Set(selectedTargetIds));
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedSet(new Set(selectedTargetIds));
  }, [selectedTargetIds]);

  const searchTargets = useCallback(async (q: string) => {
    if (!relationId) return;
    const request = ++generation.current;
    setLoading(true);
    try {
      const results = await window.maxApi.workspace.searchRelationTargets(relationId, q, 30, recordId);
      if (request === generation.current) setTargets(results);
    } catch {
      setTargets([]);
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [recordId, relationId]);

  useEffect(() => {
    if (isOpen) {
      void searchTargets(query);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen, query, searchTargets]);

  const toggleSelect = async (targetId: string) => {
    if (pending) return;
    setPending(true);
    setError('');
    const isSelected = selectedSet.has(targetId);
    try {
      if (isSelected) await onUnlink(targetId);
      else await onLink(targetId);
      window.dispatchEvent(new Event('max:workspace-changed'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setPending(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-container relation-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header__title">
            <Link2 size={18} className="text-primary" />
            <h3>{title}</h3>
          </div>
          <button className="btn-icon" onClick={onClose} type="button" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="relation-picker__search">
          <Search size={16} className="text-muted" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={locale === 'ar' ? 'ابحث عن صفحة لربطها…' : 'Search pages to link…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-clean"
          />
        </div>

        <div className="relation-picker__list">
          {error && <p className="form-error" role="alert">{error}</p>}
          {loading && <div className="p-4 text-center text-muted">{locale === 'ar' ? 'جارٍ البحث…' : 'Searching…'}</div>}
          {!loading && targets.length === 0 && (
            <div className="p-4 text-center text-muted">{locale === 'ar' ? 'لا توجد صفحات.' : 'No pages found.'}</div>
          )}
          {!loading &&
            targets.map((target) => {
              const isSelected = selectedSet.has(target.id);
              return (
                <button
                  key={target.id}
                  type="button"
                  disabled={pending}
                  aria-pressed={isSelected}
                  className={`relation-picker__item ${isSelected ? 'relation-picker__item--selected' : ''}`}
                  onClick={() => void toggleSelect(target.id)}
                >
                  <div className="relation-picker__item-main">
                    <Link2 size={14} aria-hidden="true" />
                    <span className="relation-picker__item-title">{target.title}</span>
                  </div>
                  {isSelected && <Check size={16} className="text-primary" />}
                </button>
              );
            })}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {locale === 'ar' ? 'تم' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
