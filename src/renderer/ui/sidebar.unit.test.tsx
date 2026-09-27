// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import axe from 'axe-core';
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CustomPage } from '../app/app-types';
import type { NavigationItem } from '../../shared/workspace-contract';
import { Sidebar } from './sidebar';

const page = (id: string, title: string, positionKey: string, extra: Partial<CustomPage> = {}): CustomPage => ({
  blocks: [], createdAt: '2026-01-01T00:00:00.000Z', icon: 'lucide:FileText', id, positionKey, title, updatedAt: '2026-01-01T00:00:00.000Z', ...extra,
});

const pages = [
  page('plans', 'Plans', 'a0', { favorite: true, favoriteKey: 'a0' }),
  page('notes', 'Notes', 'aV', { favorite: true, favoriteKey: 'aV' }),
  page('ideas', 'Ideas', 'ak'),
  page('q3', 'Q3', 'a0', { parentNodeId: 'plans' }),
];
const databases: NavigationItem[] = [{ id: 'tasks', kind: 'database', level: 1, parentNodeId: 'plans', positionKey: 'aV', title: 'Tasks' }];

type Props = ComponentProps<typeof Sidebar>;

function mount(overrides: Partial<Props> = {}) {
  const props = {
    collapsed: false, customPages: pages, databases, locale: 'en', page: 'ideas', settingsSection: 'settings-general', width: 270,
    onAddCustomPage: vi.fn(), onAddSubpage: vi.fn(), onCollapse: vi.fn(), onDeletePage: vi.fn(() => Promise.resolve(true)), onDuplicatePage: vi.fn(),
    onExitSettings: vi.fn(), onMoveNodes: vi.fn(), onNavigate: vi.fn(), onNavigateView: vi.fn(), onOpenSettings: vi.fn(), onRenamePage: vi.fn(),
    onReorderFavorites: vi.fn(), onResize: vi.fn(), onRestoreNode: vi.fn(), onSettingsSectionChange: vi.fn(), onToggleFavorite: vi.fn(),
    ...overrides,
  } as Props;
  const view = render(<Sidebar {...props} />);
  return { ...view, props };
}

const workspace = () => screen.getByRole('navigation', { name: 'Workspace' });
const favorites = () => screen.getByRole('navigation', { name: 'Favorites' });
const row = (name: string) => within(workspace()).getByRole('button', { name });

/** jsdom rows have no height, so the planner reads clientY as the fraction down the row. */
function drag(from: HTMLElement, to: HTMLElement, fraction: number) {
  const data = { dropEffect: 'move', effectAllowed: 'move', setData: vi.fn(), setDragImage: vi.fn() };
  fireEvent.dragStart(from.closest('[draggable]')!, { dataTransfer: data });
  const target = to.closest('[draggable]')!;
  // jsdom has no DragEvent, so clientY is set on the event by hand.
  for (const make of [createEvent.dragOver, createEvent.drop]) {
    const event = make(target, { dataTransfer: data });
    Object.defineProperty(event, 'clientY', { value: fraction });
    fireEvent(target, event);
  }
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, 'maxApi', { configurable: true, value: {
    views: { list: () => Promise.resolve([]) },
    workspace: { listViews: () => Promise.resolve([]) },
  } });
});
// Focus moves on the next frame; let it land before the next test renders.
afterEach(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); cleanup(); });

describe('Sidebar nesting', () => {
  it('expands and collapses a page from the chevron and the keyboard, and remembers it', async () => {
    const user = userEvent.setup();
    const first = mount();
    expect(row('Plans')).toHaveAttribute('aria-expanded', 'false');
    expect(within(workspace()).queryByRole('button', { name: 'Q3' })).not.toBeInTheDocument();
    row('Plans').focus();
    await user.keyboard('{ArrowRight}');
    expect(row('Plans')).toHaveAttribute('aria-expanded', 'true');
    expect(row('Q3')).toBeInTheDocument();
    expect(row('Tasks')).toBeInTheDocument();
    first.unmount();

    mount();
    expect(row('Q3')).toBeInTheDocument();
    row('Plans').focus();
    await user.keyboard('{ArrowLeft}');
    expect(within(workspace()).queryByRole('button', { name: 'Q3' })).not.toBeInTheDocument();
  });

  it('mirrors Right and Left in Arabic', async () => {
    const user = userEvent.setup();
    mount({ locale: 'ar' });
    const plans = within(screen.getByRole('navigation', { name: 'مساحة العمل' })).getByRole('button', { name: 'Plans' });
    plans.focus();
    await user.keyboard('{ArrowLeft}');
    expect(plans).toHaveAttribute('aria-expanded', 'true');
  });

  it('reveals a nested page when it is opened', () => {
    mount({ page: 'q3' });
    expect(row('Q3')).toHaveAttribute('aria-current', 'page');
  });
});

