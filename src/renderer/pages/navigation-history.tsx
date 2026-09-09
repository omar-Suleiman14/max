import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Locale } from '../app/i18n';
export function NavigationHistory({ page, onNavigate, locale }: { page: string; onNavigate: (page: string) => void; locale: Locale }) {
  const history = useRef([page]); const cursor = useRef(0); const navigating = useRef(false);
  const [, refresh] = useState(0);
  useEffect(() => {
    if (navigating.current) navigating.current = false;
    else if (history.current[cursor.current] !== page) { history.current = [...history.current.slice(0, cursor.current + 1), page].slice(-100); cursor.current = history.current.length - 1; }
    refresh((value) => value + 1);
  }, [page]);
  const go = (direction: number) => { const next = cursor.current + direction; const destination = history.current[next]; if (destination) { cursor.current = next; navigating.current = true; onNavigate(destination); } };
  const goRef = useRef(go); goRef.current = go;
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.altKey && !event.ctrlKey && !event.metaKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); goRef.current(event.key === 'ArrowLeft' ? -1 : 1); } }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, []);
  return <nav className="page-history" aria-label={locale === 'ar' ? 'سجل التنقل' : 'Navigation history'}><button type="button" title="Alt+←" aria-label={locale === 'ar' ? 'رجوع' : 'Back'} disabled={cursor.current === 0} onClick={() => go(-1)}><ArrowLeft size={16} /></button><button type="button" title="Alt+→" aria-label={locale === 'ar' ? 'تقدم' : 'Forward'} disabled={cursor.current >= history.current.length - 1} onClick={() => go(1)}><ArrowRight size={16} /></button></nav>;
}
