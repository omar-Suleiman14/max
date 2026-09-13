import { GripVertical, Paperclip, Plus, X, ArrowUp, ArrowDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Locale } from '../app/i18n';
import { PropertyIcon } from '../databases/PropertyIcon';

/** A file kept in the workspace, named the way the person chose it. */
export type PageFileValue = Readonly<{ name: string; url: string }>;
export type PagePropertyValue = string | number | boolean | readonly string[] | PageFileValue | null;

/**
 * The property types a page can hold. Relation, Rollup, Formula and Auto ID are
 * deliberately absent: each one is defined by a database — a row to point at, a
 * column to walk, other records to count — and a page is not in one.
 */
export type PagePropertyType =
  | 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'multi_select' | 'status'
  | 'url' | 'email' | 'phone' | 'file' | 'created_time' | 'last_edited_time';

export type PageProperty = Readonly<{ id: string; name: string; type: PagePropertyType; value: PagePropertyValue; options?: readonly string[] }>;

const propertyTypes = ['text', 'number', 'select', 'multi_select', 'status', 'date', 'checkbox', 'url', 'email', 'phone', 'file', 'created_time', 'last_edited_time'] as const;
const STATUS_CHOICES = { ar: ['لم يبدأ', 'قيد التنفيذ', 'تم'], en: ['Not started', 'In progress', 'Done'] } as const;
const typeNames = {
  ar: { text: 'نص', number: 'رقم', date: 'تاريخ', checkbox: 'مربع اختيار', select: 'اختيار', multi_select: 'اختيار متعدد', status: 'الحالة', url: 'رابط', email: 'بريد إلكتروني', phone: 'هاتف', file: 'ملف', created_time: 'وقت الإنشاء', last_edited_time: 'وقت آخر تعديل' },
  en: { text: 'Text', number: 'Number', date: 'Date', checkbox: 'Checkbox', select: 'Select', multi_select: 'Multi-select', status: 'Status', url: 'URL', email: 'Email', phone: 'Phone', file: 'File', created_time: 'Created time', last_edited_time: 'Last edited time' },
} as const;

/** The types that answer for themselves and take no input. */
const READ_ONLY: readonly PagePropertyType[] = ['created_time', 'last_edited_time'];
const asList = (value: PagePropertyValue): readonly string[] => Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
const asFile = (value: PagePropertyValue): PageFileValue | null =>
  value && typeof value === 'object' && !Array.isArray(value) && 'url' in value ? value : null;
const asText = (value: PagePropertyValue): string =>
  value === null || value === undefined || typeof value === 'object' ? '' : String(value);

/**
 * The list of choices a select property offers, edited as chips.
 *
 * Asking for "options, separated by commas" made the page ask for the shape of
 * the data rather than the data, and left no way to see what had been entered.
 */
function ChoiceEditor({ ar, choices, onChange }: { ar: boolean; choices: readonly string[]; onChange: (choices: readonly string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim();
    if (!value || choices.includes(value)) { setDraft(''); return; }
    onChange([...choices, value]);
    setDraft('');
  };
  return <div className="page-property-choices">
    {choices.map((choice) => <span className="page-property-choice" key={choice}>{choice}<button type="button" aria-label={`${ar ? 'إزالة' : 'Remove'} ${choice}`} onClick={() => onChange(choices.filter((candidate) => candidate !== choice))}><X size={10} /></button></span>)}
    <input
      aria-label={ar ? 'أضف خياراً' : 'Add a choice'}
      placeholder={choices.length ? '' : ar ? 'أضف خياراً ثم اضغط Enter' : 'Add a choice, then press Enter'}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={add}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add(); }
        if (event.key === 'Backspace' && !draft && choices.length) onChange(choices.slice(0, -1));
      }}
    />
  </div>;
}

