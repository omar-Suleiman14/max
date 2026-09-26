import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Locale } from '../app/i18n';

/**
 * The one navigation history for the window. It lives outside React so it
 * survives the controls unmounting (the page map hides the top bar). Scroll
 * positions are restored per page by usePagePosition, so going back also
 * returns to where the page was read.
 */
export function createNavigationHistory(limit = 100) {
  let entries: string[] = [];
  let cursor = -1;
  let navigating: string | undefined;
  let version = 0;
  const listeners = new Set<() => void>();
  const emit = () => { version += 1; listeners.forEach((listener) => listener()); };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    version: () => version,
    canGoBack: () => cursor > 0,
    canGoForward: () => cursor < entries.length - 1,
    /** Records a page the window arrived at, unless it came from back or forward. */
    visit(page: string) {
      if (navigating === page) { navigating = undefined; return; }
      navigating = undefined;
      if (entries[cursor] === page) return;
      entries = [...entries.slice(0, cursor + 1), page].slice(-limit);
      cursor = entries.length - 1;
      emit();
    },
    /** Moves through the history and returns the page to open, if any. */
    go(direction: -1 | 1): string | undefined {
      const destination = entries[cursor + direction];
      if (destination === undefined) return undefined;
      cursor += direction;
      navigating = destination;
      emit();
      return destination;
    },
  };
}

export const navigationHistory = createNavigationHistory();

export function NavigationHistory({ page, onNavigate, locale }: { page: string; onNavigate: (page: string) => void; locale: Locale }) {
  const history = navigationHistory;
  useSyncExternalStore((listener) => history.subscribe(listener), () => history.version());
  useEffect(() => { history.visit(page); }, [history, page]);
  const go = (direction: -1 | 1) => { const destination = history.go(direction); if (destination !== undefined) onNavigate(destination); };
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        goRef.current(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  const ar = locale === 'ar';
  return <nav className="page-history" aria-label={ar ? 'سجل التنقل' : 'Navigation history'}>
    <button type="button" title="Alt+←" aria-keyshortcuts="Alt+ArrowLeft" aria-label={ar ? 'رجوع' : 'Back'} disabled={!history.canGoBack()} onClick={() => go(-1)}>{ar ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}</button>
    <button type="button" title="Alt+→" aria-keyshortcuts="Alt+ArrowRight" aria-label={ar ? 'تقدم' : 'Forward'} disabled={!history.canGoForward()} onClick={() => go(1)}>{ar ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}</button>
  </nav>;
}
