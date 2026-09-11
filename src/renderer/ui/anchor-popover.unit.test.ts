import { describe, expect, it } from 'vitest';

import { anchorPopover } from './anchor-popover';

const viewport = { height: 800, rtl: false, width: 1200 };
const size = { preferredHeight: 320, width: 380 };

describe('anchoring a popover to its trigger', () => {
  it('starts at the trigger in left-to-right and ends at it in right-to-left', () => {
    const trigger = { bottom: 220, left: 700, right: 760, top: 190 };

    expect(anchorPopover(trigger, size, viewport).left).toBe(700);
    // The same trigger in Arabic: the popover's trailing edge lines up with it.
    expect(anchorPopover(trigger, size, { ...viewport, rtl: true }).left).toBe(760 - 380);
  });

  it('keeps a right-to-left popover on screen when the trigger sits near the start edge', () => {
    const trigger = { bottom: 220, left: 40, right: 100, top: 190 };

    expect(anchorPopover(trigger, size, { ...viewport, rtl: true }).left).toBe(8);
  });

  it('opens below the trigger when there is room', () => {
    const placed = anchorPopover({ bottom: 220, left: 100, right: 160, top: 190 }, size, viewport);

    expect(placed.top).toBe(226);
    expect(placed.maxHeight).toBe(800 - 220 - 6 - 8);
  });

  it('flips above a trigger near the bottom instead of jumping to the top', () => {
    const trigger = { bottom: 770, left: 100, right: 160, top: 740 };
    const placed = anchorPopover(trigger, size, viewport);

    expect(placed.top).toBe(740 - 6 - Math.min(320, 740 - 6 - 8));
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(740);
  });

  it('centres itself when the trigger cannot be measured', () => {
    expect(anchorPopover(undefined, size, viewport).left).toBe((1200 - 380) / 2);
  });

  it('never overflows a window narrower than the popover', () => {
    const narrow = { height: 800, rtl: false, width: 300 };
    const placed = anchorPopover({ bottom: 220, left: 280, right: 296, top: 190 }, size, narrow);

    expect(placed.left).toBe(8);
  });
});
