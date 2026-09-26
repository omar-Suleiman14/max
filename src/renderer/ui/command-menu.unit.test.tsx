// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import axe from 'axe-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommandMenu, type Command } from './command-menu';

afterEach(cleanup);

function commands(run = vi.fn()): Command[] {
  return [
    { id: 'settings', keywords: ['preferences'], label: 'Open settings', run: () => { run('settings'); } },
    { id: 'page', keywords: ['create'], label: 'New page', run: () => { run('page'); } },
    { id: 'pages', keywords: [], label: 'Pages', run: () => { run('pages'); } },
    { id: 'invoice', keywords: ['فاتورة ١٢٣'], label: 'Invoice 123', run: () => { run('invoice'); } },
  ];
}

/** The menu over a button that opened it, so focus return can be checked. */
function Harness({ list, locale = 'en' }: { list: readonly Command[]; locale?: 'ar' | 'en' }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Commands</button>
    {open && <CommandMenu commands={list} locale={locale} onClose={() => setOpen(false)} />}
  </>;
}

async function openMenu(list: readonly Command[], locale: 'ar' | 'en' = 'en') {
  const user = userEvent.setup();
  render(<Harness list={list} locale={locale} />);
  await user.click(screen.getByRole('button', { name: 'Commands' }));
  return { input: screen.getByRole('combobox'), user };
}

const active = () => screen.getAllByRole('option').find((option) => option.getAttribute('aria-selected') === 'true')?.textContent;

describe('CommandMenu', () => {
  it('focuses the search box and lists every command', async () => {
    const { input } = await openMenu(commands());
    expect(input).toHaveFocus();
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('narrows as you type and ranks an exact label first, then a prefix, then a keyword match', async () => {
    const { input, user } = await openMenu(commands());
    await user.type(input, 'pages');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Pages']);
    await user.clear(input);
    await user.type(input, 'page');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Pages', 'New page']);
    await user.clear(input);
    await user.type(input, 'preferences');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Open settings']);
    expect(screen.getByRole('status')).toHaveTextContent('1 result');
  });

  it('moves with the arrows, wrapping at both ends, and runs the highlighted command with Enter', async () => {
    const run = vi.fn();
    const { user } = await openMenu(commands(run));
    expect(active()).toBe('Open settings');
    await user.keyboard('{ArrowUp}');
    expect(active()).toBe('Invoice 123');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(active()).toBe('New page');
    await user.keyboard('{Enter}');
    expect(run).toHaveBeenCalledWith('page');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('closes with Escape and returns focus to what opened it', async () => {
    const { user } = await openMenu(commands());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Commands' })).toHaveFocus();
  });

  it('finds Arabic keywords typed with Arabic-Indic or Latin digits', async () => {
    const { input, user } = await openMenu(commands(), 'ar');
    await user.type(input, 'فاتوره 123');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Invoice 123']);
    expect(screen.getByRole('status')).toHaveTextContent('نتيجة واحدة');
  });

  it('says when nothing matches and has no detectable accessibility violations', async () => {
    const { input, user } = await openMenu(commands());
    expect((await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]);
    await user.type(input, 'zzz');
    expect(screen.getByRole('status')).toHaveTextContent('No results');
  });
});

describe('CommandMenu, earlier coverage', () => {
  it('supports typing, arrow selection and Enter without losing Arabic digit matches', async () => {
    const run = vi.fn();
    const close = vi.fn();
    render(<CommandMenu locale="ar" onClose={close} commands={[
      { id: 'first', keywords: [], label: 'فاتورة ١٢٣', run: vi.fn() },
      { id: 'second', keywords: [], label: 'فاتورة 123 أخرى', run },
    ]} />);
    const user = userEvent.setup();
    expect(screen.getByRole('combobox')).toHaveFocus();
    await user.type(screen.getByRole('combobox'), 'فاتوره 123');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(run).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes on Escape', async () => {
    const close = vi.fn();
    render(<CommandMenu locale="en" onClose={close} commands={[]} />);
    await userEvent.setup().keyboard('{Escape}');
    expect(close).toHaveBeenCalledOnce();
  });
});
