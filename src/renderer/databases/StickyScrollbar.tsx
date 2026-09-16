import { useEffect, useRef, useState } from 'react';

/**
 * A horizontal scrollbar pinned to the bottom of the window.
 *
 * On a database page the database is the whole page, so the real scrollbar sits
 * under the last row and can be anywhere down the screen, or off it. This draws
 * a proxy bar that sticks to the bottom edge for as long as the database is on
 * screen and pushes its position into the real scroller, so the columns can be
 * scrolled from wherever the person happens to be looking.
 *
 * It renders nothing at all when the content already fits.
 */
export function StickyScrollbar({ scroller }: { readonly scroller: HTMLElement | null }) {
  const proxy = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState({ content: 0, visible: 0 });

  useEffect(() => {
    if (!scroller) return;
    const measure = () => setWidth((current) => (
      current.content === scroller.scrollWidth && current.visible === scroller.clientWidth
        ? current
        : { content: scroller.scrollWidth, visible: scroller.clientWidth }
    ));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    for (const child of scroller.children) observer.observe(child);
    return () => observer.disconnect();
  }, [scroller]);

  useEffect(() => {
    const bar = proxy.current;
    if (!scroller || !bar) return;
    // Either bar can be the one being dragged, and writing scrollLeft fires the
    // other's scroll event, so the echo has to be swallowed rather than looped.
    let echo = false;
    const follow = (from: HTMLElement, to: HTMLElement) => () => {
      if (echo) { echo = false; return; }
      echo = true;
      to.scrollLeft = from.scrollLeft;
    };
    const fromScroller = follow(scroller, bar);
    const fromBar = follow(bar, scroller);
    scroller.addEventListener('scroll', fromScroller, { passive: true });
    bar.addEventListener('scroll', fromBar, { passive: true });
    bar.scrollLeft = scroller.scrollLeft;
    return () => {
      scroller.removeEventListener('scroll', fromScroller);
      bar.removeEventListener('scroll', fromBar);
    };
  }, [scroller, width.content]);

  if (width.content <= width.visible + 1) return null;

  return (
    <div className="sticky-scrollbar" ref={proxy} aria-hidden="true">
      <div style={{ width: `${width.content}px` }} />
    </div>
  );
}
