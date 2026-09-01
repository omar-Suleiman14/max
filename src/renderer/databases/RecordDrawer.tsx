import {
  Calendar,
  CheckSquare,
  CircleDot,
  DollarSign,
  Hash,
  Link2,
  List,
  Sigma,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { useState, useEffect } from 'react';

import type { Locale } from '../app/i18n';
import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceProperty, WorkspaceRecord, WorkspaceRecordPatch } from '../../shared/property-contract';
import { NotionBlockEditor, type NotionBlock } from '../ui/notion-block-editor';
import { RelationPicker } from './RelationPicker';

type RecordDrawerProps = Readonly<{
  isOpen: boolean;
  locale?: Locale;
  onArchive: (recordId: string) => Promise<void>;
  onClose: () => void;
  onUpdate: (recordId: string, patch: WorkspaceRecordPatch) => Promise<void>;
  record: WorkspaceRecord | null;
  schema: DatabaseSchema | null;
}>;

function formatUnknown(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

export function RecordDrawer({
  isOpen,
  locale = 'en',
  onArchive,
  onClose,
  onUpdate,
  record,
  schema,
}: RecordDrawerProps) {
  const [title, setTitle] = useState(record?.title || '');
  const [properties, setProperties] = useState<Record<string, unknown>>(() => ({ ...(record?.properties || {}) }));
  const [activeRelationProp, setActiveRelationProp] = useState<WorkspaceProperty | null>(null);
  const [relationPickerOpen, setRelationPickerOpen] = useState(false);
  const [blocks, setBlocks] = useState<readonly NotionBlock[]>([]);

  useEffect(() => {
    if (record) {
      setTitle(record.title);
      setProperties({ ...record.properties });
      if (record.contentJson) {
        try {
          const parsed = JSON.parse(record.contentJson) as unknown;
          if (Array.isArray(parsed)) {
            setBlocks(parsed as readonly NotionBlock[]);
          }
        } catch {
          setBlocks([]);
        }
      } else {
        setBlocks([]);
      }
    }
  }, [record]);

  if (!isOpen || !record || !schema) return null;

  const handleTitleBlur = () => {
    if (title.trim() !== record.title) {
      void onUpdate(record.id, { title: title.trim() || 'Untitled' });
    }
  };

  const handlePropertyChange = (propertyId: string, value: unknown) => {
    const next = { ...properties, [propertyId]: value };
    setProperties(next);
    void onUpdate(record.id, { properties: { [propertyId]: value } });
  };

  const handleBlocksChange = (newBlocks: readonly NotionBlock[]) => {
    setBlocks(newBlocks);
    void onUpdate(record.id, { contentJson: JSON.stringify(newBlocks) });
  };

  const handleLinkRecord = async (targetId: string) => {
    if (!activeRelationProp) return;
    const relationId = activeRelationProp.config.relationId;
    if (!relationId || typeof relationId !== 'string') return;
    await window.maxApi.workspace.linkRecords(relationId, record.id, targetId);
    // Refresh properties
    const current = (properties[activeRelationProp.id] as string[]) || [];
    if (!current.includes(targetId)) {
      handlePropertyChange(activeRelationProp.id, [...current, targetId]);
    }
  };

  const handleUnlinkRecord = async (targetId: string) => {
    if (!activeRelationProp) return;
    const relationId = activeRelationProp.config.relationId;
    if (!relationId || typeof relationId !== 'string') return;
    await window.maxApi.workspace.unlinkRecords(relationId, record.id, targetId);
    const current = (properties[activeRelationProp.id] as string[]) || [];
    handlePropertyChange(activeRelationProp.id, current.filter((id) => id !== targetId));
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} role="dialog" aria-modal="true">
        <div className="drawer-container record-drawer" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="drawer-header">
            <div className="flex items-center gap-2">
              <span className="badge badge-secondary text-xs">#{record.sequence}</span>
              <span className="text-xs text-muted">Created {new Date(record.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-icon text-danger"
                onClick={() => {
                  void onArchive(record.id);
                  onClose();
                }}
                title="Archive record"
              >
                <Trash2 size={16} />
              </button>
              <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="drawer-body">
            {/* Record Title Input */}
            <input
              type="text"
              className="record-drawer__title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              placeholder="Untitled record"
            />

            {/* Properties Table */}
            <div className="record-drawer__properties">
              {schema.properties.map((prop) => {
                if (prop.type === 'title') return null;
                const value = properties[prop.id];

                return (
                  <div key={prop.id} className="record-drawer__prop-row">
                    <div className="record-drawer__prop-label">
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

                    <div className="record-drawer__prop-value">
                      {/* Text */}
                      {prop.type === 'text' && (
                        <input
                          type="text"
                          className="input-clean"
                          placeholder="Empty"
                          value={formatUnknown(value)}
                          onChange={(e) => handlePropertyChange(prop.id, e.target.value)}
                        />
                      )}

                      {/* Number */}
                      {prop.type === 'number' && (
                        <input
                          type="number"
                          className="input-clean"
                          placeholder="Empty"
                          value={typeof value === 'number' ? value : ''}
                          onChange={(e) =>
                            handlePropertyChange(prop.id, e.target.value === '' ? null : Number(e.target.value))
                          }
                        />
                      )}

                      {/* Money */}
                      {prop.type === 'money' && (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            className="input-clean"
                            placeholder="0.00"
                            value={typeof value === 'number' ? value : ''}
                            onChange={(e) =>
                              handlePropertyChange(prop.id, e.target.value === '' ? null : Number(e.target.value))
                            }
                          />
                        </div>
                      )}

                      {/* Checkbox */}
                      {prop.type === 'checkbox' && (
                        <input
                          type="checkbox"
                          className="checkbox-custom"
                          checked={Boolean(value)}
                          onChange={(e) => handlePropertyChange(prop.id, e.target.checked)}
                        />
                      )}

                      {/* Select / Status */}
                      {['select', 'status'].includes(prop.type) && (
                        <select
                          className="select-clean"
                          value={formatUnknown(value)}
                          onChange={(e) => handlePropertyChange(prop.id, e.target.value || null)}
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
                          className="input-clean"
                          value={typeof value === 'string' ? value.slice(0, 10) : ''}
                          onChange={(e) => handlePropertyChange(prop.id, e.target.value || null)}
                        />
                      )}

                      {/* Relation */}
                      {prop.type === 'relation' && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setActiveRelationProp(prop);
                            setRelationPickerOpen(true);
                          }}
                        >
                          <Link2 size={13} className="mr-1" />
                          {Array.isArray(value) && value.length > 0 ? `${value.length} connected` : 'Connect record...'}
                        </button>
                      )}

                      {/* Formula / Rollup (Read-only) */}
                      {['formula', 'rollup'].includes(prop.type) && (
                        <span className="badge badge-primary font-mono">
                          {value !== undefined && value !== null ? formatUnknown(value) : '—'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <hr className="divider my-6" />

            {/* Notion Block Page Body */}
            <div className="record-drawer__notes">
              <h4 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Notes &amp; Content</h4>
              <NotionBlockEditor blocks={blocks} locale={locale} onChange={handleBlocksChange} />
            </div>
          </div>
        </div>
      </div>

      {/* Relation Picker Modal */}
      {activeRelationProp && typeof activeRelationProp.config.relationId === 'string' && (
        <RelationPicker
          isOpen={relationPickerOpen}
          onClose={() => {
            setRelationPickerOpen(false);
            setActiveRelationProp(null);
          }}
          relationId={activeRelationProp.config.relationId}
          selectedTargetIds={Array.isArray(properties[activeRelationProp.id]) ? (properties[activeRelationProp.id] as string[]) : []}
          onLink={handleLinkRecord}
          onUnlink={handleUnlinkRecord}
          title={`Link ${activeRelationProp.name}`}
        />
      )}
    </>
  );
}
