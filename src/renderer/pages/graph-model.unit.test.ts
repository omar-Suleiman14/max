import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from 'd3-force';
import { describe, expect, it } from 'vitest';

import type { PageGraph } from '../../shared/page-links';
import { labelVisible, LABEL_MIN_ZOOM, matchesGraphQuery, nodeColor, visibleGraph, type GraphPage } from './graph-model';

const page = (id: string, extra: Partial<GraphPage> = {}): GraphPage => ({ id, title: id, ...extra });

const graph: PageGraph = {
  links: [{ sourceId: 'a', targetId: 'b' }, { sourceId: 'b', targetId: 'c' }],
  pages: [
    page('a', { properties: [{ name: 'Status', value: 'Active' }, { name: 'Tags', value: '["urgent","ops"]' }], path: 'Projects/a' }),
    page('b', { properties: [{ name: 'Status', value: 'Paused' }], text: 'budget notes' }),
    page('c', { properties: [{ name: 'tag', value: 'archived' }] }),
    page('lonely'),
  ],
};

describe('graph filters', () => {
  it('narrows by property and by property value', () => {
    expect(visibleGraph(graph, { filter: 'property:Status=active', showUnlinked: true }).pages.map((p) => p.id)).toEqual(['a']);
    expect(visibleGraph(graph, { filter: 'property:status', showUnlinked: true }).pages.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('narrows by tag and excludes a tag', () => {
    expect(visibleGraph(graph, { filter: 'tag:urgent', showUnlinked: true }).pages.map((p) => p.id)).toEqual(['a']);
    expect(visibleGraph(graph, { filter: '-tag:archived', showUnlinked: true }).pages.map((p) => p.id)).toEqual(['a', 'b', 'lonely']);
  });

  it('treats AND as the joining word, not as a search term, and supports OR', () => {
    expect(matchesGraphQuery(graph.pages[1]!, 'budget AND notes')).toBe(true);
    expect(visibleGraph(graph, { filter: 'path:projects OR text:budget', showUnlinked: true }).pages.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('keeps only links whose two pages are both visible', () => {
    expect(visibleGraph(graph, { filter: '-title:c', showUnlinked: true }).links).toEqual([{ sourceId: 'a', targetId: 'b' }]);
  });
});

describe('isolated pages', () => {
  it('shows pages without page links by default and hides them on request', () => {
    expect(visibleGraph(graph, { filter: '', showUnlinked: true }).pages.map((p) => p.id)).toContain('lonely');
    expect(visibleGraph(graph, { filter: '', showUnlinked: false }).pages.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not call a page unlinked because a filter hid its neighbour', () => {
    expect(visibleGraph(graph, { filter: '-title:b', showUnlinked: false }).pages.map((p) => p.id)).toEqual(['a', 'c']);
  });
});

describe('colours and labels', () => {
  it('uses the first matching group, then the icon colour, then the default', () => {
    const groups = [{ color: 'red', id: '1', match: 'active', field: 'property' as const, propertyName: 'status' }, { color: 'blue', id: '2', match: 'a' }];
    expect(nodeColor(graph.pages[0]!, groups)).toBe('red');
    expect(nodeColor(page('x', { icon: 'lucide:Star#ff0000' }), [])).toBe('#ff0000');
    expect(nodeColor(page('x'), [])).toBe('default');
  });

  it('hides small labels when zoomed out, but keeps hubs and highlighted pages', () => {
    expect(labelVisible({ highlighted: false, radius: 8, showLabels: true, zoom: 1 })).toBe(true);
    expect(labelVisible({ highlighted: false, radius: 8, showLabels: true, zoom: LABEL_MIN_ZOOM - .2 })).toBe(false);
    expect(labelVisible({ highlighted: false, radius: 26, showLabels: true, zoom: .45 })).toBe(true);
    expect(labelVisible({ highlighted: true, radius: 8, showLabels: false, zoom: .2 })).toBe(true);
    expect(labelVisible({ highlighted: false, radius: 8, showLabels: false, zoom: 1 })).toBe(false);
  });
});

describe('graph performance on a large workspace', () => {
  it('filters and lays out 2,000 pages and 4,000 links', () => {
    const pages = Array.from({ length: 2000 }, (_, index) => page(`p${index}`, { properties: [{ name: 'Status', value: index % 3 ? 'Active' : 'Done' }], text: `note ${index}` }));
    const links = Array.from({ length: 4000 }, (_, index) => ({ sourceId: `p${index % 2000}`, targetId: `p${(index * 7 + 13) % 2000}` }));
    const large: PageGraph = { links, pages };

    let started = performance.now();
    const filtered = visibleGraph(large, { filter: 'property:Status=active -text:"note 1"', showUnlinked: false });
    const filterMs = performance.now() - started;

    type N = SimulationNodeDatum & { id: string };
    const nodes: N[] = large.pages.map((p) => ({ id: p.id }));
    const simulation = forceSimulation(nodes)
      .force('link', forceLink<N, { source: string; target: string }>(links.map((link) => ({ source: link.sourceId, target: link.targetId }))).id((node) => node.id).distance(110))
      .force('charge', forceManyBody().strength(-240))
      .force('center', forceCenter())
      .force('collide', forceCollide(24))
      .stop();
    started = performance.now();
    simulation.tick(10);
    const tickMs = (performance.now() - started) / 10;
    let ticks = 10;
    while (simulation.alpha() > .05) { simulation.tick(); ticks += 1; }
    const settleMs = performance.now() - started;

    console.info(`graph performance: filter ${filterMs.toFixed(1)} ms for ${filtered.pages.length}/${pages.length} pages; layout ${tickMs.toFixed(1)} ms per tick, ${ticks} ticks, ${settleMs.toFixed(0)} ms to settle`);
    expect(filterMs).toBeLessThan(250);
    expect(filtered.pages.length).toBeGreaterThan(0);
  }, 60_000);
});
