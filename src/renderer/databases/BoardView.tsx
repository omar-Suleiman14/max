import { Select } from '../ui/select';
import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { generateOrderKey } from '../../shared/order-key';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceRecord, WorkspaceRecordDraft, WorkspaceRecordPatch } from '../../shared/property-contract';

type BoardViewProps = Readonly<{
  databaseId: string;
  groupPropertyId?: string;
  onArchiveRecord?: (recordId: string) => Promise<void>;
  onCreateRecord: (draft: WorkspaceRecordDraft) => Promise<WorkspaceRecord | null>;
  onOpenRecord: (record: WorkspaceRecord) => void;
  onUpdateRecord: (recordId: string, patch: WorkspaceRecordPatch) => Promise<void>;
  records: readonly WorkspaceRecord[];
  schema: DatabaseSchema | null;
}>;

export function BoardView({
  databaseId,
  groupPropertyId,
  onCreateRecord,
  onOpenRecord,
  onUpdateRecord,
  records,
  schema,
}: BoardViewProps) {
  // Find group property (first select or status property)
  const groupProp = schema?.properties.find((p) => p.id === groupPropertyId && ['select', 'status'].includes(p.type))
    ?? schema?.properties.find((p) => ['select', 'status'].includes(p.type)) ?? null;

  const [newCardTitles, setNewCardTitles] = useState<Record<string, string>>({});
  const [addingColumnId, setAddingColumnId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string>();
  const [dropColumn, setDropColumn] = useState<string>();
  const [error, setError] = useState('');
  const moving = useRef(false);

  if (!schema) return null;

  if (!groupProp) {
    return (
      <div className="p-8 text-center text-muted">
        To use Board View, add a <strong>Select</strong> or <strong>Status</strong> property to this database.
      </div>
    );
  }

  const options = groupProp.options || [];
  const columns = [
    ...options.map((opt) => ({
      color: opt.style?.background || '#6366f1',
      id: opt.id || opt.label,
      label: opt.label,
    })),
    { color: '#64748b', id: '__no_group__', label: 'No Status' },
  ];

  const handleCreateInColumn = async (columnId: string) => {
    const title = newCardTitles[columnId]?.trim();
    if (!title) return;

    const propValue = columnId === '__no_group__' ? null : columnId;
    await onCreateRecord({
      databaseId,
      properties: {
        [groupProp.id]: propValue,
      },
      title,
    });

    setNewCardTitles({ ...newCardTitles, [columnId]: '' });
    setAddingColumnId(null);
  };

  const handleMoveRecord = async (record: WorkspaceRecord, targetColumnId: string, beforeId?: string) => {
    if (moving.current) return;
    moving.current = true; setError('');
    const nextVal = targetColumnId === '__no_group__' ? null : targetColumnId;
    const peers = records.filter(candidate => candidate.id !== record.id && (candidate.properties[groupProp.id] || null) === nextVal);
    const target = beforeId ? peers.findIndex(candidate => candidate.id === beforeId) : peers.length;
    try { await onUpdateRecord(record.id, {
      positionKey: generateOrderKey(peers[target - 1]?.positionKey ?? null, peers[target]?.positionKey ?? null),
      properties: {
        [groupProp.id]: nextVal,
      },
    }); } catch (error) { setError(String(error)); } finally { moving.current = false; setDragging(undefined); setDropColumn(undefined); }
  };

  return (
    <div className="board-view-container">
      {error && <p role="alert">{error}</p>}
      <div className="board-view">
        {columns.map((col) => {
          const colRecords = records.filter((r) => {
            const val = r.properties[groupProp.id];
            if (col.id === '__no_group__') {
              return val === undefined || val === null || val === '';
            }
            return String(val) === col.id;
          });

          return (
            <div key={col.id} className="board-column" data-drop-target={dropColumn === col.id || undefined} onDragOver={(event) => { if (!dragging) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropColumn(col.id); const container = event.currentTarget.closest('.board-view'); if (container) { const rect = container.getBoundingClientRect(); if (event.clientX > rect.right - 60) container.scrollLeft += 18; if (event.clientX < rect.left + 60) container.scrollLeft -= 18; } }} onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const record = records.find((candidate) => candidate.id === event.dataTransfer.getData('text/max-record'));
              const before = (event.target as Element).closest<HTMLElement>('[data-record-id]')?.dataset.recordId;
              if (record && before !== record.id) void handleMoveRecord(record, col.id, before);
            }}>
              {/* Column Header */}
              <div className="board-column__header">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
                  <h4 className="board-column__title">{col.label}</h4>
                  <span className="badge badge-secondary text-xs">{colRecords.length}</span>
                </div>
                <button
                  type="button"
                  className="btn-icon p-1"
                  onClick={() => setAddingColumnId(col.id)}
                  title="Add card"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Cards Container */}
              <div className="board-column__cards">
                {colRecords.map((record) => (
                  <div
                    key={record.id}
                    className="board-card"
                    data-record-id={record.id}
                    data-dragging={dragging === record.id || undefined}
                    draggable
                    role="button"
                    tabIndex={0}
                    onDragStart={(event) => { setDragging(record.id); event.dataTransfer.setData('text/max-record', record.id); event.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => { setDragging(undefined); setDropColumn(undefined); }}
                    onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpenRecord(record); } }}
                    onClick={() => onOpenRecord(record)}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="badge badge-secondary text-2xs">#{record.sequence}</span>
                    </div>

                    <h5 className="board-card__title">{record.title}</h5>

                    {/* Quick Move Trigger / Status Pill */}
                    <div className="mt-3 flex items-center justify-between">
                      <Select
                        className="select-clean text-xs font-medium py-0.5 px-1.5 rounded"
                        style={{
                          background: `${col.color}20`,
                          borderColor: `${col.color}40`,
                          color: col.color,
                        }}
                        value={col.id}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { void handleMoveRecord(record, e.target.value); }}
                      >
                        {columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                ))}

                {/* Inline New Card Input */}
                {addingColumnId === col.id ? (
                  <div className="board-card board-card--new p-2">
                    <input
                      type="text"
                      className="input-field text-sm mb-2"
                      placeholder="Card title..."
                      value={newCardTitles[col.id] || ''}
                      onChange={(e) => setNewCardTitles({ ...newCardTitles, [col.id]: e.target.value })}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleCreateInColumn(col.id);
                        if (e.key === 'Escape') setAddingColumnId(null);
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn btn-primary btn-xs"
                        onClick={() => void handleCreateInColumn(col.id)}
                      >
                        Add Card
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => setAddingColumnId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="board-column__add-btn"
                    onClick={() => setAddingColumnId(col.id)}
                  >
                    <Plus size={14} className="mr-1" /> New card
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
