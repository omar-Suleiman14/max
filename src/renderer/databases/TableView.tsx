import { OptionValue } from './OptionValue';
import { normalizeNumericInput, parseNumericInput } from '../../shared/digits';
import { PageIconRenderer } from '../ui/page-icon-renderer';
import { generateOrderKey } from '../../shared/order-key';
import { RelationValue } from './RelationValue';
import { PropertyIcon } from './PropertyIcon';
import { MultiSelectValue } from './MultiSelectValue';
import {
  Check,
  PanelLeft,
  GripVertical,
  Plus,
  MoreHorizontal,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { Locale } from '../app/i18n';
import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceProperty, WorkspaceRecord, WorkspaceRecordDraft, WorkspaceRecordPatch } from '../../shared/property-contract';
import type { QueryCalculationResult } from '../../shared/query-contract';
import type { ColumnState } from '../../shared/view-contract';

type TableViewProps = Readonly<{
  calculations: readonly QueryCalculationResult[];
  totalCount?: number;
  columns?: readonly ColumnState[];
  onPropertyMove?: (source: string, target: string) => void;
  canReorder?: boolean;
  hasSorting?: boolean;
  onRemoveSorting?: () => Promise<void>;
  onColumnResize?: (propertyId: string, width: number) => void;
  databaseId: string;
  /** Records are still being queried; the columns are already known. */
  loading?: boolean;
  locale?: Locale;
  onArchiveRecord?: (recordId: string) => Promise<void>;
  onCreateRecord: (draft: WorkspaceRecordDraft) => Promise<WorkspaceRecord | null>;
  onOpenRecord: (record: WorkspaceRecord) => void;
  onManageProperties?: () => void;
  onEditProperty?: (property: WorkspaceProperty | null) => void;
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
  totalCount,
  columns = [],
  onColumnResize,
  onPropertyMove,
  canReorder = false,
  hasSorting = false,
  onRemoveSorting,
  databaseId,
  loading = false,
  locale = 'en',
  onCreateRecord,
  onOpenRecord,
  onManageProperties,
  onEditProperty,
  onUpdateRecord,
  records,
  schema,
}: TableViewProps) {
  const [pendingMove, setPendingMove] = useState<{ source: string; target: string } | null>(null);
  const [reorderError, setReorderError] = useState('');
  const [reordering, setReordering] = useState(false);
  const cancelSortingRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pendingMove) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelSortingRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [pendingMove]);
  const [dragRecord, setDragRecord] = useState<string | null>(null);
  const [dragProperty, setDragProperty] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  async function moveRecord(source: string, target: string, confirmed = false) {
    if (hasSorting && !confirmed) { setPendingMove({ source, target }); return; }
    const remaining = records.filter((row) => row.id !== source);
    let index = remaining.findIndex((row) => row.id === target);
    if (records.findIndex((row) => row.id === source) < records.findIndex((row) => row.id === target)) index += 1;
    if (index < 0 || source === target) return;
    if (confirmed) {
      const moved = records.find((row) => row.id === source);
      if (!moved || !onRemoveSorting) return;
      remaining.splice(index, 0, moved);
      const keys = records.map((row) => row.positionKey).sort();
      await onRemoveSorting();
      for (const [position, row] of remaining.entries()) {
        if (row.positionKey !== keys[position]) {
          const result = await window.maxApi.workspace.updateRecord(row.id, { positionKey: keys[position]! });
          if (!result.ok) throw new Error(result.error.message);
        }
      }
      window.dispatchEvent(new Event('max:workspace-changed'));
      return;
    }
    await onUpdateRecord(source, { positionKey: generateOrderKey(remaining[index - 1]?.positionKey, remaining[index]?.positionKey) });
  }
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizing = useRef<{ id: string; start: number; width: number } | null>(null);
  const widthFor = (id: string, fallback = 180) => columnWidths[id] ?? columns.find((column) => column.propertyId === id)?.width ?? fallback;
  const resizeHandle = (id: string, fallback = 180) => <span className="database-column-resize" role="separator" aria-label="Resize column" aria-orientation="vertical" onPointerDown={(event) => {
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    resizing.current = { id, start: event.clientX, width: widthFor(id, fallback) };
  }} onPointerMove={(event) => {
    if (resizing.current?.id !== id) return;
    const width = Math.max(100, Math.min(800, resizing.current.width + (event.clientX - resizing.current.start) * (locale === 'ar' ? -1 : 1)));
    setColumnWidths((current) => ({ ...current, [id]: width }));
  }} onPointerUp={(event) => {
    if (!resizing.current) return;
    const width = Math.max(100, Math.min(800, resizing.current.width + (event.clientX - resizing.current.start) * (locale === 'ar' ? -1 : 1)));
    resizing.current = null; onColumnResize?.(id, width);
  }} />;

  const [adding, setAdding] = useState(false);
  const [createdRecordId, setCreatedRecordId] = useState<string | null>(null);
  const [awaitingRow, setAwaitingRow] = useState<WorkspaceRecord | null>(null);

  /**
   * A record the current view cannot show — because a filter, a sort, or the
   * page boundary puts it elsewhere — is opened in the record drawer instead.
   * Adding a row must never look like nothing happened.
   */
  useEffect(() => {
    if (!awaitingRow) return;
    if (!records.some((record) => record.id === awaitingRow.id)) onOpenRecord(awaitingRow);
    setAwaitingRow(null);
  }, [awaitingRow, onOpenRecord, records]);

  if (!schema) return null;

  const properties = schema.properties;



  const handleCreateInline = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const created = await onCreateRecord({ databaseId, properties: {}, title: locale === 'ar' ? 'بدون عنوان' : 'Untitled' });
      if (created) {
        setCreatedRecordId(created.id);
        setAwaitingRow(created);
      }
    } finally { setAdding(false); }
  };

  const handleCellChange = (record: WorkspaceRecord, propertyId: string, value: unknown) => {
    void onUpdateRecord(record.id, {
      properties: {
                [propertyId]: value,
      },
    });
  };

  return (
    <div className="table-view-container">
      {pendingMove && createPortal(<div className="record-sort-confirm-backdrop" onClick={() => { if (!reordering) setPendingMove(null); }}><section role="alertdialog" aria-modal="true" aria-labelledby="remove-record-sorting-title" className="record-sort-confirm" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape' && !reordering) setPendingMove(null);
        if (event.key === 'Tab') {
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
          event.preventDefault(); buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        }
      }}><h3 id="remove-record-sorting-title">{locale === 'ar' ? 'هل تريد إزالة الفرز؟' : 'Would you like to remove sorting?'}</h3>
        {reorderError && <p role="alert">{reorderError}</p>}
        <button className="record-sort-confirm-remove" disabled={reordering} type="button" onClick={() => { setReordering(true); setReorderError(''); void moveRecord(pendingMove.source, pendingMove.target, true).then(() => setPendingMove(null)).catch((error: unknown) => setReorderError(String(error))).finally(() => setReordering(false)); }}>{locale === 'ar' ? 'إزالة' : 'Remove'}</button>
        <button ref={cancelSortingRef} disabled={reordering} type="button" onClick={() => setPendingMove(null)}>{locale === 'ar' ? 'إبقاء الفرز' : "Don't remove"}</button>
      </section></div>, document.body)}

      <div className="table-view-scroll">
        <table className="table-view">
          {/* Header Row */}
          <thead>
            <tr>
              <th className="table-col-action w-8" scope="col"></th>
              <th className="table-col-title" scope="col" style={{ width: widthFor(properties.find((property) => property.type === 'title')?.id ?? '', 320) }}>
                {(() => {
                  const titleProp = properties.find((property) => property.type === 'title');
                  return (
                    <>
                      <button type="button" className="table-header-cell" style={{ cursor: onEditProperty && titleProp ? 'pointer' : 'default' }} onClick={() => { if (onEditProperty && titleProp) onEditProperty(titleProp); }}>
                        <span className="notion-col-type-tag">Aa</span>
                        <span>{titleProp?.name ?? (locale === 'ar' ? 'الاسم' : 'Name')}</span>
                      </button>
                      {titleProp && resizeHandle(titleProp.id, 320)}
                    </>
                  );
                })()}
              </th>

              {properties.map((prop) => {
                if (prop.type === 'title') return null;

                return (
                  <th key={prop.id} className="table-col-custom" scope="col" data-drag-over={dropTarget === prop.id} onDragOver={(event) => { if (dragProperty) { event.preventDefault(); setDropTarget(prop.id); } }} onDrop={(event) => { event.preventDefault(); if (dragProperty) onPropertyMove?.(dragProperty, prop.id); setDragProperty(null); setDropTarget(null); }} style={{ width: widthFor(prop.id) }}>
                    <button type="button" className="table-header-cell" draggable={!!onPropertyMove} onDragStart={(event) => { setDragProperty(prop.id); event.dataTransfer.setData("text/max-column", prop.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setDragProperty(null); setDropTarget(null); }} onClick={() => { if (!dragProperty) onEditProperty?.(prop); }}>
                      <PropertyIcon type={prop.type} icon={typeof prop.config.icon === 'string' ? prop.config.icon : undefined} />
                      <span>{prop.name}</span>
                    </button>
                    {resizeHandle(prop.id)}
                  </th>
                );
              })}
              {onEditProperty && <th scope="col" className="table-col-add"><button className="btn-icon" type="button" aria-label={locale === 'ar' ? 'إضافة خاصية' : 'Add property'} onClick={() => onEditProperty(null)}><Plus size={15} /></button>{onManageProperties && <button className="btn-icon" type="button" aria-label="Show or hide properties" onClick={onManageProperties}><MoreHorizontal size={15}/></button>}</th>}
            </tr>
          </thead>

          {/* Body Rows */}
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="table-row group" data-drag-over={dropTarget === record.id} onDragOver={(event) => { if (dragRecord && dragRecord !== record.id) { event.preventDefault(); setDropTarget(record.id); } }} onDrop={(event) => { event.preventDefault(); if (dragRecord) void moveRecord(dragRecord, record.id); setDragRecord(null); setDropTarget(null); }}>
                {/* Open Drawer Button */}
                <td className="table-cell-action">
                  <button
                    type="button"
                    className="btn-icon p-1 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                    draggable={canReorder}
                    onDragStart={(event) => { if (!canReorder) return; setDragRecord(record.id); event.dataTransfer.setData('text/max-record', record.id); event.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => { setDragRecord(null); setDropTarget(null); }}
                    onClick={() => onOpenRecord(record)}
                    aria-label={locale === 'ar' ? record.title : 'Drag to reorder or click to open'}
                    title={locale === 'ar' ? 'فتح السجل' : 'Open record drawer'}
                  >
                    <GripVertical size={14} />
                  </button>
                </td>

                {/* Title Cell */}
                <td className="table-cell-title">
                  <div className="table-cell-title-content">
                    <PageIconRenderer icon={record.icon || 'lucide:FileText'} size={16} />
                    <input
                      type="text"
                      className="table-cell-input font-medium"
                      style={{ fontWeight: 500 }}
                      placeholder={locale === 'ar' ? 'بدون عنوان' : 'Untitled'}
                      defaultValue={record.title}
                      autoFocus={createdRecordId === record.id}
                      onFocus={(e) => {
                        if (e.target.value === 'Untitled' || e.target.value === 'بدون عنوان') {
                          e.target.select();
                        }
                      }}
                      onBlur={(e) => {
                        if (e.target.value !== record.title) {
                          void onUpdateRecord(record.id, { title: e.target.value });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />
                    <button type="button" className="record-open-button" onClick={() => onOpenRecord(record)} aria-label={locale === 'ar' ? 'فتح الصفحة' : 'Open page'}><PanelLeft size={15} strokeWidth={1.5} />{locale === 'ar' ? 'فتح' : 'OPEN'}</button>
                  </div>
                </td>

                {/* Custom Properties */}
                {properties.map((prop) => {
                  if (prop.type === 'title') return null;
                  const value = record.properties[prop.id];

                  return (
                    <td key={prop.id} className="table-cell-value">
                      {/* Text */}
                      {['text', 'email', 'phone', 'url'].includes(prop.type) && (
                        <input
                          type="text"
                          className="table-cell-input"
                          placeholder="—"
                          defaultValue={formatUnknown(value)}
                          onBlur={(e) => handleCellChange(record, prop.id, e.target.value || null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                        />
                      )}

                      {/* Number */}
                      {prop.type === 'number' && (
                        <input
                          type="text"
                          inputMode="decimal"
                          className="table-cell-input"
                          placeholder="—"
                          defaultValue={typeof value === 'number' ? String(value) : ''}
                          // Arabic-Indic digits are rewritten as they are typed;
                          // see shared/digits.ts for why this is not type=number.
                          onInput={(e) => { e.currentTarget.value = normalizeNumericInput(e.currentTarget.value); }}
                          onBlur={(e) =>
                            handleCellChange(record, prop.id, e.target.value === '' ? null : parseNumericInput(e.target.value) ?? null)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                        />
                      )}

                      {/* Checkbox */}
                      {prop.type === 'checkbox' && (
                        <div className="flex items-center justify-center p-1">
                          <button
                            type="button"
                            className="database-cell-check"
                            data-checked={Boolean(value)}
                            onClick={() => handleCellChange(record, prop.id, !value)}
                            aria-label={prop.name}
                          >
                            {value ? <Check aria-hidden="true" size={11} strokeWidth={3} /> : null}
                          </button>
                        </div>
                      )}

                      {/* Select / Status */}
                      {['select', 'status'].includes(prop.type) && (
                        <OptionValue property={prop} locale={locale} value={value} onChange={(val) => handleCellChange(record, prop.id, val)} />
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
                      {prop.type === 'relation' && <RelationValue recordId={record.id} property={prop} locale={locale} />}
                      {prop.type === 'multi_select' && <MultiSelectValue property={prop} value={value} onChange={(next) => handleCellChange(record, prop.id, next)} />}
                      {/* Formula / Rollup / Auto ID (Read-only badge) */}
                      {['formula', 'rollup', 'auto_id'].includes(prop.type) && (
                        <span className="text-xs px-2 py-1 text-muted">
                          {value !== undefined && value !== null ? formatUnknown(value) : <span className="database-cell-empty">—</span>}
                        </span>
                      )}

                      {/* Timestamps (Read-only) */}
                      {['created_time', 'last_edited_time'].includes(prop.type) && (
                        <span className="text-xs px-2 py-1 text-muted font-mono">
                          {typeof value === 'string' || typeof value === 'number' ? new Date(value).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }) : <span className="database-cell-empty">—</span>}
                        </span>
                      )}

                      {/* File (Read-only summary) */}
                      {prop.type === 'file' && (
                        <span className="text-xs px-2 py-1 text-muted">
                          {Array.isArray(value) && value.length > 0
                            ? `${value.length} file${value.length > 1 ? 's' : ''}`
                            : <span className="database-cell-empty">—</span>}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* The columns are already drawn; only the rows are still arriving. */}
            {loading && records.length === 0 && Array.from({ length: 5 }, (_, row) => (
              <tr aria-hidden="true" className="table-row table-row--pending" key={`pending-${row}`}>
                <td className="table-cell-action" />
                {Array.from({ length: properties.length }, (_, cell) => <td key={cell}><span /></td>)}
              </tr>
            ))}

            {/* Quick Inline New Row */}
            <tr className="table-row-new">
              <td className="table-cell-action">
              </td>
              <td colSpan={properties.length} className="p-0">
                <button type="button" className="database-new-page" disabled={adding} onClick={() => void handleCreateInline()}><Plus size={15} />{locale === 'ar' ? 'صفحة جديدة' : 'New page'}</button>
              </td>
            </tr>
          </tbody>

          {/* Footer Calculations */}
          {(
            <tfoot>
              <tr className="table-footer-row">
                <td className="table-cell-action"></td>
                <td className="table-cell-title text-xs text-muted font-medium px-2 py-1">
                  <span className="database-count-label">{locale === 'ar' ? '\u0627\u0644\u0639\u062f\u062f' : 'COUNT'}</span><span className="database-count-value">{totalCount ?? records.length}</span>
                </td>
                {properties.map((prop) => {
                  if (prop.type === 'title') return null;
                  const calc = calculations.find((c) => c.propertyId === prop.id);
                  return (
                    <td key={prop.id} className="table-cell-value text-xs text-muted font-mono font-medium px-2 py-1">
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
