import {
  Calendar,
  CheckSquare,
  CircleDot,
  DollarSign,
  Hash,
  Link2,
  List,
  Maximize2,
  Plus,
  Sigma,
  Type,
} from 'lucide-react';
import { useState } from 'react';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceRecord, WorkspaceRecordDraft, WorkspaceRecordPatch } from '../../shared/property-contract';
import type { QueryCalculationResult } from '../../shared/query-contract';

type TableViewProps = Readonly<{
  calculations: readonly QueryCalculationResult[];
  databaseId: string;
  onArchiveRecord?: (recordId: string) => Promise<void>;
  onCreateRecord: (draft: WorkspaceRecordDraft) => Promise<WorkspaceRecord | null>;
  onOpenRecord: (record: WorkspaceRecord) => void;
  onUpdateRecord: (recordId: string, patch: WorkspaceRecordPatch) => Promise<void>;
  records: readonly WorkspaceRecord[];
  schema: DatabaseSchema | null;
}>;

function formatUnknown(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

export function TableView({
  calculations,
  databaseId,
  onCreateRecord,
  onOpenRecord,
  onUpdateRecord,
  records,
  schema,
}: TableViewProps) {
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  if (!schema) return null;

  const properties = schema.properties;

  const handleCreateInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      await onCreateRecord({
        databaseId,
        properties: {},
        title: newTitle.trim(),
      });
      setNewTitle('');
    } finally {
      setAdding(false);
    }
  };

  const handleCellChange = (record: WorkspaceRecord, propertyId: string, value: unknown) => {
    void onUpdateRecord(record.id, {
      properties: {
        ...record.properties,
        [propertyId]: value,
      },
    });
  };

  const handleTitleChange = (record: WorkspaceRecord, newTitleVal: string) => {
    if (newTitleVal.trim() && newTitleVal !== record.title) {
      void onUpdateRecord(record.id, { title: newTitleVal.trim() });
    }
  };

  return (
    <div className="table-view-container">
      <div className="table-view-scroll">
        <table className="table-view">
          {/* Header Row */}
          <thead>
            <tr>
              <th className="table-col-action w-10"></th>
              <th className="table-col-title">
                <div className="flex items-center gap-1.5 font-medium">
                  <Type size={14} className="text-muted" />
                  <span>Name</span>
                </div>
              </th>

              {properties.map((prop) => {
                if (prop.type === 'title') return null;
                return (
                  <th key={prop.id} className="table-col-custom">
                    <div className="flex items-center gap-1.5 font-medium">
                      {prop.type === 'text' && <Type size={14} className="text-muted" />}
                      {prop.type === 'number' && <Hash size={14} className="text-muted" />}
                      {prop.type === 'money' && <DollarSign size={14} className="text-muted" />}
                      {prop.type === 'select' && <CircleDot size={14} className="text-muted" />}
                      {prop.type === 'multi_select' && <List size={14} className="text-muted" />}
                      {prop.type === 'date' && <Calendar size={14} className="text-muted" />}
                      {prop.type === 'checkbox' && <CheckSquare size={14} className="text-muted" />}
                      {prop.type === 'relation' && <Link2 size={14} className="text-muted" />}
                      {prop.type === 'formula' && <Sigma size={14} className="text-muted" />}
                      {prop.type === 'rollup' && <Sigma size={14} className="text-muted" />}
                      <span>{prop.name}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Body Rows */}
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="table-row">
                {/* Open Drawer Button */}
                <td className="table-cell-action">
                  <button
                    type="button"
                    className="btn-icon p-1 opacity-0 group-hover:opacity-100 hover:opacity-100"
                    onClick={() => onOpenRecord(record)}
                    title="Open record drawer"
                  >
                    <Maximize2 size={13} />
                  </button>
                </td>

                {/* Title Cell */}
                <td className="table-cell-title">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-secondary text-xs">#{record.sequence}</span>
                    <input
                      type="text"
                      className="table-cell-input font-medium"
                      defaultValue={record.title}
                      onBlur={(e) => handleTitleChange(record, e.target.value)}
                    />
                  </div>
                </td>

                {/* Custom Properties */}
                {properties.map((prop) => {
                  if (prop.type === 'title') return null;
                  const value = record.properties[prop.id];

                  return (
                    <td key={prop.id} className="table-cell-value">
                      {/* Text */}
                      {prop.type === 'text' && (
                        <input
                          type="text"
                          className="table-cell-input"
                          defaultValue={formatUnknown(value)}
                          onBlur={(e) => handleCellChange(record, prop.id, e.target.value)}
                        />
                      )}

                      {/* Number */}
                      {prop.type === 'number' && (
                        <input
                          type="number"
                          className="table-cell-input"
                          defaultValue={typeof value === 'number' ? value : ''}
                          onBlur={(e) =>
                            handleCellChange(record, prop.id, e.target.value === '' ? null : Number(e.target.value))
                          }
                        />
                      )}

                      {/* Money */}
                      {prop.type === 'money' && (
                        <input
                          type="number"
                          step="0.01"
                          className="table-cell-input"
                          defaultValue={typeof value === 'number' ? value : ''}
                          onBlur={(e) =>
                            handleCellChange(record, prop.id, e.target.value === '' ? null : Number(e.target.value))
                          }
                        />
                      )}

                      {/* Checkbox */}
                      {prop.type === 'checkbox' && (
                        <div className="flex items-center justify-center p-1">
                          <input
                            type="checkbox"
                            className="checkbox-custom"
                            checked={Boolean(value)}
                            onChange={(e) => handleCellChange(record, prop.id, e.target.checked)}
                          />
                        </div>
                      )}

                      {/* Select / Status */}
                      {['select', 'status'].includes(prop.type) && (
                        <select
                          className="table-cell-select"
                          value={formatUnknown(value)}
                          onChange={(e) => handleCellChange(record, prop.id, e.target.value || null)}
                        >
                          <option value="">(Empty)</option>
                          {prop.options?.map((opt) => (
                            <option key={opt.id || opt.label} value={opt.id || opt.label}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      )}

                      {/* Date */}
                      {prop.type === 'date' && (
                        <input
                          type="date"
                          className="table-cell-input"
                          value={typeof value === 'string' ? value.slice(0, 10) : ''}
                          onChange={(e) => handleCellChange(record, prop.id, e.target.value || null)}
                        />
                      )}

                      {/* Relation */}
                      {prop.type === 'relation' && (
                        <button
                          type="button"
                          className="text-xs text-primary underline truncate max-w-xs block p-1"
                          onClick={() => onOpenRecord(record)}
                        >
                          {Array.isArray(value) && value.length > 0 ? `${value.length} linked` : '—'}
                        </button>
                      )}

                      {/* Formula / Rollup (Read-only badge) */}
                      {['formula', 'rollup'].includes(prop.type) && (
                        <span className="text-xs font-mono px-2 py-1 text-muted">
                          {value !== undefined && value !== null ? formatUnknown(value) : '—'}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Quick Inline New Row */}
            <tr className="table-row-new">
              <td className="table-cell-action">
                <Plus size={14} className="text-muted ml-2" />
              </td>
              <td colSpan={properties.length} className="p-0">
                <form onSubmit={(e) => { void handleCreateInline(e); }}>
                  <input
                    type="text"
                    className="table-cell-input text-muted focus:text-foreground"
                    placeholder="+ New record (type name and press Enter)..."
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    disabled={adding}
                  />
                </form>
              </td>
            </tr>
          </tbody>

          {/* Footer Calculations */}
          {calculations.length > 0 && (
            <tfoot>
              <tr className="table-footer-row">
                <td className="table-cell-action"></td>
                <td className="table-cell-title text-xs text-muted font-medium">
                  Count: {records.length}
                </td>
                {properties.map((prop) => {
                  if (prop.type === 'title') return null;
                  const calc = calculations.find((c) => c.propertyId === prop.id);
                  return (
                    <td key={prop.id} className="table-cell-value text-xs text-muted font-mono font-medium">
                      {calc ? `${calc.calculation.toUpperCase()}: ${calc.value}` : ''}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