describe('Sidebar drag and drop', () => {
  it('reorders with a single fractional-key write', () => {
    const { props } = mount();
    drag(row('Ideas'), row('Plans'), 0);
    expect(props.onMoveNodes).toHaveBeenCalledWith([{ id: 'ideas', parentNodeId: null, positionKey: expect.any(String) as string }]);
    const [[moves]] = vi.mocked(props.onMoveNodes).mock.calls as unknown as [[{ positionKey: string }[]]];
    expect(moves[0]!.positionKey < 'a0').toBe(true);
  });

  it('nests a page when dropped on the middle of another page, and expands the new parent', () => {
    const { props } = mount();
    drag(row('Ideas'), row('Notes'), .5);
    expect(props.onMoveNodes).toHaveBeenCalledWith([expect.objectContaining({ id: 'ideas', parentNodeId: 'notes' })]);
  });

  it('moves a page into a different parent by dropping beside a nested row', () => {
    localStorage.setItem('max.ui.sidebar-expanded', JSON.stringify(['plans']));
    const { props } = mount();
    drag(row('Ideas'), row('Q3'), 1);
    expect(props.onMoveNodes).toHaveBeenCalledWith([expect.objectContaining({ id: 'ideas', parentNodeId: 'plans' })]);
  });

  it('does not drop a page into its own child', () => {
    localStorage.setItem('max.ui.sidebar-expanded', JSON.stringify(['plans']));
    const { props } = mount();
    drag(row('Plans'), row('Q3'), .5);
    expect(props.onMoveNodes).not.toHaveBeenCalled();
  });

  it('drags the same way in Arabic', () => {
    const { props } = mount({ locale: 'ar' });
    const nav = screen.getByRole('navigation', { name: 'مساحة العمل' });
    drag(within(nav).getByRole('button', { name: 'Ideas' }), within(nav).getByRole('button', { name: 'Notes' }), 0);
    expect(props.onMoveNodes).toHaveBeenCalledWith([expect.objectContaining({ id: 'ideas', parentNodeId: null })]);
  });

  it('moves a row with Alt+Up', async () => {
    const user = userEvent.setup();
    const { props } = mount();
    row('Ideas').focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(props.onMoveNodes).toHaveBeenCalledWith([expect.objectContaining({ id: 'ideas', parentNodeId: null })]);
  });
});

describe('Sidebar favourites', () => {
  it('renames a nested favourite while its parent is collapsed', async () => {
    const user = userEvent.setup();
    const { props } = mount({ customPages: [...pages.slice(0, 3), { ...pages[3]!, favorite: true, favoriteKey: 'b0' }] });
    expect(within(workspace()).queryByRole('button', { name: 'Q3' })).not.toBeInTheDocument();
    await user.pointer({ keys: '[MouseRight]', target: within(favorites()).getByRole('button', { name: 'Q3' }) });
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input = within(favorites()).getByRole('textbox', { name: 'Page name' });
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, 'Quarter 3{Enter}');
    expect(props.onRenamePage).toHaveBeenCalledWith('q3', 'Quarter 3');
  });

  it('lists favourites in their own order and removes one', async () => {
    const user = userEvent.setup();
    const { props } = mount({ customPages: [pages[0]!, { ...pages[1]!, favoriteKey: '0V' }, pages[2]!, pages[3]!] });
    expect(within(favorites()).getAllByRole('button', { name: /^(Plans|Notes)$/ }).map((button) => button.textContent)).toEqual(['Notes', 'Plans']);
    await user.click(within(favorites()).getByRole('button', { name: 'Remove Plans from favorites' }));
    expect(props.onToggleFavorite).toHaveBeenCalledWith('plans', false);
  });

  it('reorders favourites by dragging and with Alt+Down', async () => {
    const user = userEvent.setup();
    const { props } = mount();
    drag(within(favorites()).getByRole('button', { name: 'Notes' }), within(favorites()).getByRole('button', { name: 'Plans' }), 0);
    expect(props.onReorderFavorites).toHaveBeenCalledWith(new Map([['notes', expect.any(String) as string]]));
    within(favorites()).getByRole('button', { name: 'Plans' }).focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(props.onReorderFavorites).toHaveBeenCalledTimes(2);
  });

  it('adds a page to favourites from its menu', async () => {
    const user = userEvent.setup();
    const { props } = mount();
    await user.pointer({ keys: '[MouseRight]', target: row('Ideas') });
    await user.click(screen.getByRole('menuitem', { name: 'Add to favorites' }));
    expect(props.onToggleFavorite).toHaveBeenCalledWith('ideas', true);
  });
});

