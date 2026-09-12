export type AnchorRect = Readonly<{
  bottom: number;
  left: number;
  right: number;
  top: number;
}>;

export type AnchorViewport = Readonly<{
  height: number;
  rtl: boolean;
  width: number;
}>;

/**
 * Where to put the popover, expressed as the style it needs.
 *
 * Exactly one of `top` and `bottom` is set: a popover that opens upward is
 * pinned by its bottom edge so it keeps touching the trigger whatever its
 * content turns out to measure.
 */
export type AnchoredPosition = Readonly<{
  bottom?: number;
  left: number;
  maxHeight: number;
  top?: number;
}>;

const margin = 8;

function clamp(value: number, lowest: number, highest: number): number {
  return highest < lowest ? lowest : Math.min(highest, Math.max(lowest, value));
}

/**
 * Place a popover against its trigger.
 *
 * The inline edge follows the writing direction: a left-to-right popover starts
 * at the trigger's left edge, a right-to-left one ends at its right edge. Pinning
 * every popover to `left` is what made them open away from their trigger in
 * Arabic, drifting across the screen as the popover grew wider than the button.
 *
 * Vertically the popover prefers the space below the trigger and flips above it
 * when that space is the larger of the two, so a trigger near the bottom of the
 * window does not get a popover stranded at the top. Upward it is pinned by its
 * bottom edge rather than positioned at the top of the space it may use:
 * reserving the full preferred height and then filling it with a three-row list
 * is what left popovers floating hundreds of pixels above the cell they belong
 * to.
 */
export function anchorPopover(
  rect: AnchorRect | undefined,
  size: Readonly<{ preferredHeight: number; width: number }>,
  viewport: AnchorViewport,
  gap = 6,
): AnchoredPosition {
  const width = Math.min(size.width, Math.max(0, viewport.width - margin * 2));
  const furthestLeft = viewport.width - width - margin;

  if (!rect) {
    return {
      left: clamp((viewport.width - width) / 2, margin, furthestLeft),
      maxHeight: Math.max(120, viewport.height - 100 - margin),
      top: 100,
    };
  }

  const inlineStart = viewport.rtl ? rect.right - width : rect.left;
  const left = clamp(inlineStart, margin, furthestLeft);
  const below = viewport.height - rect.bottom - gap - margin;
  const above = rect.top - gap - margin;

  if (below < size.preferredHeight && above > below) {
    return { bottom: Math.max(margin, viewport.height - rect.top + gap), left, maxHeight: Math.max(120, above) };
  }
  return { left, maxHeight: Math.max(120, below), top: clamp(rect.bottom + gap, margin, Math.max(margin, viewport.height - margin)) };
}

/** The viewport as the popover helpers see it, read from the live document. */
export function currentViewport(): AnchorViewport {
  return {
    height: window.innerHeight,
    rtl: document.documentElement.dir === 'rtl',
    width: window.innerWidth,
  };
}
