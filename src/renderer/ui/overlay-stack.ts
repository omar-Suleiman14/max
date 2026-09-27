import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * One stack for every overlay in Max (dialogs, drawers, popovers, pickers and
 * select lists), so they all behave the same way. docs/engineering/overlays.md
 * states the rules:
 *
 * - Escape closes the topmost overlay only, one layer per press. It never saves
 *   a pending draft and never undoes what an overlay already saved.
 * - A press outside the topmost overlay closes it, and only it, unless the
 *   press is on the control that opened it (that control toggles it itself).
 *   Modal overlays close from their backdrop the same way.
 * - Opening moves focus into the overlay; closing returns it to where it was.
 */
type Layer = Readonly<{
  anchor: () => Element | null | undefined;
  clickAway: boolean;
  close: () => void;
  root: RefObject<HTMLElement | null>;
}>;

const layers: Layer[] = [];

export function overlayDepth(): number { return layers.length; }

export function isTopmostOverlay(root: HTMLElement | null): boolean {
  return Boolean(root) && layers.at(-1)?.root.current === root;
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
  const top = layers.at(-1);
  if (!top) return;
  event.preventDefault();
  event.stopPropagation();
  top.close();
}

function onPointerDown(event: PointerEvent) {
  const top = layers.at(-1);
  if (!top?.clickAway || !(event.target instanceof Node)) return;
  if (top.root.current?.contains(event.target) || top.anchor()?.contains(event.target)) return;
  // The same pointerdown can reach a parent modal backdrop after this layer
  // closes. Mark it consumed so one press dismisses only this layer.
  event.preventDefault();
  top.close();
}

function listen(active: boolean) {
  // Bubble phase, so a control that handles Escape itself (a text field
  // cancelling an edit, a select closing its list) and stops the event wins.
  if (active) {
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
  } else {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('pointerdown', onPointerDown, true);
  }
}

/**
 * Registers an overlay while it is mounted. The newest overlay is on top.
 * `onClose` may change between renders; the latest one is always called.
 */
export function useOverlayLayer(root: RefObject<HTMLElement | null>, options: Readonly<{ anchor?: Element | null; clickAway?: boolean; enabled?: boolean; onClose: () => void }>) {
  const latest = useRef(options);
  latest.current = options;
  const enabled = options.enabled ?? true;
  useLayoutEffect(() => {
    if (!enabled) return;
    const layer: Layer = { anchor: () => latest.current.anchor, clickAway: latest.current.clickAway ?? true, close: () => latest.current.onClose(), root };
    layers.push(layer);
    if (layers.length === 1) listen(true);
    return () => {
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
      if (layers.length === 0) listen(false);
    };
  }, [enabled, root]);
}

const focusable = 'input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Moves focus into an overlay when it opens, to `[data-autofocus]` or the first
 * control, and puts it back where it was when the overlay closes.
 */
export function useOverlayFocus(root: RefObject<HTMLElement | null>, options: Readonly<{ enabled?: boolean; returnTo?: HTMLElement | null }> = {}) {
  const enabled = options.enabled ?? true;
  const returnTo = useRef(options.returnTo);
  returnTo.current = options.returnTo;
  useEffect(() => {
    if (!enabled) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = root.current;
    if (panel && !panel.contains(document.activeElement)) {
      (panel.querySelector<HTMLElement>('[data-autofocus="true"]') ?? panel.querySelector<HTMLElement>(focusable) ?? panel).focus({ preventScroll: true });
    }
    return () => {
      const target = returnTo.current ?? previous;
      // Only take focus back if it was left inside the closing overlay or dropped to the page.
      const active = document.activeElement;
      if (target?.isConnected && (!active || active === document.body || !active.isConnected || panel?.contains(active))) target.focus({ preventScroll: true });
    };
  }, [enabled, root]);
}

/** Tab and Shift+Tab stay inside a modal overlay. */
export function containTab(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'preventDefault'>, panel: HTMLElement | null) {
  if (event.key !== 'Tab' || !panel) return;
  const items = [...panel.querySelectorAll<HTMLElement>(focusable)].filter((item) => !item.closest('[inert]'));
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last) { event.preventDefault(); return; }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) { event.preventDefault(); first.focus(); }
}

/**
 * Arrow keys across a grid of buttons (icons, emoji, colours). Left and Right
 * follow reading direction, so they swap in Arabic; Up and Down move to the
 * nearest item in the row above or below.
 */
export function moveInGrid(event: Pick<KeyboardEvent, 'key' | 'preventDefault'>, items: readonly HTMLElement[], rtl: boolean): boolean {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return false;
  const index = items.indexOf(document.activeElement as HTMLElement);
  if (index < 0) return false;
  let next = index;
  if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = items.length - 1;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = index + ((event.key === 'ArrowRight') !== rtl ? 1 : -1);
  else {
    const here = items[index]!.getBoundingClientRect();
    const down = event.key === 'ArrowDown';
    const rows = items.map((item, position) => ({ position, rect: item.getBoundingClientRect() })).filter(({ rect }) => (down ? rect.top > here.top + 1 : rect.top < here.top - 1));
    const rowTop = down ? Math.min(...rows.map(({ rect }) => rect.top)) : Math.max(...rows.map(({ rect }) => rect.top));
    const row = rows.filter(({ rect }) => Math.abs(rect.top - rowTop) < 1);
    const centre = here.left + here.width / 2;
    next = row.sort((left, right) => Math.abs(left.rect.left + left.rect.width / 2 - centre) - Math.abs(right.rect.left + right.rect.width / 2 - centre))[0]?.position ?? index;
  }
  const target = items[Math.max(0, Math.min(items.length - 1, next))];
  if (!target || target === items[index]) return false;
  event.preventDefault();
  target.focus();
  return true;
}
