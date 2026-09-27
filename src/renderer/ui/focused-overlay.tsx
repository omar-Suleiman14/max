import { createPortal } from 'react-dom';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { containTab, isTopmostOverlay, useOverlayFocus, useOverlayLayer } from './overlay-stack';

type FocusedOverlayProps = Readonly<{
  children: ReactNode;
  className?: string;
  labelId: string;
  onClose: () => void;
}>;

export function FocusedOverlay({ children, className = '', labelId, onClose }: FocusedOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // A modal layer: Escape closes the topmost one; its backdrop, not any press
  // outside it, closes it, so floating menus opened from inside stay usable.
  useOverlayLayer(panelRef, { clickAway: false, onClose });
  useOverlayFocus(panelRef);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Portalled child dialogs still bubble through their React parent.
    if ((event.target as Element).closest('[role="dialog"]') !== panelRef.current) return;
    if (event.key !== 'Tab') return;
    event.stopPropagation();
    containTab(event, panelRef.current);
  }

  return createPortal(
    <div
      className="overlay"
      onPointerDown={(event) => {
        if (!event.defaultPrevented && event.currentTarget === event.target && isTopmostOverlay(panelRef.current)) onClose();
      }}
    >
      <div
        ref={panelRef}
        aria-labelledby={labelId}
        aria-modal="true"
        className={`overlay__panel ${className}`.trim()}
        onKeyDown={handleKeyDown}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
