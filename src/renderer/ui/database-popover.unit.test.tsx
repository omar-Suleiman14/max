// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { DatabasePopover } from './database-popover';

/** jsdom gives every element a zero rect, so the trigger and popover are sized here. */
function rect(overrides: Partial<DOMRect>): DOMRect {
  return {
    bottom: 0, height: 0, left: 0, right: 0, toJSON: () => ({}), top: 0, width: 0, x: 0, y: 0,
    ...overrides,
  };
}

function openAgainst(dir: 'ltr' | 'rtl') {
  document.documentElement.dir = dir;
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.getBoundingClientRect = () => rect({ bottom: 220, height: 30, left: 500, right: 560, top: 190, width: 60 });
  trigger.focus();

  // The popover measures its own width once mounted, before it is positioned.
  // Everything else keeps jsdom's zero rect, which is what it would return anyway.
  HTMLDivElement.prototype.getBoundingClientRect = function measured(this: HTMLDivElement) {
    return rect(this.classList.contains('database-anchored-popover') ? { width: 380 } : {});
  };
  try {
    render(<DatabasePopover onClose={() => {}}><button type="button">Rename</button></DatabasePopover>);
  } finally {
    delete (HTMLDivElement.prototype as Partial<HTMLDivElement>).getBoundingClientRect;
  }
  return screen.getByRole('dialog');
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  document.documentElement.dir = 'ltr';
});

describe('a popover anchored to a database control', () => {
  it('starts at the trigger in English and ends at it in Arabic', () => {
    expect(openAgainst('ltr').style.left).toBe('500px');
    cleanup();
    document.body.innerHTML = '';

    // 560 (the trigger trailing edge in Arabic) minus the popover 380px width.
    expect(openAgainst('rtl').style.left).toBe('180px');
  });

  it('opens just below the trigger', () => {
    expect(openAgainst('ltr').style.top).toBe('226px');
  });

  it('stays against a trigger whose menu closes as the popover opens', () => {
    // The real flow for "Edit property": the menu item that opens the popover is
    // taken out of the document by the very commit that mounts it.
    function Menu() {
      const [open, setOpen] = useState(false);
      if (open) return <DatabasePopover onClose={() => setOpen(false)}><button type="button">Rename</button></DatabasePopover>;
      return (
        <button
          type="button"
          ref={(node) => {
            if (node) node.getBoundingClientRect = () => rect({ bottom: 220, height: 30, left: 500, right: 560, top: 190, width: 60 });
          }}
          onClick={() => setOpen(true)}
        >
          Edit property
        </button>
      );
    }

    render(<Menu />);
    const trigger = screen.getByRole('button', { name: 'Edit property' });
    trigger.focus();

    HTMLDivElement.prototype.getBoundingClientRect = function measured(this: HTMLDivElement) {
      return rect(this.classList.contains('database-anchored-popover') ? { width: 380 } : {});
    };
    try {
      fireEvent.click(trigger);
    } finally {
      delete (HTMLDivElement.prototype as Partial<HTMLDivElement>).getBoundingClientRect;
    }

    expect(trigger.isConnected).toBe(false);
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.left).toBe('500px');
    expect(dialog.style.top).toBe('226px');
  });
});
