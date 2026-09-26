/* eslint-disable @typescript-eslint/unbound-method -- polyfills test for missing prototype methods */
/**
 * jsdom leaves out a few browser APIs that the editor's UI kit calls on mount.
 * Real Chromium has them; tests get inert stand-ins so the editor can render.
 */
if (typeof window !== 'undefined') {
  window.matchMedia ??= (query: string) => ({
    addEventListener: () => undefined,
    addListener: () => undefined,
    dispatchEvent: () => false,
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: () => undefined,
    removeListener: () => undefined,
  });
  globalThis.ResizeObserver ??= class {
    observe() { /* inert */ }
    unobserve() { /* inert */ }
    disconnect() { /* inert */ }
  };
}

if (typeof Range !== 'undefined') {
  const empty = () => ({ bottom: 0, height: 0, left: 0, right: 0, toJSON: () => ({}), top: 0, width: 0, x: 0, y: 0 }) as DOMRect;
  Range.prototype.getClientRects ??= () => ({ item: () => null, length: 0, [Symbol.iterator]: [][Symbol.iterator] });
  Range.prototype.getBoundingClientRect ??= empty;
}
if (typeof document !== 'undefined') document.elementFromPoint ??= () => null;
if (typeof Element !== 'undefined') {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
}
