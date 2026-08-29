import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

type FocusedOverlayProps = Readonly<{
  children: ReactNode;
  className?: string;
  labelId: string;
  onClose: () => void;
}>;

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function FocusedOverlay({ children, className = '', labelId, onClose }: FocusedOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const preferredFocus = panel?.querySelector<HTMLElement>('[data-autofocus="true"]');
    (preferredFocus ?? panel)?.focus();

    return () => previouslyFocused?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
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
    </div>
  );
}
