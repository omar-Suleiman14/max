import { useEffect, useState } from 'react';
import type { Locale } from '../app/i18n';

type Section = { element: HTMLElement; title: string; preview: string };

/** T3-style section rail: reading position, hover previews, and keyboard navigation. */
export function ScrollOutline({ locale, pageKey }: { locale: Locale; pageKey: string }) {
  const [sections, setSections] = useState<Section[]>([]);
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const root = document.getElementById('main-content');
    if (!root) return;

    let frame = 0;
    let current: Section[] = [];

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
      setVisible(root.scrollHeight > root.clientHeight + 40 && current.length > 1);
    };

    const collect = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const blocks = [...root.querySelectorAll<HTMLElement>('.notion-editor-canvas > .notion-block-row')];
        const nodes = blocks.length ? blocks : [...root.querySelectorAll<HTMLElement>('.settings-scroll-section, h2, h3')];
        current = nodes
          .filter((element) => element.getClientRects().length && element.dataset.scrollKind !== 'divider' && !element.closest('[role="dialog"]'))
          .slice(0, 60)
          .map((element) => {
            const heading = element.querySelector<HTMLElement>('h1,h2,h3,[contenteditable="true"]');
            const text = (element.dataset.scrollLabel || heading?.textContent || element.textContent || '').trim().replace(/\s+/g, ' ');
            return {
              element,
              title: text.slice(0, 80) || (locale === 'ar' ? 'قسم' : 'Section'),
              preview: element.dataset.scrollKind === 'database-view'
                ? (locale === 'ar' ? 'الانتقال إلى قاعدة بيانات هذه الصفحة' : 'Jump to this page\'s database')
                : (element.textContent ?? '').trim().slice(0, 180),
            };
          });
        setSections(current);
        update();
      });
    };

    const observer = new MutationObserver(collect);
    observer.observe(root, { childList: true, subtree: true, characterData: true });

    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(collect);
    resize?.observe(root);

    root.addEventListener('scroll', update, { passive: true });
    collect();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize?.disconnect();
      root.removeEventListener('scroll', update);
    };
  }, [locale, pageKey]);

  if (!visible) return null;

  return (
    <nav
      aria-label={locale === 'ar' ? 'موضع القراءة وأقسام الصفحة' : 'Reading position and page sections'}
      className="scroll-outline"
    >
      {sections.map((section, index) => (
        <button
          aria-current={index === active ? 'location' : undefined}
          aria-label={section.title}
          className="scroll-outline__mark"
          key={index}
          onClick={() => {
            section.element.scrollIntoView({
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
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
            style={{ width: index === active ? 28 : 10 + Math.min(10, section.title.length / 5) }}
          />
          <span aria-hidden="true" className="scroll-outline__preview">
            <strong>{section.title}</strong>
            <span>{section.preview}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}
