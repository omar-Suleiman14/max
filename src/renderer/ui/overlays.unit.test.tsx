// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import axe from 'axe-core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CoverPicker } from '../pages/cover-picker';
import { DatabasePopover } from './database-popover';
import { FocusedOverlay } from './focused-overlay';
import { IconPickerDialog } from './icon-picker-dialog';
import { overlayDepth } from './overlay-stack';
import { Select } from './select';

const axeRules = { rules: { 'color-contrast': { enabled: false } } };
const noViolations = async () => expect((await axe.run(document.body, axeRules)).violations.map((violation) => violation.id)).toEqual([]);

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { assets: { importImage: vi.fn() } } });
});
afterEach(() => { cleanup(); document.documentElement.dir = ''; });

/** A trigger that opens an overlay and sits at a known place on screen. */
function Trigger({ children, label = 'Open' }: { children: (close: () => void, anchor: HTMLButtonElement | null) => ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={(element) => { ref.current = element; if (element) element.getBoundingClientRect = () => ({ bottom: 120, height: 20, left: 500, right: 600, top: 100, width: 100, x: 500, y: 100, toJSON: () => ({}) }); }} type="button" onClick={() => setOpen((value) => !value)}>{label}</button>
    <button type="button">Elsewhere</button>
    {open && children(() => setOpen(false), ref.current)}
  </>;
}

async function open(label = 'Open') {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: label }));
  return user;
}

const overlays: readonly Readonly<{ name: string; mount: () => ReactNode; focused: () => HTMLElement; anchored: boolean; clickAway: boolean }>[] = [
  {
    anchored: false, clickAway: false, focused: () => screen.getByRole('textbox', { name: 'Name' }), name: 'FocusedOverlay dialog',
    mount: () => <Trigger>{(close) => <FocusedOverlay labelId="t" onClose={close}><h2 id="t">Rename</h2><input aria-label="Name" data-autofocus="true" /><button type="button">Save</button></FocusedOverlay>}</Trigger>,
  },
  {
    anchored: true, clickAway: true, focused: () => screen.getByRole('textbox', { name: 'Filter value' }), name: 'DatabasePopover',
    mount: () => <Trigger>{(close) => <DatabasePopover labelId="p" onClose={close}><h3 id="p">Filter</h3><input aria-label="Filter value" /><button type="button">Apply</button></DatabasePopover>}</Trigger>,
  },
  {
    anchored: true, clickAway: true, focused: () => screen.getByRole('textbox', { name: 'Search icons' }), name: 'IconPickerDialog',
    mount: () => <Trigger>{(close, anchor) => <IconPickerDialog anchor={anchor} locale="en" onClose={close} onSelect={vi.fn()} />}</Trigger>,
  },
  {
    anchored: false, clickAway: true, focused: () => screen.getAllByRole('tab')[0]!, name: 'CoverPicker',
    mount: () => <Trigger>{(close) => <CoverPicker hasCover={false} locale="en" onClose={close} onPick={vi.fn()} onRemove={vi.fn()} />}</Trigger>,
  },
];

