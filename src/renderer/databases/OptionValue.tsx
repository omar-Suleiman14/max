import '../ui/database-popover.css';
import { GripVertical, Check, MoreHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { anchorPopover, currentViewport } from '../ui/anchor-popover';
import type { PropertyOptionDraft, WorkspaceProperty } from '../../shared/property-contract';
import type { Locale } from '../app/i18n';

const colors = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
export function OptionValue({ property, value, onChange, multiple = false, locale = 'en' }: { property: WorkspaceProperty; value: unknown; onChange: (value: string[] | string | null) => void; multiple?: boolean; locale?: Locale }) {
  const ar = locale === 'ar';
  const [options, setOptions] = useState(property.options ?? []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string>();
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string>();
  const [dropId, setDropId] = useState<string>();
  const saving = useRef(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
  const selected = Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : typeof value === 'string' ? [value] : [];
  const selectedIds = selected.map((id) => options.find((o) => o.id === id || o.label === id)?.id ?? id);
  useEffect(() => setOptions(property.options ?? []), [property.options]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const saveOptions = async (next: readonly PropertyOptionDraft[]) => {
    if (saving.current) return null;
    saving.current = true; setBusy(true); setError('');
    try {
      const result = await window.maxApi.workspace.updateProperty(property.id, { options: next });
      if (!result.ok) { setError(result.error.message); return null; }
      setOptions(result.value.options ?? []);
      window.dispatchEvent(new Event('max:workspace-changed'));
      return result.value.options ?? [];
    } catch { setError(ar ? 'تعذر حفظ الخيارات.' : 'Could not save options.'); return null; }
    finally { saving.current = false; setBusy(false); }
  };
  const reorder = (id: string, targetId: string) => {
    if (busy || id === targetId) return;
    const next = [...options]; const from = next.findIndex(o => o.id === id), to = next.findIndex(o => o.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1); if (!moved) return; next.splice(to, 0, moved);
    void saveOptions(next);
  };
  const choose = (id: string) => { onChange(multiple ? selectedIds.includes(id) ? selectedIds.filter((key) => key !== id) : [...selectedIds, id] : id); if (!multiple) setOpen(false); };
  const filtered = options.filter((option) => option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const tag = (id: string) => { const option = options.find((o) => o.id === id || o.label === id); return option ? <span className={`database-cell-pill option-tag option-tag--${option.style.color ?? 'default'}`} style={option.style.background ? option.style : undefined}>{option.label}</span> : null; };
  return <>
    <button ref={trigger} type="button" className="database-cell-button option-value" aria-label={property.name} aria-haspopup="dialog" aria-expanded={open} onClick={() => { const { left, top } = anchorPopover(trigger.current!.getBoundingClientRect(), { preferredHeight: 360, width: 320 }, currentViewport(), 3); setPosition({ left, top }); setOpen(true); setQuery(''); setEditing(undefined); setActive(0); }}>{selected.length ? selected.map((id) => <span key={id}>{tag(id)}</span>) : <span className="database-cell-empty">—</span>}</button>
    {open && createPortal(<div ref={popup} style={position} className="option-popup" role="dialog" aria-label={property.name} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}>
      {editing ? <>
        <input autoFocus aria-label={ar ? 'اسم الخيار' : 'Option name'} value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && label.trim()) void saveOptions(options.map((o) => o.id === editing ? { ...o, label: label.trim() } : o)).then((saved) => { if (saved) setEditing(undefined); }); }} />
        <button type="button" disabled={busy || !label.trim()} onClick={() => void saveOptions(options.map((o) => o.id === editing ? { ...o, label: label.trim() } : o)).then((saved) => { if (saved) setEditing(undefined); })}>{ar ? 'حفظ الاسم' : 'Save name'}</button>
        <button type="button" disabled={busy} onClick={() => void saveOptions(options.filter((o) => o.id !== editing)).then((saved) => { if (saved) { onChange(multiple ? selectedIds.filter((id) => id !== editing) : selectedIds.includes(editing) ? null : selected[0] ?? null); setEditing(undefined); } })}>{ar ? 'حذف الخيار' : 'Delete option'}</button>
        <small>{ar ? 'الألوان' : 'Colors'}</small>
        {colors.map((color) => <button type="button" key={color} disabled={busy} onClick={() => void saveOptions(options.map((o) => o.id === editing ? { ...o, style: { color: `var(--option-${color}-text)`, background: `var(--option-${color}-bg)` } } : o)).then((saved) => { if (saved) setEditing(undefined); })}><span className={`option-tag option-tag--${color}`}>{color}</span>{options.find((o) => o.id === editing)?.style.background === `var(--option-${color}-bg)` && <Check size={13} />}</button>)}
      </> : <>
        {!!selected.length && <div className="option-selected">{selected.map((id) => <span key={id}>{tag(id)}<button type="button" aria-label={ar ? 'إزالة اختيار' : 'Remove selection'} onClick={() => onChange(multiple ? selectedIds.filter((key) => key !== id) : null)}><X size={11} /></button></span>)}</div>}
        <input autoFocus aria-label={ar ? 'بحث في الخيارات' : 'Search options'} placeholder={ar ? 'اختر خياراً أو أنشئ واحداً' : 'Select an option or create one'} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setActive((old) => (old + (e.key === 'ArrowDown' ? 1 : -1) + filtered.length) % Math.max(filtered.length, 1)); } if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); choose(filtered[active].id); } }} />
        <small className="option-list-hint">{ar ? 'اختر خياراً أو أنشئ واحداً' : 'Select an option or create one'}</small><div role="listbox" aria-label={property.name} aria-multiselectable={multiple}>{filtered.map((option, index) => <div className="option-row" data-active={index === active} key={option.id} data-drop-target={dropId === option.id} onDragOver={event => { if (dragId) { event.preventDefault(); setDropId(option.id); } }} onDrop={event => { event.preventDefault(); if (dragId) reorder(dragId, option.id); setDragId(undefined); setDropId(undefined); }}><button type="button" className="option-reorder" disabled={busy} draggable={!busy} aria-label={'Reorder ' + option.label} title="Drag to reorder · Alt+↑/↓" onDragStart={event => { setDragId(option.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', option.id); }} onDragEnd={() => { setDragId(undefined); setDropId(undefined); }} onKeyDown={event => { if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); const target = options[options.findIndex(o => o.id === option.id) + (event.key === 'ArrowUp' ? -1 : 1)]; if (target) reorder(option.id, target.id); } }}><GripVertical size={14}/></button><button role="option" aria-selected={selectedIds.includes(option.id)} type="button" onClick={() => choose(option.id)}>{tag(option.id)}{selectedIds.includes(option.id) && <Check size={13} />}</button><button type="button" aria-label={`${ar ? 'تحرير' : 'Edit'} ${option.label}`} onClick={() => { setEditing(option.id); setLabel(option.label); }}><MoreHorizontal size={15} /></button></div>)}</div>
        {!!query.trim() && !options.some((o) => o.label.toLocaleLowerCase() === query.trim().toLocaleLowerCase()) && <button type="button" disabled={busy} onClick={() => void saveOptions([...options, { label: query.trim(), style: { color: 'default' } }]).then((saved) => { const created = saved?.find((o) => o.label === query.trim()); if (created) { choose(created.id); setQuery(''); } })}>+ {ar ? 'إنشاء' : 'Create'} “{query.trim()}”</button>}
      </>}
      {error && <p role="alert">{error}</p>}
    </div>, document.body)}
  </>;
}