describe('Sidebar menus', () => {
  const items = () => screen.getAllByRole('menuitem').map((item) => item.textContent);

  it('offers the same page actions from a tree row and a favourite', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(within(workspace()).getAllByRole('button', { name: 'Page settings' })[0]!);
    const fromTree = items();
    await user.keyboard('{Escape}');
    await user.pointer({ keys: '[MouseRight]', target: within(favorites()).getByRole('button', { name: 'Plans' }) });
    expect(items()).toEqual(fromTree);
    expect(fromTree).toEqual(['Add sub-page', 'Remove from favorites', 'Rename', 'Duplicate', 'Move to Trash']);
  });

  it('gives a database the actions that apply to it and renames it in place', async () => {
    const user = userEvent.setup();
    localStorage.setItem('max.ui.sidebar-expanded', JSON.stringify(['plans']));
    const { props } = mount();
    await user.click(within(workspace()).getByRole('button', { name: 'Tasks options' }));
    expect(items()).toEqual(['Rename', 'Move to Trash']);
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input = screen.getByRole('textbox', { name: 'Database name' });
    await user.clear(input);
    await user.type(input, 'Jobs{Enter}');
    expect(props.onRenamePage).toHaveBeenCalledWith('tasks', 'Jobs');
  });

  it('opens from the keyboard, focuses the first action, walks with arrows and returns focus on Escape', async () => {
    const user = userEvent.setup();
    mount();
    row('Ideas').focus();
    await user.keyboard('{Shift>}{F10}{/Shift}');
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Add sub-page' })).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Add to favorites' })).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Move to Trash' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await waitFor(() => expect(row('Ideas')).toHaveFocus());
  });
});

describe('Sidebar archive', () => {
  it('moves to Trash with an undo, never deleting', async () => {
    const user = userEvent.setup();
    const { props } = mount();
    await user.pointer({ keys: '[MouseRight]', target: row('Ideas') });
    await user.click(screen.getByRole('menuitem', { name: 'Move to Trash' }));
    expect(props.onDeletePage).toHaveBeenCalledWith('ideas');
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('"Ideas" moved to Trash');
    await user.click(within(notice).getByRole('button', { name: 'Undo' }));
    expect(props.onRestoreNode).toHaveBeenCalledWith('ideas');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows no undo when the move failed', async () => {
    const user = userEvent.setup();
    mount({ onDeletePage: vi.fn(() => Promise.resolve(false)) });
    await user.pointer({ keys: '[MouseRight]', target: row('Ideas') });
    await user.click(screen.getByRole('menuitem', { name: 'Move to Trash' }));
    await act(() => Promise.resolve());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Sidebar keyboard and accessibility', () => {
  it('walks every row with the arrow keys, favourites included', async () => {
    const user = userEvent.setup();
    mount();
    within(favorites()).getByRole('button', { name: 'Plans' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(within(favorites()).getByRole('button', { name: 'Notes' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(row('Plans')).toHaveFocus();
    await user.keyboard('{End}');
    expect(row('Ideas')).toHaveFocus();
  });

  it('collapses from its button', async () => {
    const user = userEvent.setup();
    const { props } = mount();
    await user.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    expect(props.onCollapse).toHaveBeenCalled();
  });

  it('has no detectable accessibility violations, open or with a menu', async () => {
    localStorage.setItem('max.ui.sidebar-expanded', JSON.stringify(['plans']));
    const { container } = mount();
    const rules = { rules: { 'color-contrast': { enabled: false } } };
    expect((await axe.run(container, rules)).violations).toEqual([]);
    fireEvent.contextMenu(row('Ideas').closest('[draggable]')!);
    expect((await axe.run(container, rules)).violations).toEqual([]);
  });
});
