import { GripVertical, Plus, X, ArrowUp, ArrowDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Locale } from '../app/i18n';
import { Select } from '../ui/select';
import { PropertyIcon } from '../databases/PropertyIcon';

export type PageProperty = Readonly<{ id: string; name: string; type: 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'url'; value: string | number | boolean | null; options?: readonly string[] }>;
export function PageProperties({ properties = [], onChange, locale }: { properties?: readonly PageProperty[]; onChange: (properties: readonly PageProperty[]) => void; locale: Locale }) {
  const ar = locale === 'ar';
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<PageProperty['type']>('text');
  const [options, setOptions] = useState('');
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
  return <section ref={root} className="page-properties" onKeyDown={(event) => { if (event.key === 'Escape') { setEditingId(null); setAdding(false); event.stopPropagation(); } }} aria-label={ar ? 'خصائص الصفحة' : 'Page properties'}>
    {properties.map((property, index) => <div className="page-property" key={property.id} data-drag-over={overId === property.id} onDragOver={(event) => { if (dragId) { event.preventDefault(); setOverId(property.id); } }} onDrop={(event) => { event.preventDefault(); if (dragId) move(dragId, property.id); }}>
      <button type="button" className="page-property-grip" draggable aria-label={`${ar ? 'تحريك' : 'Move'} ${property.name}`} title={ar ? 'اسحب لترتيب الخصائص' : 'Drag to reorder; use arrow keys to move'} onDragStart={(event) => { setDragId(property.id); event.dataTransfer.setData('text/max-page-property', property.id); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { setDragId(null); setOverId(null); }} onKeyDown={(event) => {
        if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault(); const next = [...properties]; const target = index + (event.key === 'ArrowUp' ? -1 : 1); const neighbor = next[target];
        if (neighbor) { next[index] = neighbor; next[target] = property; onChange(next); }
      }}><GripVertical size={14} /></button>
      <div className="page-property-name"><PropertyIcon type={property.type} /><input aria-label={ar ? 'اسم الخاصية' : 'Property name'} value={property.name} onChange={(event) => update(property.id, { name: event.target.value })} /></div>
      <div className="page-property-value">
        {property.type === 'checkbox' ? <input type="checkbox" aria-label={property.name} checked={property.value === true} onChange={(event) => update(property.id, { value: event.target.checked })} /> : property.type === 'select' ? <Select aria-label={property.name} value={String(property.value ?? '')} onChange={(event) => update(property.id, { value: event.target.value || null })}><option value="">{ar ? 'فارغ' : 'Empty'}</option>{property.options?.map((option) => <option key={option} value={option}>{option}</option>)}</Select> : <input aria-label={property.name} type={property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : property.type === 'url' ? 'url' : 'text'} placeholder={ar ? 'فارغ' : 'Empty'} value={property.value === null ? '' : String(property.value)} onChange={(event) => update(property.id, { value: property.type === 'number' ? event.target.value === '' ? null : Number(event.target.value) : event.target.value })} />}
      </div>
      <button type="button" className="page-property-edit" aria-label={`${ar ? 'إعدادات' : 'Options for'} ${property.name}`} onClick={() => setEditingId(editingId === property.id ? null : property.id)}>•••</button>
      {editingId === property.id && <div className="page-property-options">
        {property.type === 'select' && <label>{ar ? 'الخيارات (مفصولة بفاصلة)' : 'Options (comma separated)'}<input defaultValue={property.options?.join(', ')} onBlur={(event) => update(property.id, { options: [...new Set(event.target.value.split(',').map((value) => value.trim()).filter(Boolean))] })} /></label>}
        <button type="button" disabled={index === 0} onClick={() => { const previous = properties[index - 1]; if (previous) move(property.id, previous.id); }}><ArrowUp size={13} />{ar ? 'تحريك لأعلى' : 'Move up'}</button>
        <button type="button" disabled={index === properties.length - 1} onClick={() => { const next = [...properties]; const following = next[index + 1]; if (following) { next[index] = following; next[index + 1] = property; onChange(next); } }}><ArrowDown size={13} />{ar ? 'تحريك لأسفل' : 'Move down'}</button>
        <button type="button" onClick={() => { setRemoved({ property, index }); onChange(properties.filter((candidate) => candidate.id !== property.id)); setEditingId(null); }}><X size={13} />{ar ? 'إزالة الخاصية' : 'Remove property'}</button>
      </div>}
    </div>)}
    {removed && <div className="page-property-undo" role="status">{ar ? 'تمت إزالة الخاصية' : 'Property removed'}<button type="button" onClick={() => { const next = [...properties]; next.splice(Math.min(removed.index, next.length), 0, removed.property); onChange(next); setRemoved(null); }}>{ar ? 'تراجع' : 'Undo'}</button></div>}
    <button type="button" className="page-add-property" onClick={() => setAdding(!adding)}><Plus size={14} />{ar ? 'إضافة خاصية' : 'Add a property'}</button>
    {adding && <form className="page-property-form" onSubmit={(event) => { event.preventDefault(); if (!name.trim()) return; onChange([...properties, { id: crypto.randomUUID(), name: name.trim(), type, value: type === 'checkbox' ? false : null, options: type === 'select' ? [...new Set(options.split(',').map((value) => value.trim()).filter(Boolean))] : undefined }]); setName(''); setOptions(''); setAdding(false); }}>
      <input autoFocus required aria-label={ar ? 'اسم الخاصية الجديدة' : 'New property name'} placeholder={ar ? 'اسم الخاصية' : 'Property name'} value={name} onChange={(event) => setName(event.target.value)} />
      <Select aria-label={ar ? 'نوع الخاصية' : 'Property type'} value={type} onChange={(event) => setType(event.target.value as PageProperty['type'])}>{(['text','number','date','checkbox','select','url'] as const).map((value) => <option key={value} value={value}>{ar ? ({ text:'نص',number:'رقم',date:'تاريخ',checkbox:'مربع اختيار',select:'اختيار',url:'رابط' })[value] : ({ text:'Text',number:'Number',date:'Date',checkbox:'Checkbox',select:'Select',url:'URL' })[value]}</option>)}</Select>
      {type === 'select' && <input placeholder={ar ? 'الخيارات مفصولة بفاصلة' : 'Options, separated by commas'} value={options} onChange={(event) => setOptions(event.target.value)} />}
      <div><button type="submit">{ar ? 'إضافة' : 'Add'}</button><button type="button" onClick={() => setAdding(false)}>{ar ? 'إلغاء' : 'Cancel'}</button></div>
    </form>}
  </section>;
}
