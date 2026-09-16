// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

import { StickyScrollbar } from './StickyScrollbar';

beforeAll(() => {
  // jsdom lays nothing out, so the widths a real scroller would report are
  // supplied here instead. ResizeObserver does not exist there either.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

/** A scroller that reports the given widths, the way a real table would. */
function scrollerOf(scrollWidth: number, clientWidth: number): HTMLElement {
  const element = document.createElement('div');
  element.append(document.createElement('div'));
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: clientWidth });
  document.body.append(element);
  return element;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('StickyScrollbar', () => {
  it('draws nothing when the content already fits', () => {
    const { container } = render(<StickyScrollbar scroller={scrollerOf(800, 800)} />);

    expect(container.querySelector('.sticky-scrollbar')).toBeNull();
  });

  it('draws nothing when there is no scroller yet', () => {
    const { container } = render(<StickyScrollbar scroller={null} />);

    expect(container.querySelector('.sticky-scrollbar')).toBeNull();
  });

  it('is as wide as the content it stands in for', () => {
    const { container } = render(<StickyScrollbar scroller={scrollerOf(2400, 1000)} />);

    const bar = container.querySelector('.sticky-scrollbar');
    expect(bar).not.toBeNull();
    expect(bar?.firstElementChild).toHaveStyle({ width: '2400px' });
  });

  it('moves the real scroller when it is dragged', () => {
    const scroller = scrollerOf(2400, 1000);
    const { container } = render(<StickyScrollbar scroller={scroller} />);
    const bar = container.querySelector('.sticky-scrollbar')!;

    act(() => {
      bar.scrollLeft = 640;
      bar.dispatchEvent(new Event('scroll'));
    });

    expect(scroller.scrollLeft).toBe(640);
  });

  it('follows the real scroller when that is moved instead', () => {
    const scroller = scrollerOf(2400, 1000);
    const { container } = render(<StickyScrollbar scroller={scroller} />);
    const bar = container.querySelector('.sticky-scrollbar')!;

    act(() => {
      scroller.scrollLeft = 320;
      scroller.dispatchEvent(new Event('scroll'));
    });

    expect(bar.scrollLeft).toBe(320);
  });
});
