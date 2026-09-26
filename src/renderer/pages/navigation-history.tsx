import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Locale } from '../app/i18n';
import { navigationHistory } from './navigation-history-store';

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
