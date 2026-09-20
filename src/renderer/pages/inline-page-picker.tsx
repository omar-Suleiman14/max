import { useEffect, useRef, useState } from 'react';
import { usePageGraph } from './page-graph-store';
import { PageIconRenderer } from '../ui/page-icon-renderer';
import type { Locale } from '../app/i18n';

export function InlinePagePicker({ locale, onPick, onClose }: {
  locale: Locale;
  onPick: (id: string, title: string) => void;
  onClose: (restoreFocus?: boolean) => void;
}) {
  const { graph, error } = usePageGraph();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) onClose(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [onClose]);
  const ar = locale === 'ar';
  const pages = graph.pages.filter(page => page.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div ref={root} className="inline-page-picker page-link-picker" role="dialog" aria-label={ar ? 'رابط إلى صفحة' : 'Link to page'} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setActive(index => Math.max(0, Math.min(pages.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
    }
    if (event.key === 'Enter') { event.preventDefault(); const page = pages[active]; if (page) onPick(page.id, page.title); }
  }}>
    <input autoFocus aria-label={ar ? 'بحث عن صفحة' : 'Find a page'} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} />
    <div className="page-link-results">{pages.map((page, index) => <button key={page.id} type="button" data-active={index === active} onClick={() => onPick(page.id, page.title)}><PageIconRenderer icon={page.icon ?? 'lucide:FileText'} size={16} />{page.title}</button>)}</div>
    {error ? <p role="alert">{ar ? 'تعذر تحميل الصفحات.' : 'Could not load pages.'}</p> : !pages.length && <p>{ar ? 'لا توجد صفحات مطابقة.' : 'No matching pages.'}</p>}
    <button type="button" onClick={() => onClose()}>{ar ? 'إلغاء' : 'Cancel'}</button>
  </div>;
}
