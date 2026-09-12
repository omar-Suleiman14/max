import '../ui/database-popover.css';
import { GripVertical, Check, MoreHorizontal, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { anchorPopover, currentViewport, type AnchoredPosition } from '../ui/anchor-popover';
import type { PropertyOptionDraft, WorkspaceProperty } from '../../shared/property-contract';
import type { Locale } from '../app/i18n';

const colors = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];

/**
 * The select and multi-select editor.
 *
 * One popup does the whole job: the chips already chosen sit in the search
 * field, the list underneath is the only list on screen, and renaming,
 * recolouring and reordering happen in place. The earlier version repeated its
 * own placeholder as a heading and spread each row across the full width, which
 * read as three separate empty controls rather than one option.
 */
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
  const [position, setPosition] = useState<AnchoredPosition>({ left: 0, maxHeight: 360, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
  const selected = Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : typeof value === 'string' ? [value] : [];
  const selectedIds = selected.map((id) => options.find((o) => o.id === id || o.label === id)?.id ?? id);
  useEffect(() => setOptions(property.options ?? []), [property.options]);

  // The trigger moves whenever its table scrolls, so the popup is measured
  // against it again rather than left at wherever it opened.
  const place = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(anchorPopover(rect, { preferredHeight: 340, width: 300 }, currentViewport(), 4));
  }, []);
  useLayoutEffect(() => { if (open) place(); }, [open, place, editing]);
  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    const close = (event: MouseEvent) => { if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', reposition);
    document.addEventListener('scroll', reposition, true);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('resize', reposition); document.removeEventListener('scroll', reposition, true); };
  }, [open, place]);

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
  const typed = query.trim();
  const canCreate = !!typed && !options.some((o) => o.label.toLocaleLowerCase() === typed.toLocaleLowerCase());
  const create = () => void saveOptions([...options, { label: typed, style: { color: 'default' } }]).then((saved) => { const created = saved?.find((o) => o.label === typed); if (created) { choose(created.id); setQuery(''); } });
  const tag = (id: string) => { const option = options.find((o) => o.id === id || o.label === id); return option ? <span className={`database-cell-pill option-tag option-tag--${option.style.color ?? 'default'}`} style={option.style.background ? option.style : undefined}>{option.label}</span> : null; };
  const editedOption = options.find((o) => o.id === editing);
  const commitName = () => { if (!label.trim() || !editing) return; void saveOptions(options.map((o) => o.id === editing ? { ...o, label: label.trim() } : o)).then((saved) => { if (saved) setEditing(undefined); }); };

  return <>
    <button ref={trigger} type="button" className="database-cell-button option-value" aria-label={property.name} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(true); setQuery(''); setEditing(undefined); setActive(0); }}>{selected.length ? selected.map((id) => <span key={id}>{tag(id)}</span>) : <span className="database-cell-empty">—</span>}</button>
    {open && createPortal(<div ref={popup} style={position} className="option-popup" role="dialog" aria-label={property.name} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); if (editing) { setEditing(undefined); return; } setOpen(false); trigger.current?.focus(); } }}>
      {editing ? <div className="option-edit">
        <header className="option-edit__header">
          <button type="button" className="option-edit__back" aria-label={ar ? 'رجوع' : 'Back'} onClick={() => setEditing(undefined)}><X size={14} /></button>
          <input autoFocus aria-label={ar ? 'اسم الخيار' : 'Option name'} value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitName(); } }} />
          <button type="button" className="option-edit__save" disabled={busy || !label.trim()} onClick={commitName}>{ar ? 'حفظ الاسم' : 'Save name'}</button>
        </header>
        <p className="option-popup__section">{ar ? 'الألوان' : 'Colors'}</p>
        <div className="option-swatches">
          {colors.map((color) => <button type="button" key={color} aria-label={color} title={color} disabled={busy} data-chosen={editedOption?.style.background === `var(--option-${color}-bg)` || undefined} onClick={() => void saveOptions(options.map((o) => o.id === editing ? { ...o, style: { color: `var(--option-${color}-text)`, background: `var(--option-${color}-bg)` } } : o)).then((saved) => { if (saved) setEditing(undefined); })}>
            <span aria-hidden="true" className={`option-swatch option-tag--${color}`} />
            {editedOption?.style.background === `var(--option-${color}-bg)` && <Check aria-hidden="true" className="option-swatch__check" size={11} />}
          </button>)}
        </div>
        <button type="button" className="option-edit__delete" disabled={busy} onClick={() => void saveOptions(options.filter((o) => o.id !== editing)).then((saved) => { if (saved) { onChange(multiple ? selectedIds.filter((id) => id !== editing) : selectedIds.includes(editing) ? null : selected[0] ?? null); setEditing(undefined); } })}><Trash2 aria-hidden="true" size={13} />{ar ? 'حذف الخيار' : 'Delete option'}</button>
      </div> : <>
        <div className="option-field">
          {selected.map((id) => <span className="option-field__chip" key={id}>{tag(id)}<button type="button" aria-label={ar ? 'إزالة اختيار' : 'Remove selection'} onClick={() => onChange(multiple ? selectedIds.filter((key) => key !== id) : null)}><X size={10} /></button></span>)}
          <input autoFocus aria-label={ar ? 'بحث في الخيارات' : 'Search options'} placeholder={selected.length ? '' : ar ? 'ابحث أو أنشئ خياراً' : 'Search or create an option'} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setActive((old) => (old + (e.key === 'ArrowDown' ? 1 : -1) + filtered.length) % Math.max(filtered.length, 1)); }
            if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) choose(filtered[active].id); else if (canCreate) create(); }
            if (e.key === 'Backspace' && !query && selected.length) onChange(multiple ? selectedIds.slice(0, -1) : null);
          }} />
        </div>
        <div className="option-popup__list">
          {!!filtered.length && <p className="option-popup__section">{ar ? 'الخيارات' : 'Select an option'}</p>}
          <div role="listbox" aria-label={property.name} aria-multiselectable={multiple}>{filtered.map((option, index) => <div className="option-row" data-active={index === active} key={option.id} data-drop-target={dropId === option.id} onDragOver={event => { if (dragId) { event.preventDefault(); setDropId(option.id); } }} onDrop={event => { event.preventDefault(); if (dragId) reorder(dragId, option.id); setDragId(undefined); setDropId(undefined); }}>
            <button type="button" className="option-reorder" disabled={busy} draggable={!busy} aria-label={'Reorder ' + option.label} title={ar ? 'اسحب لإعادة الترتيب · Alt+↑/↓' : 'Drag to reorder · Alt+↑/↓'} onDragStart={event => { setDragId(option.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', option.id); }} onDragEnd={() => { setDragId(undefined); setDropId(undefined); }} onKeyDown={event => { if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); const target = options[options.findIndex(o => o.id === option.id) + (event.key === 'ArrowUp' ? -1 : 1)]; if (target) reorder(option.id, target.id); } }}><GripVertical size={13}/></button>
            <button role="option" className="option-row__choose" aria-selected={selectedIds.includes(option.id)} type="button" onMouseMove={() => setActive(index)} onClick={() => choose(option.id)}>{tag(option.id)}<span className="option-row__spacer" />{selectedIds.includes(option.id) && <Check aria-hidden="true" size={14} />}</button>
            <button type="button" className="option-row__more" aria-label={`${ar ? 'تحرير' : 'Edit'} ${option.label}`} onClick={() => { setEditing(option.id); setLabel(option.label); }}><MoreHorizontal size={14} /></button>
          </div>)}</div>
          {canCreate && <button type="button" className="option-create" disabled={busy} onClick={create}><Plus aria-hidden="true" size={13} />{ar ? 'إنشاء' : 'Create'} <span className={'database-cell-pill option-tag option-tag--default'}>{typed}</span></button>}
          {!filtered.length && !canCreate && <p className="option-popup__empty">{ar ? 'لا توجد خيارات بعد' : 'No options yet'}</p>}
        </div>
      </>}
      {error && <p className="option-popup__error" role="alert">{error}</p>}
    </div>, document.body)}
  </>;
}
