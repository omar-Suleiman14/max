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
  const childMenu = useRef<HTMLDivElement>(null);
  const [childPosition, setChildPosition] = useState({ left: 8, top: 8, maxHeight: 500 });
  const returnTo = useRef<string | undefined>(undefined);
  const [position, setPosition] = useState({ left: 8, top: 8 } as ReturnType<typeof anchorPopover>);
  useLayoutEffect(() => {
    const rect = anchor?.getBoundingClientRect();
    setPosition(anchorPopover(rect, { width: 220, preferredHeight: 240 }, { width: window.innerWidth, height: window.innerHeight, rtl: ar }));
    if (submenu) {
      const parent = menu.current?.getBoundingClientRect();
      const trigger = menu.current?.querySelector(`[data-submenu-trigger="${submenu}"]`)?.getBoundingClientRect();
      if (parent && trigger) {
        const width = Math.min(220, window.innerWidth - 16);
        const right = parent.right + 4, left = parent.left - width - 4;
        const preferred = ar ? left : right;
        const alternate = ar ? right : left;
        const x = preferred >= 8 && preferred + width <= window.innerWidth - 8 ? preferred : alternate;
        const height = Math.min(childMenu.current?.scrollHeight ?? 500, window.innerHeight - 16);
        setChildPosition({ left: Math.max(8, Math.min(x, window.innerWidth - width - 8)), top: Math.max(8, Math.min(trigger.top, window.innerHeight - height - 8)), maxHeight: window.innerHeight - 16 });
      }
      childMenu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    } else {
      const preferred = returnTo.current;
      menu.current?.querySelector<HTMLButtonElement>(preferred ? `[data-submenu-trigger="${preferred}"]` : 'button:not(:disabled)')?.focus();
    }
  }, [anchor, ar, submenu]);
  function close() { onClose(); anchor?.focus(); }
  function select(action: () => void) { action(); close(); }
  function back() { returnTo.current = submenu ?? undefined; setSubmenu(null); }
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === 'Escape' || (submenu && event.key === (ar ? 'ArrowRight' : 'ArrowLeft'))) {
      event.preventDefault(); if (submenu) back(); else close(); return;
    }
    if (event.key === 'Tab') { event.preventDefault(); close(); return; }
    if (event.currentTarget === menu.current && event.key === (ar ? 'ArrowLeft' : 'ArrowRight')) {
      const target = event.target as HTMLButtonElement;
      if (target.dataset.submenuTrigger) { event.preventDefault(); target.click(); }
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }
  return createPortal(<>
    <div ref={menu} role="menu" aria-label={ar ? 'خيارات الكتلة' : 'Block actions'} dir={ar ? 'rtl' : 'ltr'} className="notion-block-action-menu notion-block-action-menu--nested" style={position} onKeyDown={handleKeyDown}>
      {types.some(([type]) => type === block.type) && <button type="button" role="menuitem" data-submenu-trigger="type" aria-haspopup="menu" aria-expanded={submenu === 'type'} onClick={() => setSubmenu('type')}>{ar ? 'تحويل إلى' : 'Turn into'} <span aria-hidden="true">{ar ? '‹' : '›'}</span></button>}
      <button type="button" role="menuitem" data-submenu-trigger="colour" aria-haspopup="menu" aria-expanded={submenu === 'colour'} onClick={() => setSubmenu('colour')}>{ar ? 'اللون' : 'Colour'} <span aria-hidden="true">{ar ? '‹' : '›'}</span></button>
      <button type="button" role="menuitem" onClick={() => select(onDuplicate)}>{ar ? 'إنشاء نسخة' : 'Duplicate'}</button>
      <button type="button" role="menuitem" disabled={first} onClick={() => select(() => onMove(-1))}>{ar ? 'نقل لأعلى' : 'Move up'}</button>
      <button type="button" role="menuitem" disabled={last} onClick={() => select(() => onMove(1))}>{ar ? 'نقل لأسفل' : 'Move down'}</button>
      <button type="button" role="menuitem" className="danger" onClick={() => select(onDelete)}>{ar ? 'حذف' : 'Delete'}</button>
    </div>
    {submenu && <div ref={childMenu} role="menu" aria-label={submenu === 'colour' ? (ar ? 'اللون' : 'Colour') : (ar ? 'تحويل إلى' : 'Turn into')} dir={ar ? 'rtl' : 'ltr'} className="notion-block-action-menu notion-block-action-menu--nested" style={childPosition} onKeyDown={handleKeyDown}>
    {submenu === 'type' && types.map(([type, label, labelAr]) => <button key={type} type="button" role="menuitemradio" aria-checked={block.type === type} onClick={() => select(() => onChange({ type, ...(type === 'callout' ? { calloutIcon: block.calloutIcon || 'lucide:Info' } : {}) }))}>{ar ? labelAr : label}</button>)}
    {submenu === 'colour' && <>
      <div role="group" aria-label={ar ? 'لون النص' : 'Text colour'}><p className="notion-color-section-label">{ar ? 'لون النص' : 'Text colour'}</p>{textColours.map(({ id, label, labelAr }) => <button key={id} type="button" role="menuitemradio" aria-checked={(block.color || 'default') === id} data-color-preview={id === 'default' ? undefined : id} onClick={() => select(() => onChange({ color: id === 'default' ? undefined : id }))}>{ar ? labelAr : label}</button>)}</div>
      <div role="group" aria-label={ar ? 'لون الخلفية' : 'Background colour'}><p className="notion-color-section-label">{ar ? 'لون الخلفية' : 'Background colour'}</p>{backgroundColours.map(({ id, label, labelAr }) => <button key={id} type="button" role="menuitemradio" aria-checked={(block.backgroundColor || 'default') === id} data-bg-preview={id === 'default' ? undefined : id} onClick={() => select(() => onChange({ backgroundColor: id === 'default' ? undefined : id }))}>{ar ? labelAr : label}</button>)}</div>
    </>}
    </div>}
  </>, document.body);
}