describe.each(overlays)('$name', ({ anchored, clickAway, focused, mount }) => {
  it('takes focus when it opens and gives it back when Escape closes it', async () => {
    render(<>{mount()}</>);
    const user = await open();
    await waitFor(() => expect(focused()).toHaveFocus());
    expect(overlayDepth()).toBe(1);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(overlayDepth()).toBe(0);
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  it(clickAway ? 'closes on a press outside it, but not on its own trigger' : 'stays open on a press outside its panel except its backdrop', async () => {
    render(<>{mount()}</>);
    await open();
    await screen.findByRole('dialog');
    fireEvent.pointerDown(screen.getByRole('dialog'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    if (clickAway) expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    else expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('has no detectable accessibility violations', async () => {
    render(<>{mount()}</>);
    await open();
    await screen.findByRole('dialog');
    await noViolations();
  });

  it.runIf(anchored)('opens from the inline start of its trigger, mirrored in Arabic', async () => {
    document.documentElement.dir = 'rtl';
    render(<>{mount()}</>);
    await open();
    const panel = await screen.findByRole('dialog');
    const left = parseFloat(panel.style.left);
    const width = parseFloat(panel.style.width) || 0;
    // In Arabic the popover's right edge meets the trigger's right edge (600).
    expect(left + width).toBeCloseTo(600, 0);
  });
});

describe('modal overlays', () => {
  it('keep Tab inside', async () => {
    render(<>{overlays[0]!.mount()}</>);
    const user = await open();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus());
    await user.tab();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
  });

  it('close from the backdrop', async () => {
    render(<>{overlays[0]!.mount()}</>);
    await open();
    fireEvent.mouseDown(document.querySelector('.overlay')!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('nested overlays', () => {
  function DialogWithPicker() {
    return <Trigger>{(close) => <FocusedOverlay labelId="d" onClose={close}>
      <h2 id="d">Edit page</h2>
      <Trigger label="Icon">{(closePicker, anchor) => <IconPickerDialog anchor={anchor} locale="en" onClose={closePicker} onSelect={vi.fn()} />}</Trigger>
    </FocusedOverlay>}</Trigger>;
  }

  it('close from the top down, one Escape at a time, returning focus at each step', async () => {
    render(<DialogWithPicker />);
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Icon' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Search icons' })).toHaveFocus());
    expect(overlayDepth()).toBe(2);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Select icon' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Icon' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  it('close only the picker when pressing elsewhere inside the dialog', async () => {
    render(<DialogWithPicker />);
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Icon' }));
    fireEvent.pointerDown(screen.getByRole('heading', { name: 'Edit page' }));
    expect(screen.queryByRole('dialog', { name: 'Select icon' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit page' })).toBeInTheDocument();
  });

  it('let an open select list take Escape before the popover around it', async () => {
    const user = userEvent.setup();
    render(<Trigger>{(close) => <DatabasePopover labelId="s" onClose={close}><h3 id="s">Sort</h3>
      <label><span>Direction</span><Select defaultValue="asc"><option value="asc">Ascending</option><option value="desc">Descending</option></Select></label>
    </DatabasePopover>}</Trigger>);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Sort' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('list-like overlays', () => {
  it('the select list moves with the arrows and chooses with Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select aria-label="Direction" defaultValue="asc" onChange={onChange}><option value="asc">Ascending</option><option value="desc">Descending</option></Select>);
    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByRole('combobox')).toHaveTextContent('Descending');
  });

  it('the select list opens from the inline start of its trigger in Arabic', async () => {
    document.documentElement.dir = 'rtl';
    const user = userEvent.setup();
    render(<Select aria-label="Direction" defaultValue="asc"><option value="asc">Ascending</option></Select>);
    const trigger = screen.getByRole('combobox');
    trigger.getBoundingClientRect = () => ({ bottom: 120, height: 20, left: 500, right: 700, top: 100, width: 200, x: 500, y: 100, toJSON: () => ({}) });
    await user.click(trigger);
    const list = screen.getByRole('listbox');
    expect(parseFloat(list.style.left) + parseFloat(list.style.width)).toBeCloseTo(700, 0);
  });

  it('the icon grid moves with the arrow keys, mirrored in Arabic', async () => {
    render(<>{overlays[2]!.mount()}</>);
    const user = await open();
    const search = await screen.findByRole('textbox', { name: 'Search icons' });
    await waitFor(() => expect(search).toHaveFocus());
    const items = [...document.querySelectorAll<HTMLElement>('.icon-picker-popover__grid button')];
    // jsdom has no layout: lay the first items out on one row.
    items.slice(0, 4).forEach((item, index) => { item.getBoundingClientRect = () => ({ bottom: 30, height: 30, left: index * 30, right: index * 30 + 30, top: 0, width: 30, x: index * 30, y: 0, toJSON: () => ({}) }); });
    await user.keyboard('{ArrowDown}');
    expect(items[0]).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(items[1]).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(items[0]).toHaveFocus();
  });
});
