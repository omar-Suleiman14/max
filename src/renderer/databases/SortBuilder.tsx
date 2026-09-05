import { Select } from '../ui/select';
import { ArrowDownAZ, ArrowUpZA, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import type { WorkspaceProperty } from '../../shared/property-contract';
import type { SortRule } from '../../shared/query-contract';

type SortBuilderProps = Readonly<{
  isOpen: boolean;
  onApply: (sorts: readonly SortRule[]) => void;
  onClose: () => void;
  properties: readonly WorkspaceProperty[];
  sorts: readonly SortRule[];
}>;

export function SortBuilder({
  isOpen,
  onApply,
  onClose,
  properties,
  sorts: initialSorts,
}: SortBuilderProps) {
  const [sortRules, setSortRules] = useState<SortRule[]>(() => [...initialSorts]);

  if (!isOpen) return null;

  const addSort = () => {
    const available = properties.find((p) => !sortRules.some((s) => s.propertyId === p.id)) || properties[0];
    if (!available) return;
    setSortRules([...sortRules, { direction: 'asc', propertyId: available.id }]);
  };

  const removeSort = (index: number) => {
    setSortRules(sortRules.filter((_, i) => i !== index));
  };

  const updateSort = (index: number, patch: Partial<SortRule>) => {
    setSortRules(
      sortRules.map((rule, i) => {
        if (i !== index) return rule;
        return { ...rule, ...patch };
      }),
    );
  };

  const handleApply = () => {
    onApply(sortRules);
    onClose();
  };

  const handleClear = () => {
    setSortRules([]);
    onApply([]);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-container sort-builder-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header__title">
            <ArrowDownAZ size={18} className="text-primary" />
            <h3>Sort Database</h3>
          </div>
          <button className="btn-icon" onClick={onClose} type="button" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body sort-builder__body">
          {sortRules.length === 0 && (
            <div className="text-muted p-4 text-center">
              No active sorts. Click &quot;Add sort&quot; to order records.
            </div>
          )}

          <div className="sort-builder__rules">
            {sortRules.map((rule, index) => {
              return (
                <div key={index} className="sort-builder__row">
                  <span className="text-xs text-muted w-12">{index === 0 ? 'Sort by' : 'Then by'}</span>

                  {/* Property Selector */}
                  <Select
                    className="select-field flex-1"
                    value={rule.propertyId}
                    onChange={(e) => updateSort(index, { propertyId: e.target.value })}
                  >
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>

                  {/* Direction Selector */}
                  <div className="flex rounded-md border border-neutral-700 overflow-hidden">
                    <button
                      type="button"
                      className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 ${rule.direction === 'asc' ? 'bg-primary text-white' : 'bg-neutral-800 text-neutral-300'}`}
                      onClick={() => updateSort(index, { direction: 'asc' })}
                    >
                      <ArrowDownAZ size={14} /> Ascending
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 ${rule.direction === 'desc' ? 'bg-primary text-white' : 'bg-neutral-800 text-neutral-300'}`}
                      onClick={() => updateSort(index, { direction: 'desc' })}
                    >
                      <ArrowUpZA size={14} /> Descending
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn-icon text-danger"
                    onClick={() => removeSort(index)}
                    aria-label="Remove sort"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>

          <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={addSort}>
            <Plus size={14} className="mr-1" /> Add sort
          </button>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={handleClear}>
            Clear Sorts
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleApply}>
              Apply Sorts
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
