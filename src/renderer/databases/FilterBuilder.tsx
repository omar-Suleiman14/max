import { PropertyIcon } from './PropertyIcon';
import { DatabasePopover } from '../ui/database-popover';
import { Select } from '../ui/select';
import { Filter, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { WorkspaceProperty } from '../../shared/property-contract';
import type { FilterGroupNode, FilterNode, FilterOperator, PropertyFilterNode, RelativeDatePeriod } from '../../shared/query-contract';

type FilterBuilderProps = Readonly<{
  filterAst: FilterNode | null;
  isOpen: boolean;
  locale?: 'ar' | 'en';
  onApply: (filter: FilterNode | null) => void;
  onClose: () => void;
  properties: readonly WorkspaceProperty[];
}>;

const textOperators: { label: string; value: FilterOperator }[] = [
  { label: 'Equals', value: 'equals' },
  { label: 'Does not equal', value: 'not_equals' },
  { label: 'Contains', value: 'contains' },
  { label: 'Does not contain', value: 'not_contains' },
  { label: 'Starts with', value: 'starts_with' },
  { label: 'Ends with', value: 'ends_with' },
  { label: 'Is empty', value: 'is_empty' },
  { label: 'Is not empty', value: 'is_not_empty' },
];

const numberOperators: { label: string; value: FilterOperator }[] = [
  { label: '=', value: 'equals' },
  { label: '≠', value: 'not_equals' },
  { label: '>', value: 'greater_than' },
  { label: '≥', value: 'greater_than_or_equal' },
  { label: '<', value: 'less_than' },
  { label: '≤', value: 'less_than_or_equal' },
  { label: 'Is empty', value: 'is_empty' },
  { label: 'Is not empty', value: 'is_not_empty' },
];

const dateOperators: { label: string; value: FilterOperator }[] = [
  { label: 'Relative date', value: 'relative_date' },
  { label: 'Exact date', value: 'equals' },
  { label: 'Before date', value: 'before_date' },
  { label: 'After date', value: 'after_date' },
  { label: 'Is empty', value: 'is_empty' },
  { label: 'Is not empty', value: 'is_not_empty' },
];

const booleanOperators: { label: string; value: FilterOperator }[] = [
  { label: 'Is checked', value: 'is_checked' },
  { label: 'Is not checked', value: 'is_not_checked' },
];

const relativePeriods: { label: string; value: RelativeDatePeriod }[] = [
  { label: 'Today', value: 'TODAY' },
  { label: 'Yesterday', value: 'YESTERDAY' },
  { label: 'Tomorrow', value: 'TOMORROW' },
  { label: 'This week', value: 'THIS_WEEK' },
  { label: 'Last week', value: 'LAST_WEEK' },
  { label: 'This month', value: 'THIS_MONTH' },
  { label: 'Last month', value: 'LAST_MONTH' },
  { label: 'This year', value: 'THIS_YEAR' },
];

function formatUnknown(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

export function FilterBuilder({
  filterAst,
  isOpen,
  locale = 'en',
  onApply,
  onClose,
  properties,
}: FilterBuilderProps) {
  // Convert current AST into flat list of rules (or default compound)
  const [rules, setRules] = useState<PropertyFilterNode[]>(() => {
    if (!filterAst) return [];
    if (filterAst.kind === 'property') return [filterAst];
    if (filterAst.kind === 'group') {
      return filterAst.conditions.filter((c): c is PropertyFilterNode => c.kind === 'property');
    }
    return [];
  });

  const [combinator, setCombinator] = useState<'AND' | 'OR'>('AND');

  useEffect(() => {
    if (!isOpen) return;
    setRules(!filterAst ? [] : filterAst.kind === 'property' ? [filterAst] : filterAst.kind === 'group' ? filterAst.conditions.filter((rule): rule is PropertyFilterNode => rule.kind === 'property') : []);
    setCombinator(filterAst?.kind === 'group' ? filterAst.operator : 'AND');
  }, [isOpen, filterAst]);
  const [propertySearch, setPropertySearch] = useState('');
  if (!isOpen) return null;

  const addRule = () => {
    const defaultProp = properties[0];
    if (!defaultProp) return;
    const newRule: PropertyFilterNode = {
      kind: 'property',
      operator: defaultProp.type === 'checkbox' ? 'is_checked' : ['text','title'].includes(defaultProp.type) ? 'contains' : 'equals',
      propertyId: defaultProp.id,
      value: '',
    };
    setRules([...rules, newRule]);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, patch: Partial<PropertyFilterNode>) => {
    setRules(
      rules.map((rule, i) => {
        if (i !== index) return rule;
        return { ...rule, ...patch };
      }),
    );
  };

  const handleApply = () => {
    if (rules.length === 0) {
      onApply(null);
    } else if (rules.length === 1) {
      onApply(rules[0]!);
    } else {
      const group: FilterGroupNode = {
        conditions: rules,
        kind: 'group',
        operator: combinator,
      };
      onApply(group);
    }
    onClose();
  };

  const handleClear = () => {
    setRules([]);
    onApply(null);
    onClose();
  };

  return (
    <DatabasePopover className="database-rule-dialog" labelId="filter-builder-title" onClose={onClose}>
      <div dir={locale === 'ar' ? 'rtl' : 'ltr'} className="database-rule-panel filter-builder-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header__title">
            <Filter size={18} className="text-primary" />
            <h3 id="filter-builder-title">{locale === 'ar' ? 'تصفية' : 'Filters'}</h3>
          </div>
          <button className="btn-icon" onClick={onClose} type="button" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body filter-builder__body">
          {rules.length > 1 && (
            <div className="filter-builder__combinator">
              <span>Match</span>
              <Select
                className="select-clean"
                value={combinator}
                onChange={(e) => setCombinator(e.target.value as 'AND' | 'OR')}
              >
                <option value="AND">ALL (AND)</option>
                <option value="OR">ANY (OR)</option>
              </Select>
              <span>of the following rules:</span>
            </div>
          )}

          {rules.length === 0 && <div className="property-menu-list"><input autoFocus aria-label="Filter by…" placeholder="Filter by…" value={propertySearch} onChange={(e) => setPropertySearch(e.target.value)} />{properties.filter((p) => p.name.toLocaleLowerCase().includes(propertySearch.toLocaleLowerCase())).map((p) => <button type="button" key={p.id} onClick={() => setRules([{ kind: 'property', propertyId: p.id, operator: p.type === 'checkbox' ? 'is_checked' : 'equals', value: '' }])}><PropertyIcon type={p.type} icon={typeof p.config.icon === 'string' ? p.config.icon : undefined} />{p.name}</button>)}</div>}

          <div className="filter-builder__rules">
            {rules.map((rule, index) => {
              const prop = properties.find((p) => p.id === rule.propertyId) || properties[0];
              const propType = prop?.type || 'text';

              let ops = textOperators;
              if (propType === 'number') ops = numberOperators;
              else if (propType === 'date') ops = dateOperators;
              else if (propType === 'checkbox') ops = booleanOperators;

              const isNoValueOp = ['is_checked', 'is_empty', 'is_not_checked', 'is_not_empty'].includes(
                rule.operator,
              );

              return (
                <div key={index} className="filter-builder__row">
                  {/* Property Selector */}
                  <Select
                    className="select-field"
                    value={rule.propertyId}
                    onChange={(e) => {
                      const newPropId = e.target.value;
                      const nextProp = properties.find((p) => p.id === newPropId);
                      const defaultOp = nextProp?.type === 'checkbox' ? 'is_checked' : 'equals';
                      updateRule(index, { operator: defaultOp, propertyId: newPropId, value: '' });
                    }}
                  >
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>

                  {/* Operator Selector */}
                  <Select
                    className="select-field"
                    value={rule.operator}
                    onChange={(e) => updateRule(index, { operator: e.target.value as FilterOperator })}
                  >
                    {ops.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </Select>

                  {/* Value Input */}
                  {!isNoValueOp && rule.operator === 'relative_date' && (
                    <Select
                      className="select-field flex-1"
                      value={rule.relativePeriod || 'THIS_MONTH'}
                      onChange={(e) => updateRule(index, { relativePeriod: e.target.value as RelativeDatePeriod })}
                    >
                      {relativePeriods.map((rp) => (
                        <option key={rp.value} value={rp.value}>
                          {rp.label}
                        </option>
                      ))}
                    </Select>
                  )}

                  {!isNoValueOp && rule.operator !== 'relative_date' && prop?.options?.length ? (
                    <Select className="select-field flex-1" value={formatUnknown(rule.value)} onChange={(event) => updateRule(index, { value: event.target.value })}>
                      <option value="">Choose an option…</option>
                      {prop.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </Select>
                  ) : !isNoValueOp && rule.operator !== 'relative_date' && (
                    <input
                      type={propType === 'number' ? 'number' : propType === 'date' ? 'date' : 'text'}
                      className="input-field flex-1"
                      placeholder="Value..."
                      value={formatUnknown(rule.value)}
                      onChange={(e) => updateRule(index, { value: propType === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value })}
                    />
                  )}

                  <button
                    type="button"
                    className="btn-icon text-danger"
                    onClick={() => removeRule(index)}
                    aria-label="Remove condition"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>

          <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={addRule} disabled={!properties.length}>
            <Plus size={14} className="mr-1" /> Add condition
          </button>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={handleClear}>
            Clear Filters
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleApply}>
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </DatabasePopover>
  );
}
