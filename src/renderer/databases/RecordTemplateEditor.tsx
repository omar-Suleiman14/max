import type { DatabaseSchema } from '../../shared/database-contract';
import { PropertyIcon } from './PropertyIcon';
import { useEffect, useState } from 'react';
import type { WorkspaceRecordTemplate } from '../../shared/property-contract';
import type { Locale } from '../app/i18n';
import { FocusedOverlay } from '../ui/focused-overlay';
import { IconPickerDialog } from '../ui/icon-picker-dialog';
import { PageIconRenderer } from '../ui/page-icon-renderer';
import { NotionBlockEditor, type NotionBlock } from '../ui/notion-block-editor';

export function RecordTemplateEditor({ databaseId, template, locale, onClose }: { databaseId: string; template?: WorkspaceRecordTemplate; locale: Locale; onClose: () => void }) {
  const ar = locale === 'ar';
  const [schema, setSchema] = useState<DatabaseSchema | null>(null);
  useEffect(() => { let active = true; void window.maxApi.workspace.getDatabaseSchema(databaseId).then(next => { if (active) setSchema(next); }); return () => { active = false; }; }, [databaseId]);
  const [name, setName] = useState(template?.name ?? '');
  const [icon, setIcon] = useState(template?.icon ?? 'lucide:FileText');
  const [pickIcon, setPickIcon] = useState(false);
  const [blocks, setBlocks] = useState<readonly NotionBlock[]>(() => {
    try { const parsed: unknown = JSON.parse(template?.contentJson ?? '[]'); if (Array.isArray(parsed) && parsed.length) return parsed as NotionBlock[]; } catch { /* Start an empty template. */ }
    return [{ id: crypto.randomUUID(), type: 'text', content: '' }];
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <FocusedOverlay labelId="record-template-title" className="record-template-editor" onClose={() => { if (!busy) onClose(); }}>
    <h2 id="record-template-title" className="template-edit-banner">{ar ? 'تعديل قالب في' : 'Editing a template in'} <strong>{schema?.database.title}</strong></h2>
    <div className="record-template-name"><button type="button" aria-label={ar ? 'اختر أيقونة' : 'Choose icon'} onClick={() => setPickIcon(true)}><PageIconRenderer icon={icon} size={24} /></button><input data-autofocus="true" aria-label={ar ? 'اسم القالب' : 'Template name'} placeholder={ar ? 'اسم القالب' : 'Template name'} value={name} onChange={(e) => setName(e.target.value)} /></div>
    <div className="template-property-preview">{schema?.properties.filter(p => p.type !== 'title').map(p => <div key={p.id}><span><PropertyIcon type={p.type}/>{p.name}</span><span>{template?.defaults[p.id] == null ? (ar ? 'فارغ' : 'Empty') : String(template.defaults[p.id])}</span></div>)}</div>
    <NotionBlockEditor blocks={blocks} locale={locale} onChange={setBlocks} />
    {error && <p role="alert">{error}</p>}
    <footer><button type="button" disabled={busy || !name.trim()} onClick={() => { setBusy(true); setError(''); void window.maxApi.workspace.editRecordTemplate(databaseId, template?.id ?? null, { title: name, icon, contentJson: JSON.stringify(blocks) }).then((result) => { if (!result.ok) { setError(result.error.message); return; } window.dispatchEvent(new Event('max:workspace-changed')); onClose(); }).catch(() => setError(ar ? 'تعذر حفظ القالب.' : 'Could not save template.')).finally(() => setBusy(false)); }}>{ar ? 'حفظ القالب' : 'Save template'}</button><button type="button" disabled={busy} onClick={onClose}>{ar ? 'إلغاء' : 'Cancel'}</button></footer>
    {pickIcon && <IconPickerDialog locale={locale} currentIcon={icon} onClose={() => setPickIcon(false)} onSelect={(next) => { setIcon(next); setPickIcon(false); }} />}
  </FocusedOverlay>;
}
