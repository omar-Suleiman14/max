import { PropertyIcon } from './PropertyIcon';
import { DatabasePopover } from '../ui/database-popover';
import { Select } from '../ui/select';
import { ArrowDownAZ, ArrowUp, ArrowDown, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { WorkspaceProperty } from '../../shared/property-contract';
import type { SortRule } from '../../shared/query-contract';

type SortBuilderProps = Readonly<{
  isOpen: boolean;
  locale?: 'ar' | 'en';
  onApply: (sorts: readonly SortRule[]) => void;
  onClose: () => void;
  properties: readonly WorkspaceProperty[];
  sorts: readonly SortRule[];
}>;

export function SortBuilder({
  isOpen,
  locale = 'en',
  onApply,
  onClose,
  properties,
  sorts: initialSorts,
}: SortBuilderProps) {
  const [sortRules, setSortRules] = useState<SortRule[]>(() => [...initialSorts]);

  useEffect(() => { if (isOpen) setSortRules([...initialSorts]); }, [isOpen, initialSorts]);
  const [propertySearch, setPropertySearch] = useState('');
  if (!isOpen) return null;

  const addSort = () => {
    const available = properties.find((p) => !sortRules.some((s) => s.propertyId === p.id));
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
    <DatabasePopover className="database-rule-dialog" labelId="sort-builder-title" onClose={onClose}>
      <div dir={locale === 'ar' ? 'rtl' : 'ltr'} className="database-rule-panel sort-builder-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header__title">
            <ArrowDownAZ size={18} className="text-primary" />
            <h3 id="sort-builder-title">{locale === 'ar' ? 'ترتيب' : 'Sort'}</h3>
          </div>
          <button className="btn-icon" onClick={onClose} type="button" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body sort-builder__body">
          {sortRules.length === 0 && <div className="property-menu-list"><input autoFocus aria-label="Sort by…" placeholder="Sort by…" value={propertySearch} onChange={(e) => setPropertySearch(e.target.value)} />{properties.filter((p) => p.name.toLocaleLowerCase().includes(propertySearch.toLocaleLowerCase())).map((p) => <button type="button" key={p.id} onClick={() => setSortRules([{ propertyId: p.id, direction: 'asc' }])}><PropertyIcon type={p.type} icon={typeof p.config.icon === 'string' ? p.config.icon : undefined} />{p.name}</button>)}</div>}

          <div className="sort-builder__rules">
            {sortRules.map((rule, index) => {
              return (
                <div key={index} className="sort-builder__row">
                  <span className="text-xs text-muted w-12">{index === 0 ? 'Sort by' : 'Then by'}</span>

                  {/* Property Selector */}
                  <Select
                    aria-label="Property" className="select-field flex-1"
                    value={rule.propertyId}
                    onChange={(e) => updateSort(index, { propertyId: e.target.value })}
                  >
                    {properties.map((p) => (
                      <option key={p.id} value={p.id} disabled={sortRules.some((other, otherIndex) => otherIndex !== index && other.propertyId === p.id)}>
                        {p.name}
                      </option>
                    ))}
                  </Select>

                  {/* Direction Selector */}
                  <Select aria-label="Sort direction" className="select-field" value={rule.direction} onChange={(event) => updateSort(index, { direction: event.target.value as 'asc' | 'desc' })}><option value="asc">{locale === 'ar' ? 'تصاعدي' : 'Ascending'}</option><option value="desc">{locale === 'ar' ? 'تنازلي' : 'Descending'}</option></Select>
                  <div className="sort-priority-actions">{([-1,1] as const).map((direction) => <button type="button" className="btn-icon" key={direction} aria-label={direction < 0 ? 'Move sort up' : 'Move sort down'} disabled={!sortRules[index + direction]} onClick={() => { const next = [...sortRules]; [next[index], next[index + direction]] = [next[index + direction]!, next[index]!]; setSortRules(next); }}>{direction < 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}</button>)}</div>

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

          <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={addSort} disabled={sortRules.length >= properties.length}>
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
    </DatabasePopover>
  );
}
