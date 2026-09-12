import { useEffect, useState } from 'react';
import type { Locale } from '../app/i18n';
import { findContentSections, type SectionMarker } from './scroll-sections';

/** T3-style section rail: dynamic section count, reading position, hover previews, and keyboard navigation. */
export function ScrollOutline({ locale, pageKey }: { locale: Locale; pageKey: string }) {
  const [sections, setSections] = useState<SectionMarker[]>([]);
  const [active, setActive] = useState(0);
  // Every section the reader can currently see, not only the one they are at:
  // the rail is a map of the screen, so the whole span in view is lit.
  const [onScreen, setOnScreen] = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const root = document.getElementById('main-content');
    if (!root) return;

    let frame = 0;
    let current: SectionMarker[] = [];

    const update = () => {
      const viewport = root.getBoundingClientRect();
      const top = viewport.top + 80;
      let index = 0;
      const seen: number[] = [];
      current.forEach((section, i) => {
        const rect = section.element.getBoundingClientRect();
        if (rect.top <= top) index = i;
        // A section counts as on screen when any part of it overlaps the
        // scroller, and a section taller than the window always does.
        if (rect.bottom > viewport.top && rect.top < viewport.bottom) seen.push(i);
      });
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) {
        index = current.length - 1;
      }
      setActive(Math.max(0, index));
      // A string key so an unchanged span does not re-render the rail on
      // every scroll event.
      setOnScreen(seen.length ? seen.join(',') : String(Math.max(0, index)));
      // Show rail whenever there are multiple sections to navigate
      const isScrollable = root.scrollHeight > root.clientHeight + 20 || root.scrollHeight === 0;
      setVisible(current.length > 1 && isScrollable);
    };

    const collect = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        current = findContentSections(root, locale).slice(0, 60);
        setSections(current);
        update();
      });
    };

    let collectTimeout: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(() => {
      clearTimeout(collectTimeout);
      collectTimeout = setTimeout(collect, 200);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });

    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(collect);
    resize?.observe(root);

    root.addEventListener('scroll', update, { passive: true });
    collect();

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(collectTimeout);
      observer.disconnect();
      resize?.disconnect();
      root.removeEventListener('scroll', update);
    };
  }, [locale, pageKey]);

  if (!visible || sections.length < 2) return null;

  const onScreenSet = new Set(onScreen.split(',').map(Number));

  return (
    <nav
      aria-label={locale === 'ar' ? 'موضع القراءة وأقسام الصفحة' : 'Reading position and page sections'}
      className="scroll-outline"
    >
      {sections.map((section, index) => {
        const isCurrent = index === active;
        return (
          <button
            aria-current={isCurrent ? 'location' : undefined}
            aria-label={section.title}
            className="scroll-outline__mark"
            data-onscreen={onScreenSet.has(index) ? 'true' : undefined}
            key={index}
            onClick={() => {
              section.element.scrollIntoView({
                behavior:
                  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
                    ? 'instant'
                    : 'smooth',
                block: 'start',
              });
            }}
            onKeyDown={(event) => {
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button');
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? sections.length - 1
                    : (index + (event.key === 'ArrowDown' ? 1 : -1) + sections.length) % sections.length;
              buttons?.[next]?.focus();
            }}
            type="button"
          >
            <span
              aria-hidden="true"
              className="scroll-outline__line"
            />
            <span aria-hidden="true" className="scroll-outline__preview">
              <strong>{section.title}</strong>
              <span>{section.preview}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
