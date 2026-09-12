import { OptionValue } from './OptionValue';
import { IconPickerDialog } from '../ui/icon-picker-dialog';
import { PageIconRenderer } from '../ui/page-icon-renderer';
import { RelationValue } from './RelationValue';
import { PropertyEditor } from './PropertyEditor';
import { generateOrderKey } from '../../shared/order-key';
import { parseNumericInput } from '../../shared/digits';
import { NumberInput } from '../ui/number-input';
import { GripVertical, Plus } from 'lucide-react';
import { MultiSelectValue } from './MultiSelectValue';
import { isRequirementUnmet, unmetRequirements } from './required-properties';

import {
  Calendar,
  CheckSquare,
  CircleDot,
  Hash,
  Link2,
  List,
  Sigma,
  Trash2,
  Type,
  X,
  Copy,
  File,
  Maximize2,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

import type { Locale } from '../app/i18n';
import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceRecord, WorkspaceRecordPatch } from '../../shared/property-contract';
import { NotionBlockEditor, type NotionBlock } from '../ui/notion-block-editor';

type RecordDrawerProps = Readonly<{
  isOpen: boolean;
  locale?: Locale;
  pageMode?: 'side' | 'center' | 'full';
  onArchive: (recordId: string) => Promise<void>;
  onClose: () => void;
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
  pageMode = 'center',
  onArchive,
  onClose,
  record,
  schema: sourceSchema,
}: RecordDrawerProps) {
  const [localSchema, setLocalSchema] = useState<DatabaseSchema | null>(null);
  const schema = localSchema ?? sourceSchema;
  const [addingProperty, setAddingProperty] = useState(false);
  const [dragProperty, setDragProperty] = useState<string | null>(null);
  const [dropProperty, setDropProperty] = useState<string | null>(null);
  async function moveProperty(source: string, target: string) {
    if (!schema || source === target) return;
    const remaining = schema.properties.filter((property) => property.id !== source);
    const index = remaining.findIndex((property) => property.id === target);
    const moved = schema.properties.find((property) => property.id === source);
    if (index < 0 || !moved) return;
    const positionKey = generateOrderKey(remaining[index - 1]?.positionKey, remaining[index]!.positionKey);
    const result = await window.maxApi.workspace.updateProperty(source, { positionKey });
    if (!result.ok) { setSaveError(result.error.message); return; }
    remaining.splice(index, 0, { ...moved, positionKey });
    setLocalSchema({ ...schema, properties: remaining });
    window.dispatchEvent(new Event('max:workspace-changed'));
  }
  const [icon, setIcon] = useState(record?.icon ?? '');
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const iconButtonRef = useRef<HTMLButtonElement>(null);
  const [title, setTitle] = useState(record?.title || '');
  const [properties, setProperties] = useState<Record<string, unknown>>(() => ({ ...(record?.properties || {}) }));
  const [blocks, setBlocks] = useState<readonly NotionBlock[]>([]);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [displayMode, setDisplayMode] = useState(pageMode);
  const fullPage = displayMode === 'full';
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [templateSaved, setTemplateSaved] = useState(false);
  const saveQueue = useRef(Promise.resolve());
  const pendingContent = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatch = useRef<WorkspaceRecordPatch | null>(null);
  const failedPatch = useRef<WorkspaceRecordPatch | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const save = (patch: WorkspaceRecordPatch) => {
    if (!record) return Promise.resolve();
    const id = record.id;
    setSaving(true);
    saveQueue.current = saveQueue.current.then(async () => {
      const result = await window.maxApi.workspace.updateRecord(id, patch);
      if (!result.ok) throw new Error(result.error.message);
      if (failedPatch.current === patch) failedPatch.current = null;
      if (!failedPatch.current) setSaveError('');
      window.dispatchEvent(new Event('max:workspace-changed'));
    }).catch((cause: unknown) => { failedPatch.current = { ...failedPatch.current, ...patch, properties: { ...failedPatch.current?.properties, ...patch.properties } }; setSaveError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => setSaving(false));
    return saveQueue.current;
  };
  const flush = () => {
    if (pendingContent.current) clearTimeout(pendingContent.current);
    const patch = pendingPatch.current;
    pendingPatch.current = null;
    return patch ? save(patch) : saveQueue.current;
  };
  const close = () => { void flush().then(() => { if (!failedPatch.current) onClose(); }); };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => { void flushRef.current(); }, []);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    drawerRef.current?.querySelector<HTMLInputElement>('.record-drawer__title-input')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [isOpen]);

  useEffect(() => {
    if (record) {
      const empty: readonly NotionBlock[] = [{ id: `content_${record.id}`, type: 'text', content: '' }];
      setTitle(record.title);
      setProperties({ ...record.properties });
      if (record.contentJson) {
        try {
          const parsed = JSON.parse(record.contentJson) as unknown;
          const content = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && 'blocks' in parsed ? parsed.blocks : null;
          setBlocks(Array.isArray(content) && content.length ? content as readonly NotionBlock[] : empty);
        } catch {
          setBlocks(empty);
        }
      } else {
        setBlocks(empty);
      }
    }
  }, [record]);

  if (!isOpen || !record || !schema) return null;

  const missingRequired = unmetRequirements(schema.properties, properties, title);

  const handleTitleBlur = () => {
    if (title.trim() !== record.title) {
      void save({ title: title.trim() || 'Untitled' });
    }
  };

  const handlePropertyChange = (propertyId: string, value: unknown) => {
    const next = { ...properties, [propertyId]: value };
    setProperties(next);
    void save({ properties: { [propertyId]: value } });
  };

  const handleBlocksChange = (newBlocks: readonly NotionBlock[]) => {
    setBlocks(newBlocks);
    pendingPatch.current = { contentJson: JSON.stringify(newBlocks) };
    if (pendingContent.current) clearTimeout(pendingContent.current);
    pendingContent.current = setTimeout(() => { void flush(); }, 400);
  };

  return (
    <>
      <div className="drawer-backdrop" data-page-mode={displayMode} onClick={close} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); if (iconPickerOpen) setIconPickerOpen(false); else if (addingProperty) setAddingProperty(false); else close(); } }} role="dialog" aria-modal="true" aria-label={record.title}>
        <div ref={drawerRef} className="drawer-container record-drawer" data-full-page={fullPage} onClick={(e) => e.stopPropagation()} onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),[contenteditable=true],[tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
          const first = controls[0], last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
          {/* Header */}
          <div className="drawer-header">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">{schema.database.title} / {title || 'Untitled'}</span>
              <span className="text-xs text-muted" role="status">{saving ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'محفوظ' : 'Saved')}</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-icon" aria-label={locale === 'ar' ? 'حفظ كقالب' : 'Save as template'} onClick={() => { setTemplateSaved(false); setTemplateName(title); }}><Copy size={16} /></button>
              <button type="button" className="btn-icon" aria-label={fullPage ? (locale === 'ar' ? 'عرض منبثق' : 'Open as popup') : (locale === 'ar' ? 'فتح كصفحة كاملة' : 'Open as full page')} onClick={() => setDisplayMode(fullPage ? 'center' : 'full')}><Maximize2 size={16} /></button>
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
              <button type="button" className="btn-icon" onClick={close} aria-label="Close">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="drawer-body" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.querySelector('.notion-editor-canvas')?.dispatchEvent(new Event('max:focus-page-end')); }}>
            {saveError && <p className="form-error" role="alert">{saveError} {failedPatch.current && <button type="button" className="btn" onClick={() => { if (failedPatch.current) void save(failedPatch.current); }}>{locale === 'ar' ? 'إعادة المحاولة' : 'Retry'}</button>}</p>}
            {templateName !== null && <form className="template-save-form" onSubmit={(event) => {
              event.preventDefault();
              void flush().then(async () => {
                if (failedPatch.current) return;
                const result = await window.maxApi.workspace.saveRecordTemplate(record.id, templateName);
                if (!result.ok) { setSaveError(result.error.message); return; }
                setTemplateName(null); setTemplateSaved(true);
                window.dispatchEvent(new Event('max:workspace-changed'));
              }).catch((cause: unknown) => setSaveError(String(cause)));
            }}><input aria-label="Template name" className="input-field" value={templateName} onChange={(event) => setTemplateName(event.target.value)} required /><button className="btn btn-primary" type="submit">{locale === 'ar' ? 'حفظ القالب' : 'Save template'}</button><button type="button" className="btn" onClick={() => setTemplateName(null)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button></form>}
            {templateSaved && <p role="status">{locale === 'ar' ? 'القالب متاح في قائمة جديد.' : 'Template added to the New menu.'}</p>}
            <div className="record-page-icon-wrap">
              <button ref={iconButtonRef} type="button" className="record-page-icon" aria-label={locale === 'ar' ? 'تغيير أيقونة الصفحة' : 'Change page icon'} onClick={() => setIconPickerOpen(!iconPickerOpen)}><PageIconRenderer icon={icon || 'lucide:FileText'} size={40} /></button>
              {iconPickerOpen && <IconPickerDialog anchor={iconButtonRef.current} currentIcon={icon} locale={locale} onClose={() => setIconPickerOpen(false)} onSelect={(next) => { setIcon(next); setIconPickerOpen(false); void save({ icon: next || null }); }} />}
            </div>
            {/* Record Title Input */}
            <input
              type="text"
              className="record-drawer__title-input"
              aria-label={locale === 'ar' ? 'عنوان الصفحة' : 'Page title'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              placeholder="Untitled record"
            />

            {/* Required properties are reported here rather than blocking the
                save, so a half-filled record stays editable until it is done. */}
            {missingRequired.length > 0 && (
              <p className="record-required-summary" role="status">
                {locale === 'ar'
                  ? `ما زالت ${missingRequired.length} خاصية مطلوبة بحاجة إلى قيمة: ${missingRequired.map(({ name }) => name).join('، ')}`
                  : `${missingRequired.length} required ${missingRequired.length === 1 ? 'property still needs' : 'properties still need'} a value: ${missingRequired.map(({ name }) => name).join(', ')}`}
              </p>
            )}

            {/* Properties Table */}
            <div className="record-drawer__properties">
              {schema.properties.map((prop) => {
                if (prop.type === 'title') return null;
                const value = properties[prop.id];
                const unmet = isRequirementUnmet(prop, value);

                return (
                  <div key={prop.id} className="record-drawer__prop-row" data-required-unmet={unmet || undefined} data-drag-over={dropProperty === prop.id} onDragOver={(event) => { if (dragProperty) { event.preventDefault(); setDropProperty(prop.id); } }} onDrop={(event) => { event.preventDefault(); if (dragProperty) void moveProperty(dragProperty, prop.id); setDragProperty(null); setDropProperty(null); }}>
                    <div className="record-drawer__prop-label">
                      <button type="button" className="record-property-grip" draggable aria-label={`${locale === 'ar' ? 'تحريك' : 'Move'} ${prop.name}`} onDragStart={(event) => { setDragProperty(prop.id); event.dataTransfer.setData('text/max-property', prop.id); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { setDragProperty(null); setDropProperty(null); }} onKeyDown={(event) => { if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return; event.preventDefault(); const list = schema.properties.filter((property) => property.type !== 'title'); const index = list.findIndex((property) => property.id === prop.id); if (event.key === 'ArrowUp' && list[index - 1]) void moveProperty(prop.id, list[index - 1]!.id); if (event.key === 'ArrowDown' && list[index + 1]) void moveProperty(list[index + 1]!.id, prop.id); }}><GripVertical size={13} /></button>
                      {prop.type === 'text' && <Type size={14} className="text-muted" />}
                      {prop.type === 'number' && <Hash size={14} className="text-muted" />}
                      {['select', 'status'].includes(prop.type) && <CircleDot size={14} className="text-muted" />}
                      {prop.type === 'multi_select' && <List size={14} className="text-muted" />}
                      {prop.type === 'date' && <Calendar size={14} className="text-muted" />}
                      {prop.type === 'checkbox' && <CheckSquare size={14} className="text-muted" />}
                      {prop.type === 'relation' && <Link2 size={14} className="text-muted" />}
                      {prop.type === 'formula' && <Sigma size={14} className="text-muted" />}
                      {prop.type === 'rollup' && <Sigma size={14} className="text-muted" />}
                      <span>{prop.name}</span>
                      {prop.required && (
                        <span
                          className="record-required-mark"
                          data-unmet={unmet || undefined}
                          title={locale === 'ar' ? 'خاصية مطلوبة' : 'Required property'}
                        >
                          *<span className="sr-only">{locale === 'ar' ? ' مطلوب' : ' required'}</span>
                        </span>
                      )}
                    </div>

                    <div className="record-drawer__prop-value">
                      {/* Text */}
                      {['text', 'email', 'phone', 'url'].includes(prop.type) && (
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
                        <NumberInput
                          className="input-clean"
                          placeholder="Empty"
                          value={typeof value === 'number' ? String(value) : ''}
                          onValueChange={(next) =>
                            handlePropertyChange(prop.id, next === '' ? null : parseNumericInput(next) ?? null)
                          }
                        />
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
                        <OptionValue property={prop} value={value} locale={locale} onChange={(next) => handlePropertyChange(prop.id, next)} />
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
                      {prop.type === 'relation' && <RelationValue recordId={record.id} property={prop} locale={locale} />}
                      {prop.type === 'multi_select' && <MultiSelectValue property={prop} value={value} onChange={(next) => handlePropertyChange(prop.id, next)} />}

                      {/* File */}
                      {prop.type === 'file' && (
                        <div className="flex flex-col gap-1 w-full">
                          {Array.isArray(value) && value.filter((item): item is string => typeof item === 'string').map((v, idx, files) => (
                            <div key={idx} className="flex items-center gap-2">
                              <button type="button" className="text-sm text-primary hover:underline break-all" onClick={() => { if (typeof v === 'string') void window.maxApi.workspace.openExternal(v); }}>
                                {typeof v === 'string' ? v.split(/[/\\]/).pop() : 'Attachment'}
                              </button>
                              <button
                                type="button"
                                className="btn-icon text-danger"
                                onClick={() => {
                                  const next = [...files];
                                  next.splice(idx, 1);
                                  handlePropertyChange(prop.id, next.length ? next : null);
                                }}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                          <label className="btn btn-sm btn-secondary w-fit cursor-pointer mt-1">
                            <input
                              type="file"
                              className="sr-only"
                              onChange={(event) => { void (async () => {
                                const file = event.target.files?.item(0);
                                const filePath = file && 'path' in file && typeof file.path === 'string' ? file.path : undefined;
                                if (!filePath) return;
                                const result = await window.maxApi.workspace.importFile(filePath);
                                if (result.ok) {
                                  const current = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
                                  handlePropertyChange(prop.id, [...current, result.value]);
                                }
                                event.target.value = '';
                              })(); }}
                            />
                            <File size={14} className="mr-1" /> {locale === 'ar' ? 'إرفاق ملف' : 'Attach file'}
                          </label>
                        </div>
                      )}
                      {/* Formula / Rollup / Auto ID (Read-only) */}
                      {['formula', 'rollup', 'auto_id'].includes(prop.type) && (
                        <span className="badge badge-primary font-mono">
                          {value !== undefined && value !== null ? formatUnknown(value) : '—'}
                        </span>
                      )}

                      {/* Timestamps (Read-only) */}
                      {['created_time', 'last_edited_time'].includes(prop.type) && (
                        <span className="text-sm text-muted font-mono">
                          {typeof value === 'string' || typeof value === 'number' ? new Date(value).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button type="button" className="page-add-property" onClick={() => setAddingProperty(true)}><Plus size={14} />{locale === 'ar' ? 'إضافة خاصية' : 'Add a property'}</button>
            <PropertyEditor databaseId={record.databaseId} schema={schema} isOpen={addingProperty} onClose={() => setAddingProperty(false)} onSave={async (draft) => {
              if (!('type' in draft)) return null;
              const result = await window.maxApi.workspace.createProperty(draft);
              if (!result.ok) { setSaveError(result.error.message); return null; }
              const refreshed = await window.maxApi.workspace.getDatabaseSchema(record.databaseId);
              setLocalSchema(refreshed);
              window.dispatchEvent(new Event('max:workspace-changed'));
              return result.value;
            }} />
            <hr className="divider my-6" />

            {/* Notion Block Page Body */}
            <div className="record-drawer__notes">
              <NotionBlockEditor blocks={blocks} locale={locale} onChange={handleBlocksChange} />
            </div>
          </div>
        </div>
      </div>

    </>
  );
}