export function PageProperties({ properties = [], onChange, locale, createdAt, updatedAt }: { properties?: readonly PageProperty[]; onChange: (properties: readonly PageProperty[]) => void; locale: Locale; createdAt?: string; updatedAt?: string }) {
  const ar = locale === 'ar';
  const names = typeNames[ar ? 'ar' : 'en'];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<PageProperty['type']>('text');
  const [choices, setChoices] = useState<readonly string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{ property: PageProperty; index: number } | null>(null);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) { setEditingId(null); setAdding(false); } };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  function update(id: string, patch: Partial<PageProperty>) { onChange(properties.map((property) => property.id === id ? { ...property, ...patch } : property)); }
  function move(source: string, target: string) {
    const property = properties.find((candidate) => candidate.id === source);
    if (!property || source === target) return;
    const next = properties.filter((candidate) => candidate.id !== source);
    next.splice(next.findIndex((candidate) => candidate.id === target), 0, property);
    onChange(next); setDragId(null); setOverId(null);
  }
  function startAdding() {
    setName(''); setType('text'); setChoices([]); setEditingId(null); setAdding(true);
  }
  function submitNew() {
    if (!name.trim()) return;
    const seeded = type === 'status' && !choices.length ? STATUS_CHOICES[ar ? 'ar' : 'en'] : choices;
    onChange([...properties, {
      id: crypto.randomUUID(),
      name: name.trim(),
      options: ['select', 'multi_select', 'status'].includes(type) ? [...new Set(seeded)] : undefined,
      type,
      value: type === 'checkbox' ? false : type === 'multi_select' ? [] : null,
    }]);
    setName(''); setChoices([]); setType('text'); setAdding(false);
  }
  return <section ref={root} className="page-properties" onKeyDown={(event) => { if (event.key === 'Escape') { setEditingId(null); setAdding(false); event.stopPropagation(); } }} aria-label={ar ? 'خصائص الصفحة' : 'Page properties'}>
    {properties.map((property, index) => <div className="page-property" key={property.id} data-drag-over={overId === property.id} onDragOver={(event) => { if (dragId) { event.preventDefault(); setOverId(property.id); } }} onDrop={(event) => { event.preventDefault(); if (dragId) move(dragId, property.id); }}>
      <button type="button" className="page-property-grip" draggable aria-label={`${ar ? 'تحريك' : 'Move'} ${property.name}`} title={ar ? 'اسحب لترتيب الخصائص' : 'Drag to reorder; use arrow keys to move'} onDragStart={(event) => { setDragId(property.id); event.dataTransfer.setData('text/max-page-property', property.id); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { setDragId(null); setOverId(null); }} onKeyDown={(event) => {
        if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault(); const next = [...properties]; const target = index + (event.key === 'ArrowUp' ? -1 : 1); const neighbor = next[target];
        if (neighbor) { next[index] = neighbor; next[target] = property; onChange(next); }
      }}><GripVertical size={14} /></button>
      <div className="page-property-name"><PropertyIcon type={property.type} /><input aria-label={ar ? 'اسم الخاصية' : 'Property name'} value={property.name} onChange={(event) => update(property.id, { name: event.target.value })} /></div>
      <div className="page-property-value">
        {property.type === 'checkbox'
          ? <input type="checkbox" aria-label={property.name} checked={property.value === true} onChange={(event) => update(property.id, { value: event.target.checked })} />
          : READ_ONLY.includes(property.type)
            ? <PageTimestampValue ar={ar} at={property.type === 'created_time' ? createdAt : updatedAt} name={property.name} />
            : property.type === 'file'
              ? <PageFileField ar={ar} property={property} onChange={(value) => update(property.id, { value })} />
              : property.type === 'multi_select'
                ? <PageMultiSelectValue ar={ar} property={property} onChange={(value) => update(property.id, { value })} onAddChoice={(choice) => update(property.id, { options: [...new Set([...(property.options ?? []), choice])], value: [...asList(property.value), choice] })} />
                : ['select', 'status'].includes(property.type)
                  ? <PageSelectValue ar={ar} property={property} onPick={(value) => update(property.id, { value })} onAddChoice={(choice) => update(property.id, { options: [...new Set([...(property.options ?? []), choice])], value: choice })} />
                  : <input aria-label={property.name} type={property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : property.type === 'url' ? 'url' : property.type === 'email' ? 'email' : property.type === 'phone' ? 'tel' : 'text'} placeholder={ar ? 'فارغ' : 'Empty'} value={asText(property.value)} onChange={(event) => update(property.id, { value: property.type === 'number' ? event.target.value === '' ? null : Number(event.target.value) : event.target.value })} />}
      </div>
      <button type="button" className="page-property-edit" aria-label={`${ar ? 'إعدادات' : 'Options for'} ${property.name}`} onClick={() => setEditingId(editingId === property.id ? null : property.id)}>•••</button>
      {editingId === property.id && <div className="page-property-options">
        {['select', 'multi_select', 'status'].includes(property.type) && <label>{ar ? 'الخيارات' : 'Choices'}<ChoiceEditor ar={ar} choices={property.options ?? []} onChange={(options) => update(property.id, { options })} /></label>}
        <button type="button" disabled={index === 0} onClick={() => { const previous = properties[index - 1]; if (previous) move(property.id, previous.id); }}><ArrowUp size={13} />{ar ? 'تحريك لأعلى' : 'Move up'}</button>
        <button type="button" disabled={index === properties.length - 1} onClick={() => { const next = [...properties]; const following = next[index + 1]; if (following) { next[index] = following; next[index + 1] = property; onChange(next); } }}><ArrowDown size={13} />{ar ? 'تحريك لأسفل' : 'Move down'}</button>
        <button type="button" onClick={() => { setRemoved({ property, index }); onChange(properties.filter((candidate) => candidate.id !== property.id)); setEditingId(null); }}><X size={13} />{ar ? 'إزالة الخاصية' : 'Remove property'}</button>
      </div>}
    </div>)}
    {removed && <div className="page-property-undo" role="status">{ar ? 'تمت إزالة الخاصية' : 'Property removed'}<button type="button" onClick={() => { const next = [...properties]; next.splice(Math.min(removed.index, next.length), 0, removed.property); onChange(next); setRemoved(null); }}>{ar ? 'تراجع' : 'Undo'}</button></div>}
    <button type="button" className="page-add-property" aria-expanded={adding} onClick={() => adding ? setAdding(false) : startAdding()}><Plus size={14} />{ar ? 'إضافة خاصية' : 'Add a property'}</button>
    {adding && <form className="page-property-form" onSubmit={(event) => { event.preventDefault(); submitNew(); }}>
      <input autoFocus required aria-label={ar ? 'اسم الخاصية الجديدة' : 'New property name'} placeholder={ar ? 'اسم الخاصية' : 'Property name'} value={name} onChange={(event) => setName(event.target.value)} />
      <p className="page-property-form__legend">{ar ? 'النوع' : 'Type'}</p>
      <div className="property-type-menu" role="group" aria-label={ar ? 'نوع الخاصية' : 'Property type'}>
        {propertyTypes.map((value) => <button key={value} type="button" aria-pressed={type === value} onClick={() => setType(value)}><PropertyIcon type={value} />{names[value]}</button>)}
      </div>
      {['select', 'multi_select', 'status'].includes(type) && <>
        <p className="page-property-form__legend">{ar ? 'الخيارات' : 'Choices'}</p>
        <ChoiceEditor ar={ar} choices={choices} onChange={setChoices} />
      </>}
      <div><button type="submit" disabled={!name.trim()}>{ar ? 'إضافة' : 'Add'}</button><button type="button" onClick={() => setAdding(false)}>{ar ? 'إلغاء' : 'Cancel'}</button></div>
    </form>}
  </section>;
}

