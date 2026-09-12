import { GripVertical, Plus, X, ArrowUp, ArrowDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Locale } from '../app/i18n';
import { PropertyIcon } from '../databases/PropertyIcon';

export type PageProperty = Readonly<{ id: string; name: string; type: 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'url'; value: string | number | boolean | null; options?: readonly string[] }>;

const propertyTypes = ['text', 'number', 'date', 'checkbox', 'select', 'url'] as const;
const typeNames = {
  ar: { text: 'نص', number: 'رقم', date: 'تاريخ', checkbox: 'مربع اختيار', select: 'اختيار', url: 'رابط' },
  en: { text: 'Text', number: 'Number', date: 'Date', checkbox: 'Checkbox', select: 'Select', url: 'URL' },
} as const;

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

export function PageProperties({ properties = [], onChange, locale }: { properties?: readonly PageProperty[]; onChange: (properties: readonly PageProperty[]) => void; locale: Locale }) {
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
    onChange([...properties, { id: crypto.randomUUID(), name: name.trim(), type, value: type === 'checkbox' ? false : null, options: type === 'select' ? [...new Set(choices)] : undefined }]);
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
          : property.type === 'select'
            ? <PageSelectValue ar={ar} property={property} onPick={(value) => update(property.id, { value })} onAddChoice={(choice) => update(property.id, { options: [...new Set([...(property.options ?? []), choice])], value: choice })} />
            : <input aria-label={property.name} type={property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : property.type === 'url' ? 'url' : 'text'} placeholder={ar ? 'فارغ' : 'Empty'} value={property.value === null ? '' : String(property.value)} onChange={(event) => update(property.id, { value: property.type === 'number' ? event.target.value === '' ? null : Number(event.target.value) : event.target.value })} />}
      </div>
      <button type="button" className="page-property-edit" aria-label={`${ar ? 'إعدادات' : 'Options for'} ${property.name}`} onClick={() => setEditingId(editingId === property.id ? null : property.id)}>•••</button>
      {editingId === property.id && <div className="page-property-options">
        {property.type === 'select' && <label>{ar ? 'الخيارات' : 'Choices'}<ChoiceEditor ar={ar} choices={property.options ?? []} onChange={(options) => update(property.id, { options })} /></label>}
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
      {type === 'select' && <>
        <p className="page-property-form__legend">{ar ? 'الخيارات' : 'Choices'}</p>
        <ChoiceEditor ar={ar} choices={choices} onChange={setChoices} />
      </>}
      <div><button type="submit" disabled={!name.trim()}>{ar ? 'إضافة' : 'Add'}</button><button type="button" onClick={() => setAdding(false)}>{ar ? 'إلغاء' : 'Cancel'}</button></div>
    </form>}
  </section>;
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
  const current = property.value === null || property.value === undefined ? '' : String(property.value);
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
