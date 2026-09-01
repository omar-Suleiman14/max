import { Link2, Search, X, Check } from 'lucide-react';
import { useEffect, useState, useCallback, useRef } from 'react';

import type { RelationTargetSummary } from '../../shared/relation-contract';

type RelationPickerProps = Readonly<{
  isOpen: boolean;
  onClose: () => void;
  onLink: (targetRecordId: string) => Promise<void>;
  onUnlink: (targetRecordId: string) => Promise<void>;
  relationId: string;
  selectedTargetIds: readonly string[];
  title?: string;
}>;

export function RelationPicker({
  isOpen,
  onClose,
  onLink,
  onUnlink,
  relationId,
  selectedTargetIds,
  title = 'Link Records',
}: RelationPickerProps) {
  const [query, setQuery] = useState('');
  const [targets, setTargets] = useState<readonly RelationTargetSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSet, setSelectedSet] = useState<Set<string>>(() => new Set(selectedTargetIds));
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedSet(new Set(selectedTargetIds));
  }, [selectedTargetIds]);

  const searchTargets = useCallback(async (q: string) => {
    if (!relationId) return;
    setLoading(true);
    try {
      const results = await window.maxApi.workspace.searchRelationTargets(relationId, q, 30);
      setTargets(results);
    } catch {
      setTargets([]);
    } finally {
      setLoading(false);
    }
  }, [relationId]);

  useEffect(() => {
    if (isOpen) {
      void searchTargets(query);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen, query, searchTargets]);

  const toggleSelect = async (targetId: string) => {
    const isSelected = selectedSet.has(targetId);
    const nextSet = new Set(selectedSet);

    if (isSelected) {
      nextSet.delete(targetId);
      setSelectedSet(nextSet);
      await onUnlink(targetId);
    } else {
      nextSet.add(targetId);
      setSelectedSet(nextSet);
      await onLink(targetId);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
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
            placeholder="Search records to link..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-clean"
          />
        </div>

        <div className="relation-picker__list">
          {loading && <div className="p-4 text-center text-muted">Searching...</div>}
          {!loading && targets.length === 0 && (
            <div className="p-4 text-center text-muted">No records found.</div>
          )}
          {!loading &&
            targets.map((target) => {
              const isSelected = selectedSet.has(target.id);
              return (
                <button
                  key={target.id}
                  type="button"
                  className={`relation-picker__item ${isSelected ? 'relation-picker__item--selected' : ''}`}
                  onClick={() => void toggleSelect(target.id)}
                >
                  <div className="relation-picker__item-main">
                    <span className="badge badge-secondary">#{target.sequence}</span>
                    <span className="relation-picker__item-title">{target.title}</span>
                  </div>
                  {isSelected && <Check size={16} className="text-primary" />}
                </button>
              );
            })}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
