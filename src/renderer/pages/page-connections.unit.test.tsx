// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PageGraph } from '../../shared/page-links';
import { PageConnections } from './page-connections';

afterEach(cleanup);

function mount(graph: PageGraph, locale: 'ar' | 'en' = 'en') {
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: { getPageGraph: () => Promise.resolve(graph) } } });
  return render(<PageConnections locale={locale} pageId="here" />);
}

const graph: PageGraph = {
  brokenLinks: [
    { sourceId: 'here', state: 'archived', targetId: 'old', title: 'Old plan' },
    { sourceId: 'here', state: 'deleted', targetId: 'gone' },
    { sourceId: 'elsewhere', state: 'deleted', targetId: 'other' },
  ],
  links: [
    { sourceId: 'here', targetId: 'next' },
    { sourceId: 'from', targetId: 'here' },
  ],
  pages: [
    { id: 'here', title: 'This page' },
    { id: 'next', title: 'Next steps' },
    { id: 'from', title: 'Weekly notes' },
    { id: 'elsewhere', title: 'Unrelated' },
  ],
};

describe('PageConnections', () => {
  it('lists pages this page links to and pages that link here, and opens them', async () => {
    mount(graph);
    const linkedFrom = (await screen.findByText('Linked from')).closest('details')!;
    expect(await within(linkedFrom).findByRole('button', { name: 'Weekly notes' })).toBeInTheDocument();
    const linksTo = screen.getByText('Links to').closest('details')!;
    expect(within(linksTo).getByRole('button', { name: 'Next steps' })).toBeInTheDocument();
    expect(within(linksTo).queryByRole('button', { name: 'Weekly notes' })).not.toBeInTheDocument();

    const opened = vi.fn();
    window.addEventListener('max:open-page', (event) => { opened((event as CustomEvent<string>).detail); });
    await userEvent.click(within(linksTo).getByRole('button', { name: 'Next steps' }));
    expect(opened).toHaveBeenCalledWith('next');
  });

  it('shows links to a page in Trash and to a deleted page without making them clickable', async () => {
    mount(graph);
    const linksTo = (await screen.findByText('Links to')).closest('details')!;
    await within(linksTo).findByText('In Trash');
    expect(within(linksTo).getByText('Old plan')).toBeInTheDocument();
    expect(within(linksTo).getByText('Deleted page')).toBeInTheDocument();
    expect(within(linksTo).getByText('3')).toBeInTheDocument();
    expect(within(linksTo).queryByRole('button', { name: /Old plan|Deleted/ })).not.toBeInTheDocument();
  });

  it('names the panel as page links, not relations, in Arabic', async () => {
    mount(graph, 'ar');
    expect(await screen.findByRole('complementary', { name: 'روابط الصفحة' })).toBeInTheDocument();
    expect(await screen.findByText('في سلة المهملات')).toBeInTheDocument();
    expect(screen.queryByText(/relation|علاقة/i)).not.toBeInTheDocument();
  });

  it('keeps working when the graph has no broken-link list', async () => {
    mount({ links: [{ sourceId: 'here', targetId: 'next' }], pages: graph.pages });
    expect(await screen.findByRole('button', { name: 'Next steps' })).toBeInTheDocument();
  });
});
