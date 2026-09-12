import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { anchorPopover, currentViewport, type AnchorRect } from './anchor-popover';
import './database-popover.css';

/** Compact editor anchored to its trigger, with no blocking backdrop. */
export function DatabasePopover({ children, onClose, labelId, className = '' }: { children: ReactNode; onClose: () => void; labelId?: string; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [anchor] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
  // Measured during render, while the trigger is still in the document. Many
  // triggers live in a menu that closes as the popover opens, and a detached
  // element reports a zero rect, which used to drop the popover into the
  // centre-of-screen fallback instead of against the control it came from.
  const [openingRect] = useState<AnchorRect | undefined>(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return undefined;
    const { bottom, height, left, right, top } = active.getBoundingClientRect();
    return height ? { bottom, left, right, top } : undefined;
  });
  const [position, setPosition] = useState({ left: 16, top: 100, maxHeight: 500 });
  useLayoutEffect(() => {
    const measured = anchor?.isConnected ? anchor.getBoundingClientRect() : undefined;
    const rect = measured && measured.height ? measured : openingRect;
    const width = root.current?.getBoundingClientRect().width ?? 380;
    setPosition(anchorPopover(rect, { preferredHeight: 380, width }, currentViewport()));
    (root.current?.querySelector<HTMLElement>('input:not([type=hidden])') ?? root.current?.querySelector<HTMLElement>('button'))?.focus();
  }, [anchor, openingRect]);
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