/** Created and last edited answer themselves from the page's own record. */
function PageTimestampValue({ ar, at, name }: { ar: boolean; at?: string; name: string }) {
  if (!at) return <span className="page-select__empty">{ar ? 'فارغ' : 'Empty'}</span>;
  return <time className="page-property-readonly" aria-label={name} dateTime={at}>{new Date(at).toLocaleString(ar ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' })}</time>;
}

/**
 * A file kept beside the page. Images go to the image store and everything else
 * to the attachment store, both of which name a file by the hash of its bytes,
 * so the page keeps working with the network unplugged.
 */
function PageFileField({ ar, property, onChange }: { ar: boolean; property: PageProperty; onChange: (value: PagePropertyValue) => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const file = asFile(property.value);
  const pick = async (chosen: File) => {
    setBusy(true); setError('');
    try {
      const bytes = new Uint8Array(await chosen.arrayBuffer());
      const result = chosen.type.startsWith('image/')
        ? await window.maxApi.assets.importImage(bytes, chosen.name)
        : await window.maxApi.assets.importAttachment(bytes, chosen.name);
      if (!result.ok) { setError(result.error.message); return; }
      onChange({ name: chosen.name, url: result.value.url });
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  };
  if (file) return <span className="page-property-file">
    <button type="button" aria-label={`${ar ? 'فتح' : 'Open'} ${file.name}`} disabled={busy} onClick={() => {
      if (!file.url.startsWith('max://attachment/')) return;
      void window.maxApi.assets.openAttachment(file.url).then((result) => { if (!result.ok) setError(result.error.message); });
    }}><Paperclip size={12} />{file.name}</button>
    <button type="button" aria-label={`${ar ? 'إزالة' : 'Remove'} ${file.name}`} onClick={() => onChange(null)}><X size={10} /></button>
    {error && <small role="alert">{error}</small>}
  </span>;
  return <label className="page-property-file page-property-file--empty">
    <span>{busy ? (ar ? 'جارٍ الرفع…' : 'Uploading…') : (ar ? 'أضف ملفاً' : 'Add a file')}</span>
    <input aria-label={property.name} disabled={busy} type="file" onChange={(event) => { const chosen = event.target.files?.[0]; if (chosen) void pick(chosen); event.target.value = ''; }} />
    {error && <small role="alert">{error}</small>}
  </label>;
}

/** Several of the same choices a select offers, kept as chips. */
function PageMultiSelectValue({ ar, property, onChange, onAddChoice }: { ar: boolean; property: PageProperty; onChange: (value: readonly string[]) => void; onAddChoice: (choice: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (event.target instanceof Node && !box.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  const picked = asList(property.value);
  const typed = draft.trim();
  return <div className="page-select" ref={box}>
    <button type="button" className="page-select__trigger" aria-label={property.name} aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen(!open); setDraft(''); }}>
      {picked.length
        ? picked.map((choice) => <span className="page-property-choice page-property-choice--static" key={choice}>{choice}</span>)
        : <span className="page-select__empty">{ar ? 'فارغ' : 'Empty'}</span>}
    </button>
    {open && <div className="page-select__popup" role="listbox" aria-label={property.name} aria-multiselectable="true">
      <input
        autoFocus
        aria-label={ar ? 'ابحث أو أنشئ خياراً' : 'Search or create a choice'}
        placeholder={ar ? 'ابحث أو أنشئ خياراً' : 'Search or create a choice'}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && typed) { event.preventDefault(); if (!(property.options ?? []).includes(typed)) onAddChoice(typed); else if (!picked.includes(typed)) onChange([...picked, typed]); setDraft(''); } }}
      />
      {(property.options ?? []).filter((choice) => choice.toLocaleLowerCase().includes(typed.toLocaleLowerCase())).map((choice) => <button key={choice} type="button" role="option" aria-selected={picked.includes(choice)} onClick={() => onChange(picked.includes(choice) ? picked.filter((candidate) => candidate !== choice) : [...picked, choice])}>
        <span className="page-property-choice page-property-choice--static" data-picked={picked.includes(choice) || undefined}>{choice}</span>
      </button>)}
      {!!typed && !(property.options ?? []).includes(typed) && <button type="button" className="page-select__create" onClick={() => { onAddChoice(typed); setDraft(''); }}><Plus size={12} />{ar ? 'إنشاء' : 'Create'} “{typed}”</button>}
      {!(property.options ?? []).length && !typed && <p className="page-select__empty-note">{ar ? 'لا توجد خيارات بعد' : 'No choices yet'}</p>}
    </div>}
  </div>;
}

/** A page's select value: the choices it already has, plus a way to add one. */
function PageSelectValue({ ar, property, onPick, onAddChoice }: { ar: boolean; property: PageProperty; onPick: (value: string | null) => void; onAddChoice: (choice: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (event.target instanceof Node && !box.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  const current = asText(property.value);
  const choices = property.options ?? [];
  const typed = draft.trim();
  return <div className="page-select" ref={box}>
    <button type="button" className="page-select__trigger" aria-label={property.name} aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen(!open); setDraft(''); }}>
      {current ? <span className="page-property-choice page-property-choice--static">{current}</span> : <span className="page-select__empty">{ar ? 'فارغ' : 'Empty'}</span>}
    </button>
    {open && <div className="page-select__popup" role="listbox" aria-label={property.name}>
      <input
        autoFocus
        aria-label={ar ? 'ابحث أو أنشئ خياراً' : 'Search or create a choice'}
        placeholder={ar ? 'ابحث أو أنشئ خياراً' : 'Search or create a choice'}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && typed) { event.preventDefault(); if (!choices.includes(typed)) onAddChoice(typed); else onPick(typed); setOpen(false); } }}
      />
      {current && <button type="button" className="page-select__clear" onClick={() => { onPick(null); setOpen(false); }}>{ar ? 'مسح' : 'Clear'}</button>}
      {choices.filter((choice) => choice.toLocaleLowerCase().includes(typed.toLocaleLowerCase())).map((choice) => <button key={choice} type="button" role="option" aria-selected={choice === current} onClick={() => { onPick(choice); setOpen(false); }}><span className="page-property-choice page-property-choice--static">{choice}</span></button>)}
      {!!typed && !choices.includes(typed) && <button type="button" className="page-select__create" onClick={() => { onAddChoice(typed); setOpen(false); }}><Plus size={12} />{ar ? 'إنشاء' : 'Create'} “{typed}”</button>}
      {!choices.length && !typed && <p className="page-select__empty-note">{ar ? 'لا توجد خيارات بعد' : 'No choices yet'}</p>}
    </div>}
  </div>;
}
