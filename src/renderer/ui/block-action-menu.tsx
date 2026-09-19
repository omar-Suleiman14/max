import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { anchorPopover } from './anchor-popover';
import type { NotionBlock } from './notion-block-editor';
import './block-action-menu.css';

type Colour = Readonly<{ id: string; label: string; labelAr: string }>;
const types = [
  ['text', 'Text', 'نص'], ['h1', 'Heading 1', 'عنوان ١'], ['h2', 'Heading 2', 'عنوان ٢'],
  ['h3', 'Heading 3', 'عنوان ٣'], ['bullet', 'Bulleted list', 'قائمة نقطية'],
  ['number', 'Numbered list', 'قائمة مرقمة'], ['todo', 'To-do', 'مهمة'],
  ['quote', 'Quote', 'اقتباس'], ['callout', 'Callout', 'تنبيه'], ['code', 'Code', 'كود'],
] as const;

export function BlockActionMenu({ block, locale, textColours, backgroundColours, onChange, onClose, onDuplicate, onDelete, onMove, first, last }: {
  block: NotionBlock; locale: string; textColours: readonly Colour[]; backgroundColours: readonly Colour[];
  onChange: (patch: Partial<NotionBlock>) => void; onClose: () => void;
  onDuplicate: () => void; onDelete: () => void; onMove: (direction: -1 | 1) => void; first: boolean; last: boolean;
}) {
  const ar = locale === 'ar';
  const [submenu, setSubmenu] = useState<'type' | 'colour' | null>(null);
  const [anchor] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const menu = useRef<HTMLDivElement>(null);
  const returnTo = useRef<string | undefined>(undefined);
  const [position, setPosition] = useState({ left: 8, top: 8 } as ReturnType<typeof anchorPopover>);
  useLayoutEffect(() => {
    const rect = anchor?.getBoundingClientRect();
    setPosition(anchorPopover(rect, { width: 220, preferredHeight: submenu === 'colour' ? 500 : 360 }, { width: window.innerWidth, height: window.innerHeight, rtl: ar }));
    const preferred = submenu ? undefined : returnTo.current;
    (menu.current?.querySelector<HTMLButtonElement>(preferred ? `[data-submenu-trigger="${preferred}"]` : 'button:not(:disabled)'))?.focus();
  }, [anchor, ar, submenu]);
  function close() { onClose(); anchor?.focus(); }
  function select(action: () => void) { action(); close(); }
  function back() { returnTo.current = submenu ?? undefined; setSubmenu(null); }
  return createPortal(<div ref={menu} role="menu" aria-label={submenu === 'colour' ? (ar ? 'اللون' : 'Colour') : submenu === 'type' ? (ar ? 'تحويل إلى' : 'Turn into') : (ar ? 'خيارات الكتلة' : 'Block actions')} dir={ar ? 'rtl' : 'ltr'} className="notion-block-action-menu notion-block-action-menu--nested" style={position} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === 'Escape' || (submenu && event.key === (ar ? 'ArrowRight' : 'ArrowLeft'))) {
      event.preventDefault(); if (submenu) back(); else close(); return;
    }
    if (event.key === 'Tab') { event.preventDefault(); close(); return; }
    if (!submenu && event.key === (ar ? 'ArrowLeft' : 'ArrowRight')) {
      const target = event.target as HTMLButtonElement;
      if (target.dataset.submenuTrigger) { event.preventDefault(); target.click(); }
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }}>
    {submenu && <button type="button" role="menuitem" onClick={back}>{ar ? '→ رجوع' : '← Back'}</button>}
    {!submenu && <>
      {types.some(([type]) => type === block.type) && <button type="button" role="menuitem" data-submenu-trigger="type" aria-haspopup="menu" aria-expanded="false" onClick={() => setSubmenu('type')}>{ar ? 'تحويل إلى' : 'Turn into'} <span aria-hidden="true">{ar ? '‹' : '›'}</span></button>}
      <button type="button" role="menuitem" data-submenu-trigger="colour" aria-haspopup="menu" aria-expanded="false" onClick={() => setSubmenu('colour')}>{ar ? 'اللون' : 'Colour'} <span aria-hidden="true">{ar ? '‹' : '›'}</span></button>
      <button type="button" role="menuitem" onClick={() => select(onDuplicate)}>{ar ? 'إنشاء نسخة' : 'Duplicate'}</button>
      <button type="button" role="menuitem" disabled={first} onClick={() => select(() => onMove(-1))}>{ar ? 'نقل لأعلى' : 'Move up'}</button>
      <button type="button" role="menuitem" disabled={last} onClick={() => select(() => onMove(1))}>{ar ? 'نقل لأسفل' : 'Move down'}</button>
      <button type="button" role="menuitem" className="danger" onClick={() => select(onDelete)}>{ar ? 'حذف' : 'Delete'}</button>
    </>}
    {submenu === 'type' && types.map(([type, label, labelAr]) => <button key={type} type="button" role="menuitemradio" aria-checked={block.type === type} onClick={() => select(() => onChange({ type, ...(type === 'callout' ? { calloutIcon: block.calloutIcon || 'lucide:Info' } : {}) }))}>{ar ? labelAr : label}</button>)}
    {submenu === 'colour' && <>
      <div role="group" aria-label={ar ? 'لون النص' : 'Text colour'}><p className="notion-color-section-label">{ar ? 'لون النص' : 'Text colour'}</p>{textColours.map(({ id, label, labelAr }) => <button key={id} type="button" role="menuitemradio" aria-checked={(block.color || 'default') === id} data-color-preview={id === 'default' ? undefined : id} onClick={() => select(() => onChange({ color: id === 'default' ? undefined : id }))}>{ar ? labelAr : label}</button>)}</div>
      <div role="group" aria-label={ar ? 'لون الخلفية' : 'Background colour'}><p className="notion-color-section-label">{ar ? 'لون الخلفية' : 'Background colour'}</p>{backgroundColours.map(({ id, label, labelAr }) => <button key={id} type="button" role="menuitemradio" aria-checked={(block.backgroundColor || 'default') === id} data-bg-preview={id === 'default' ? undefined : id} onClick={() => select(() => onChange({ backgroundColor: id === 'default' ? undefined : id }))}>{ar ? labelAr : label}</button>)}</div>
    </>}
  </div>, document.body);
}
