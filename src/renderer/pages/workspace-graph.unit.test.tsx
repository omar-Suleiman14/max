// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import axe from 'axe-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PageGraph } from '../../shared/page-links';
import { WorkspaceGraph } from './workspace-graph';

const graph: PageGraph = {
  links: [{ sourceId: 'a', targetId: 'b' }],
  pages: [{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }, { id: 'c', title: 'Loose' }],
};

beforeEach(() => {
  localStorage.clear();
  // jsdom omits pointer capture; Chromium supplies it on the SVG canvas.
  Object.defineProperty(SVGElement.prototype, 'setPointerCapture', { configurable: true, value: () => undefined });
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: { getPageGraph: () => Promise.resolve(graph) } } });
});
afterEach(cleanup);

describe('WorkspaceGraph', () => {
  it('opens a page from a node by click and by keyboard', async () => {
    const opened = vi.fn();
    const listener = (event: Event) => { opened((event as CustomEvent<string>).detail); };
    window.addEventListener('max:open-page', listener);
    render(<WorkspaceGraph locale="en" onClose={() => undefined} />);
    const alpha = await screen.findByRole('button', { name: 'Alpha' });
    fireEvent.pointerDown(alpha, { button: 0 });
    fireEvent.pointerUp(alpha);
    expect(opened).toHaveBeenLastCalledWith('a');
    alpha.focus();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Beta' }), { key: 'Enter' });
    expect(opened).toHaveBeenLastCalledWith('b');
    window.removeEventListener('max:open-page', listener);
  });

  it('zooms from the keyboard and closes with Escape', async () => {
    const onClose = vi.fn();
    render(<WorkspaceGraph locale="en" onClose={onClose} />);
    const node = await screen.findByRole('button', { name: 'Alpha' });
    const zoom = () => Number(screen.getByRole('status').textContent.replace('%', ''));
    fireEvent.keyDown(node, { key: '+' });
    const before = zoom();
    fireEvent.keyDown(node, { key: '+' });
    const zoomedIn = zoom();
    expect(zoomedIn).toBeGreaterThan(before);
    fireEvent.keyDown(node, { key: '-' });
    expect(zoom()).toBeLessThan(zoomedIn);
    fireEvent.keyDown(node, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps filter, unlinked and label settings across reopening, but not the search', async () => {
    const user = userEvent.setup();
    const first = render(<WorkspaceGraph locale="en" onClose={() => undefined} />);
    await screen.findByRole('button', { name: 'Loose' });
    await user.type(screen.getByRole('textbox', { name: 'Find a page' }), 'Al');
    await user.click(screen.getByRole('button', { name: 'Graph options' }));
    await user.click(screen.getByRole('switch', { name: 'Unlinked pages' }));
    await user.click(screen.getByRole('switch', { name: 'Page labels' }));
    await user.type(screen.getByRole('textbox', { name: 'Filter pages' }), 'title:a');
    first.unmount();

    render(<WorkspaceGraph locale="en" onClose={() => undefined} />);
    await screen.findByRole('button', { name: 'Alpha' });
    expect(screen.queryByRole('button', { name: 'Loose' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Find a page' })).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Graph options' }));
    expect(screen.getByRole('switch', { name: 'Unlinked pages' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'Page labels' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('textbox', { name: 'Filter pages' })).toHaveValue('title:a');
  });

  it('reads right to left in Arabic, says when a filter matches nothing, and has no axe violations', async () => {
    localStorage.setItem('max.graph.filter', JSON.stringify('title:nothing'));
    const { container } = render(<div dir="rtl"><WorkspaceGraph locale="ar" onClose={() => undefined} /></div>);
    expect(await screen.findByText('لا توجد صفحات تطابق هذه التصفية.')).toBeInTheDocument();
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('lets Tab leave the graph rather than trapping focus', async () => {
    const user = userEvent.setup();
    render(<><WorkspaceGraph locale="en" onClose={() => undefined} /><button type="button">After</button></>);
    await screen.findByRole('button', { name: 'Loose' });
    for (let step = 0; step < 12 && document.activeElement?.textContent !== 'After'; step += 1) await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });
});
