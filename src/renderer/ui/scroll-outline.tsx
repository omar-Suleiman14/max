import { useEffect, useState } from 'react';
import type { Locale } from '../app/i18n';
import { findContentSections, type SectionMarker } from './scroll-sections';

/** T3-style section rail: dynamic section count, reading position, hover previews, and keyboard navigation. */
export function ScrollOutline({ locale, pageKey }: { locale: Locale; pageKey: string }) {
  const [sections, setSections] = useState<SectionMarker[]>([]);
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const root = document.getElementById('main-content');
    if (!root) return;

    let frame = 0;
    let current: SectionMarker[] = [];

    const update = () => {
      const top = root.getBoundingClientRect().top + 80;
      let index = 0;
      current.forEach((section, i) => {
        if (section.element.getBoundingClientRect().top <= top) index = i;
      });
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) {
        index = current.length - 1;
      }
      setActive(Math.max(0, index));
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
