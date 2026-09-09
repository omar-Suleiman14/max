import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './database-popover.css';

/** Compact editor anchored to its trigger, with no blocking backdrop. */
export function DatabasePopover({ children, onClose, labelId, className = '' }: { children: ReactNode; onClose: () => void; labelId?: string; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [anchor] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const [position, setPosition] = useState({ left: 16, top: 100, maxHeight: 500 });
  useLayoutEffect(() => {
    const rect = anchor?.getBoundingClientRect();
    const width = root.current?.getBoundingClientRect().width ?? 380;
    const top = rect && rect.height && rect.bottom < innerHeight - 180 ? rect.bottom + 6 : 100;
    setPosition({ left: Math.max(12, Math.min(rect?.left ?? innerWidth - width - 24, innerWidth - width - 12)), top, maxHeight: Math.max(120, innerHeight - top - 16) });
    (root.current?.querySelector<HTMLElement>('input:not([type=hidden])') ?? root.current?.querySelector<HTMLElement>('button'))?.focus();
  }, [anchor]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || root.current?.contains(event.target) || anchor?.contains(event.target)) return;
      if (event.target.closest('.max-select-popup,.overlay,.option-popup')) return;
      onClose();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [anchor, onClose]);
  return createPortal(<div ref={root} className={`database-anchored-popover ${className}`} role="dialog" aria-labelledby={labelId} style={position} onKeyDown={event => { if (event.key === 'Escape' && !document.querySelector('.max-select-popup,.overlay')) { event.preventDefault(); event.stopPropagation(); onClose(); anchor?.focus(); } }}>{children}</div>, document.body);
}
