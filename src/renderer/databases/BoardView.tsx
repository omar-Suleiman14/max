import { Plus } from 'lucide-react';
import { useState } from 'react';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceRecord, WorkspaceRecordDraft, WorkspaceRecordPatch } from '../../shared/property-contract';

type BoardViewProps = Readonly<{
  databaseId: string;
  onArchiveRecord?: (recordId: string) => Promise<void>;
  onCreateRecord: (draft: WorkspaceRecordDraft) => Promise<WorkspaceRecord | null>;
  onOpenRecord: (record: WorkspaceRecord) => void;
  onUpdateRecord: (recordId: string, patch: WorkspaceRecordPatch) => Promise<void>;
  records: readonly WorkspaceRecord[];
  schema: DatabaseSchema | null;
}>;

export function BoardView({
  databaseId,
  onCreateRecord,
  onOpenRecord,
  onUpdateRecord,
  records,
  schema,
}: BoardViewProps) {
  // Find group property (first select or status property)
  const groupProp = schema?.properties.find((p) => ['select', 'status'].includes(p.type)) || null;

  const [newCardTitles, setNewCardTitles] = useState<Record<string, string>>({});
  const [addingColumnId, setAddingColumnId] = useState<string | null>(null);

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

  const handleMoveRecord = (record: WorkspaceRecord, targetColumnId: string) => {
    const nextVal = targetColumnId === '__no_group__' ? null : targetColumnId;
    void onUpdateRecord(record.id, {
      properties: {
        ...record.properties,
        [groupProp.id]: nextVal,
      },
    });
  };

  return (
    <div className="board-view-container">
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
            <div key={col.id} className="board-column">
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
                    onClick={() => onOpenRecord(record)}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="badge badge-secondary text-2xs">#{record.sequence}</span>
                    </div>

                    <h5 className="board-card__title">{record.title}</h5>

                    {/* Quick Move Trigger / Status Pill */}
                    <div className="mt-3 flex items-center justify-between">
                      <select
                        className="select-clean text-xs font-medium py-0.5 px-1.5 rounded"
                        style={{
                          background: `${col.color}20`,
                          borderColor: `${col.color}40`,
                          color: col.color,
                        }}
                        value={col.id}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleMoveRecord(record, e.target.value)}
                      >
                        {columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
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
