import { generateOrderKey } from '../../shared/order-key';
import { createPortal } from 'react-dom';
import { RecordTemplateEditor } from './RecordTemplateEditor';
import { PageIconRenderer } from '../ui/page-icon-renderer';
import { GripVertical, ArrowDownAZ, ChevronDown, Columns3, Copy, Download, Filter, GalleryHorizontal, LayoutGrid, List, MoreHorizontal, Plus, Search, Table2, Trash2, X, Calendar } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Locale } from '../app/i18n';
import type { WorkspaceView, WorkspaceViewDraft, WorkspaceViewPatch } from '../../shared/view-contract';
import type { WorkspaceRecordTemplate } from '../../shared/property-contract';

const layouts = [{ id: 'table', name: 'Table', ar: 'جدول', Icon: Table2 }, { id: 'board', name: 'Board', ar: 'لوحة', Icon: Columns3 }, { id: 'list', name: 'List', ar: 'قائمة', Icon: List }, { id: 'calendar', name: 'Calendar', ar: 'تقويم', Icon: Calendar }, { id: 'gallery', name: 'Gallery', ar: 'معرض', Icon: GalleryHorizontal }] as const;
type Props = {
  locale: Locale; databaseId: string; activeView: WorkspaceView | null; views: readonly WorkspaceView[];
  templates: readonly WorkspaceRecordTemplate[]; search: string; filterCount: number; sortCount: number;
  onSearch: (value: string) => void; onSelectView: (view: WorkspaceView) => void;
  onCreate: (templateId?: string) => void; onCreateView: (draft: WorkspaceViewDraft) => Promise<WorkspaceView | null>;
  onUpdateView: (id: string, patch: WorkspaceViewPatch) => Promise<void>; onArchiveView: (id: string) => Promise<void>;
  onFilter: () => void; onSort: () => void; onProperties: () => void; onExport: () => void;
  grouping: ReactNode;
  onArchived?: () => void;
  embedded?: boolean;
  onRemoveEmbeddedView?: () => void;
};
export function DatabaseToolbar(props: Props) {
  const { locale, activeView, views } = props;
  const ar = locale === 'ar';
  const [panel, setPanel] = useState<'settings' | 'layout' | 'new-view' | 'templates' | 'group' | null>(null);
  const [templateEditor, setTemplateEditor] = useState<WorkspaceRecordTemplate | 'new' | null>(null);
  const [dragTemplate, setDragTemplate] = useState<string>();
  const templateReorderLock = useRef(false);
  async function reorderTemplate(id: string, targetId: string) {
    if (id === targetId || templateReorderLock.current) return;
    const ordered = [...props.templates]; const from = ordered.findIndex(t => t.id === id), to = ordered.findIndex(t => t.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1); if (!moved) return; ordered.splice(to, 0, moved);
    templateReorderLock.current = true;
    try {
      const result = await window.maxApi.workspace.editRecordTemplate(props.databaseId, id, { positionKey: generateOrderKey(ordered[to - 1]?.positionKey ?? null, ordered[to + 1]?.positionKey ?? null) });
      if (!result.ok) setTemplateError(result.error.message); else window.dispatchEvent(new Event('max:workspace-changed'));
    } catch { setTemplateError('Could not reorder templates.'); } finally { templateReorderLock.current = false; }
  }
  const [templateMenu, setTemplateMenu] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [newLayout, setNewLayout] = useState<WorkspaceView['layout']>('table');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const deleteLock = useRef(false);
  async function deleteDatabase() {
    if (deleteLock.current) return;
    deleteLock.current = true; setDeleting(true); setDeleteError('');
    try {
      if (props.embedded) {
        props.onRemoveEmbeddedView?.();
        setConfirmDelete(false);
        return;
      }
      const result = await window.maxApi.workspace.permanentlyDeleteDatabase(props.databaseId);
      if (!result.ok) { setDeleteError(result.error.message); return; }
      setConfirmDelete(false);
      props.onArchived?.();
      window.dispatchEvent(new Event('max:workspace-changed'));
    } catch { setDeleteError(ar ? 'تعذر حذف قاعدة البيانات نهائيًا.' : 'Could not permanently delete the database.'); }
    finally { deleteLock.current = false; setDeleting(false); }
  }
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!panel) return;
    const outside = (event: MouseEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setPanel(null); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [panel]);
  const action = (callback: () => void) => { setPanel(null); callback(); };
  return <div className="notion-db-toolbar" ref={root} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setPanel(null); setSearchOpen(false); } }}>
    <div className="notion-db-tabs" role="tablist" aria-label={ar ? 'طرق العرض' : 'Database views'}>
      {views.map((view) => { const Icon = layouts.find((layout) => layout.id === view.layout)?.Icon ?? Table2; return <button key={view.id} type="button" role="tab" aria-selected={view.id === activeView?.id} onClick={() => { if (view.id === activeView?.id) setPanel(panel === 'settings' ? null : 'settings'); else { setPanel(null); props.onSelectView(view); } }}><Icon size={15} /><span>{view.name}</span></button>; })}
      <button className="notion-db-add-view" type="button" aria-label={ar ? 'إضافة عرض' : 'Add a view'} onClick={() => { setViewName(''); setPanel('new-view'); }}><Plus size={16} /></button>
    </div>
    <div className="notion-db-controls">
      {(searchOpen || props.search) && <input className="notion-db-search" autoFocus placeholder={ar ? 'بحث…' : 'Search…'} value={props.search} onChange={(event) => props.onSearch(event.target.value)} aria-label={ar ? 'بحث في قاعدة البيانات' : 'Search database'} />}
      <button type="button" className="notion-db-icon" data-active={props.filterCount > 0} aria-label={ar ? 'تصفية' : 'Filter'} title={ar ? 'تصفية' : 'Filter'} onClick={props.onFilter}><Filter size={16} /></button>
      <button type="button" className="notion-db-icon" data-active={props.sortCount > 0} aria-label={ar ? 'ترتيب' : 'Sort'} title={ar ? 'ترتيب' : 'Sort'} onClick={props.onSort}><ArrowDownAZ size={16} /></button>
      <button type="button" className="notion-db-icon" aria-label={ar ? 'بحث' : 'Search'} title={ar ? 'بحث' : 'Search'} onClick={() => setSearchOpen(!searchOpen)}><Search size={17} /></button>
      <button type="button" className="notion-db-icon" aria-label={ar ? 'إعدادات العرض' : 'View settings'} title={ar ? 'إعدادات العرض' : 'View settings'} aria-expanded={panel === 'settings'} onClick={() => setPanel(panel === 'settings' ? null : 'settings')}><MoreHorizontal size={19} /></button>
      <div className="notion-db-new"><button type="button" onClick={() => props.onCreate(typeof activeView?.layoutConfig.defaultTemplateId === 'string' && props.templates.some((t) => t.id === activeView.layoutConfig.defaultTemplateId) ? activeView.layoutConfig.defaultTemplateId : undefined)}>{ar ? 'جديد' : 'New'}</button><button type="button" aria-label={ar ? 'القوالب' : 'Templates'} aria-expanded={panel === 'templates'} onClick={() => setPanel(panel === 'templates' ? null : 'templates')}><ChevronDown size={15} /></button></div>
    </div>
    {panel && <div className={`notion-db-menu ${panel === 'new-view' ? 'notion-db-menu--start' : ''}`} role="dialog" aria-label={ar ? 'إعدادات قاعدة البيانات' : 'Database options'}>
      <div className="notion-db-menu-heading"><span>{panel === 'templates' ? (ar ? 'قوالب' : 'Templates') : panel === 'new-view' ? (ar ? 'عرض جديد' : 'New view') : panel === 'layout' ? (ar ? 'التخطيط' : 'Layout') : panel === 'group' ? (ar ? 'تجميع' : 'Group') : (ar ? 'إعدادات العرض' : 'View settings')}</span><button type="button" aria-label="Close" onClick={() => setPanel(null)}><X size={14} /></button></div>
      {panel === 'settings' && activeView && <>
        <input className="notion-db-menu-input" aria-label={ar ? 'اسم العرض' : 'View name'} defaultValue={activeView.name} onBlur={(event) => { if (event.target.value.trim() && event.target.value !== activeView.name) void props.onUpdateView(activeView.id, { name: event.target.value.trim() }); }} />
        <button type="button" onClick={() => setPanel('layout')}><LayoutGrid size={16} />{ar ? 'التخطيط' : 'Layout'}<span>{layouts.find((layout) => layout.id === activeView.layout)?.name}<ChevronDown size={13} /></span></button>
        <button type="button" onClick={() => action(props.onProperties)}><Columns3 size={16} />{ar ? 'إظهار الخصائص' : 'Property visibility'}</button>
        <button type="button" onClick={() => action(props.onFilter)}><Filter size={16} />{ar ? 'تصفية' : 'Filter'}</button>
        <button type="button" onClick={() => action(props.onSort)}><ArrowDownAZ size={16} />{ar ? 'ترتيب' : 'Sort'}</button>
        <button type="button" onClick={() => setPanel('group')}><List size={16} />{ar ? 'تجميع' : 'Group'}</button>
        <hr />
        <button type="button" onClick={() => { action(() => { void props.onCreateView({ databaseId: props.databaseId, name: `${activeView.name} copy`, layout: activeView.layout, propertyState: activeView.propertyState, layoutConfig: activeView.layoutConfig, filterAst: activeView.filterAst, sorts: activeView.sorts, group: activeView.group }); }); }}><Copy size={16} />{ar ? 'نسخ العرض' : 'Duplicate view'}</button>
        <button type="button" onClick={() => action(props.onExport)}><Download size={16} />{ar ? 'تصدير Excel' : 'Export Excel'}</button>
        {views.length > 1 && <button type="button" className="notion-db-menu-danger" onClick={() => action(() => { void props.onArchiveView(activeView.id); })}><Trash2 size={16} />{ar ? 'أرشفة العرض' : 'Archive view'}</button>}
        <hr />
        <button type="button" className="notion-db-menu-danger" onClick={() => { setPanel(null); setDeleteError(''); setConfirmDelete(true); }}><Trash2 size={16} />{ar ? 'حذف قاعدة البيانات' : 'Delete database'}</button>
      </>}

      {(panel === 'layout' || panel === 'new-view') && <>
        {panel === 'new-view' && <input autoFocus className="notion-db-menu-input" placeholder={ar ? 'اسم العرض' : 'View name'} value={viewName} onChange={(event) => setViewName(event.target.value)} />}
        <div className="notion-db-layouts">{layouts.map(({id,name,ar: arabic,Icon}) => <button type="button" key={id} aria-pressed={(panel === 'new-view' ? newLayout : activeView?.layout) === id} onClick={() => { if (panel === 'new-view') setNewLayout(id); else if (activeView) void props.onUpdateView(activeView.id, { layout: id }); }}><Icon size={23} /><span>{ar ? arabic : name}</span></button>)}</div>
        {panel === 'layout' && activeView && <label className="notion-db-menu-row">{ar ? 'فتح الصفحات' : 'Open pages in'}<div className="notion-db-segments">{(['center','full','side'] as const).map((mode) => <button type="button" key={mode} aria-pressed={(['side','full'].includes(String(activeView.layoutConfig.pageMode)) ? activeView.layoutConfig.pageMode : 'center') === mode} onClick={() => void props.onUpdateView(activeView.id, { layoutConfig: { ...activeView.layoutConfig, pageMode: mode } })}>{ar ? ({default:'Default',side:'جانبي',center:'وسط',full:'كامل'})[mode] : ({default: 'Default', center: 'Popup', full: 'Full page', side: 'Side peek'})[mode]}</button>)}</div></label>}
        {panel === 'new-view' && <button className="notion-db-menu-primary" type="button" disabled={busy} onClick={() => { setBusy(true); void props.onCreateView({ databaseId: props.databaseId, name: viewName.trim() || layouts.find((layout) => layout.id === newLayout)!.name, layout: newLayout }).then((view) => { if (view) setPanel(null); }).finally(() => setBusy(false)); }}>{ar ? 'إنشاء' : 'Create'}</button>}
      </>}
      {panel === 'group' && <div className="notion-db-group-options">{props.grouping}</div>}
      {panel === 'templates' && <>
        <div className="template-menu-heading">{ar ? 'قوالب قاعدة البيانات' : 'Database templates'}</div>
        {props.templates.map((template) => <div className="template-menu-row" key={template.id} onDragOver={event => { if (dragTemplate) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (dragTemplate) void reorderTemplate(dragTemplate, template.id); setDragTemplate(undefined); }}><button type="button" className="template-drag" aria-label={"Reorder " + template.name} draggable onDragStart={event => { setDragTemplate(template.id); event.dataTransfer.setData("text/plain", template.id); }} onDragEnd={() => setDragTemplate(undefined)} onKeyDown={event => { if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); const index = props.templates.findIndex(t => t.id === template.id); const target = props.templates[index + (event.key === "ArrowUp" ? -1 : 1)]; if (target) void reorderTemplate(template.id, target.id); } }}><GripVertical size={14}/></button><button type="button" onClick={() => action(() => props.onCreate(template.id))}><PageIconRenderer icon={template.icon ?? 'lucide:FileText'} size={16} />{template.name}{activeView?.layoutConfig.defaultTemplateId === template.id && <small>{ar ? 'افتراضي' : 'Default'}</small>}</button><button type="button" aria-label={(ar ? 'إعدادات ' : 'Options for ') + template.name} onClick={() => setTemplateMenu(templateMenu === template.id ? null : template.id)}><MoreHorizontal size={16} /></button>{templateMenu === template.id && <div className="template-menu-actions"><button type="button" onClick={() => { setPanel(null); setTemplateEditor(template); }}>{ar ? 'تحرير' : 'Edit'}</button>{activeView && <button type="button" onClick={() => { void props.onUpdateView(activeView.id, { layoutConfig: { ...activeView.layoutConfig, defaultTemplateId: activeView.layoutConfig.defaultTemplateId === template.id ? null : template.id } }); setTemplateMenu(null); }}>{ar ? 'تغيير الافتراضي' : activeView.layoutConfig.defaultTemplateId === template.id ? 'Remove default' : 'Set as default'}</button>}<button type="button" disabled={busy} onClick={() => { setBusy(true); void window.maxApi.workspace.archiveRecordTemplate(template.id).then((result) => { if (!result.ok) setTemplateError(result.error.message); else { window.dispatchEvent(new Event('max:workspace-changed')); setTemplateMenu(null); } }).catch(() => setTemplateError(ar ? 'تعذر أرشفة القالب.' : 'Could not archive template.')).finally(() => setBusy(false)); }}>{ar ? 'أرشفة' : 'Archive'}</button></div>}</div>)}
        <button type="button" onClick={() => action(() => props.onCreate())}><PageIconRenderer icon="lucide:File" size={16} />{ar ? 'صفحة فارغة' : 'Empty page'}</button><hr /><button type="button" onClick={() => { setPanel(null); setTemplateEditor('new'); }}><Plus size={16} />{ar ? 'قالب جديد' : 'New template'}</button>{templateError && <p role="alert">{templateError}</p>}
      </>}
    </div>}
      {confirmDelete && createPortal(<div className="record-sort-confirm-backdrop" onClick={() => { if (!deleteLock.current) setConfirmDelete(false); }}><section role="alertdialog" aria-modal="true" className="record-sort-confirm" style={{ width: 340, padding: 20 }} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape' && !deleteLock.current) setConfirmDelete(false);
        if (event.key === 'Tab') {
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
          event.preventDefault(); buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        }
      }}><h3>{props.embedded ? (ar ? 'إزالة عرض قاعدة البيانات؟' : 'Remove database view?') : (ar ? 'حذف قاعدة البيانات؟' : 'Delete database?')}</h3>
        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)', marginBottom: 12, marginTop: 0 }}>{props.embedded ? (ar ? 'ستتم إزالة هذا العرض من الصفحة فقط. ستبقى قاعدة البيانات وسجلاتها دون تغيير.' : 'Only this view will be removed from the page. The database and its records will stay unchanged.') : (ar ? 'سيتم حذف جميع الصفوف والخصائص والعروض نهائيًا. لا يمكن التراجع.' : 'All records, properties, and views will be permanently deleted. This cannot be undone.')}</p>
        {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
        <button className="record-sort-confirm-remove" type="button" disabled={deleting} onClick={() => void deleteDatabase()}>{props.embedded ? (ar ? 'إزالة العرض' : 'Remove view') : (ar ? 'حذف قاعدة البيانات' : 'Delete database')}</button>
        <button autoFocus type="button" disabled={deleting} onClick={() => setConfirmDelete(false)}>{ar ? 'إلغاء' : "Cancel"}</button>
      </section></div>, document.body)}
    {templateEditor && <RecordTemplateEditor databaseId={props.databaseId} template={templateEditor === 'new' ? undefined : templateEditor} locale={locale} onClose={() => setTemplateEditor(null)} />}
  </div>;
}
