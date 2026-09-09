import { useEffect } from 'react';

export function readSessionValue(key: string, fallback: string): string {
  try { return localStorage.getItem(`max:session:${key}`) || fallback; } catch { return fallback; }
}
export function writeSessionValue(key: string, value: string) {
  try { localStorage.setItem(`max:session:${key}`, value); } catch { /* Storage is optional. */ }
}

export function usePagePosition(page: string) {
  useEffect(() => {
    writeSessionValue('page', page);
    const key = `scroll:${page}`;
    let positions: Record<string, { top: number; left: number }> = {};
    try { positions = JSON.parse(readSessionValue(key, '{}')) as typeof positions; } catch { /* Start at the top. */ }
    const restored = new WeakSet<Element>();
    let interacting = false;
    const selectors = ['#main-content', '#main-content .table-view-container', '#main-content .table-view-scroll'];
    const restore = () => {
      selectors.forEach((selector) => document.querySelectorAll<HTMLElement>(selector).forEach((element, index) => {
        if (restored.has(element) || interacting) return;
        const value = positions[`${selector}:${index}`];
        if (!value) { element.scrollTop = 0; element.scrollLeft = 0; restored.add(element); return; }
        element.scrollTop = value.top; element.scrollLeft = value.left;
        if (Math.abs(element.scrollTop - value.top) < 2 && Math.abs(element.scrollLeft - value.left) < 2) restored.add(element);
      }));
    };
    const save = (event: Event) => {
      if (!(event.target instanceof HTMLElement)) return;
      const element = event.target;
      if (!interacting && !restored.has(element)) return;
      for (const selector of selectors) {
        const index = Array.from(document.querySelectorAll(selector)).indexOf(element);
        if (index >= 0) { positions[`${selector}:${index}`] = { top: element.scrollTop, left: element.scrollLeft }; writeSessionValue(key, JSON.stringify(positions)); break; }
      }
    };
    const interact = (event: Event) => { if (event.target instanceof Element && event.target.closest('#main-content')) interacting = true; };
    const observer = new MutationObserver(restore);
    observer.observe(document.body, { childList: true, subtree: true });
    const resize = new ResizeObserver(restore);
    resize.observe(document.body);
    const frame = requestAnimationFrame(restore);
    document.addEventListener('scroll', save, true);
    document.addEventListener('wheel', interact, true);
    document.addEventListener('pointerdown', interact, true);
    document.addEventListener('keydown', interact, true);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect();
      document.removeEventListener('scroll', save, true);
      document.removeEventListener('wheel', interact, true);
      document.removeEventListener('pointerdown', interact, true);
      document.removeEventListener('keydown', interact, true);
    };
  }, [page]);
}
