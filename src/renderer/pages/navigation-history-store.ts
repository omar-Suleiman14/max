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
