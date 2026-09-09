import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceRecord, WorkspaceRecordDraft } from '../../shared/property-contract';

type ListViewProps = Readonly<{
  databaseId: string;
  onArchiveRecord: (recordId: string) => Promise<void>;
  onCreateRecord: (draft: WorkspaceRecordDraft) => Promise<WorkspaceRecord | null>;
  onOpenRecord: (record: WorkspaceRecord) => void;
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

export function ListView({
  databaseId,
  onArchiveRecord,
  onCreateRecord,
  onOpenRecord,
  records,
  schema,
}: ListViewProps) {
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
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

  return (
    <div className="list-view-container">
      <div className="list-view">
        {records.map((record) => {
          // Extract 2 key properties for display
          const displayProps = schema?.properties.filter((p) => p.type !== 'title').slice(0, 3) || [];

          return (
            <div
              key={record.id}
              className="list-view__row"
              onClick={() => onOpenRecord(record)}
            >
              <div className="list-view__main">
                <span className="badge badge-secondary text-xs">#{record.sequence}</span>
                <span className="list-view__title">{record.title}</span>
              </div>

              <div className="list-view__props">
                {displayProps.map((prop) => {
                  const val = record.properties[prop.id];
                  if (val === undefined || val === null || val === '') return null;


                  if (['select', 'status'].includes(prop.type)) {
                    const opt = prop.options?.find((o) => (o.id || o.label) === val);
                    return (
                      <span
                        key={prop.id}
                        className="badge text-xs"
                        style={{
                          background: opt?.style?.background || '#3b82f6',
                          color: '#ffffff',
                        }}
                      >
                        {opt?.label || formatUnknown(val)}
                      </span>
                    );
                  }

                  return (
                    <span key={prop.id} className="text-xs text-muted">
                      {formatUnknown(val)}
                    </span>
                  );
                })}

                <button
                  type="button"
                  className="btn-icon text-danger p-1 opacity-0 group-hover:opacity-100 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onArchiveRecord(record.id);
                  }}
                  title="Archive record"
                >
                  <Trash2 size={14} />
                </button>

                <ChevronRight size={16} className="text-muted" />
              </div>
            </div>
          );
        })}

        {/* Quick Add Row */}
        <form onSubmit={(e) => { void handleCreate(e); }} className="list-view__new-form">
          <Plus size={16} className="text-muted" />
          <input
            type="text"
            className="input-clean flex-1"
            placeholder="+ New record (press Enter)..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            disabled={adding}
          />
        </form>
      </div>
    </div>
  );
}
