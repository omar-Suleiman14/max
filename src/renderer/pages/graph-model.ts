import type { PageGraph } from '../../shared/page-links';

export type GraphPage = PageGraph['pages'][number];
export type GraphGroup = { id: string; match: string; color: string; field?: 'title' | 'path' | 'text' | 'property'; propertyName?: string };

export function normalized(value: string): string { return value.toLocaleLowerCase().trim(); }

export function graphColor(color?: string): string {
  if (color?.startsWith('#')) return color;
  return color === 'default' || !color ? 'var(--muted)' : 'color-mix(in srgb, var(--option-' + color + '-text, var(--muted)) 65%, var(--muted))';
}

export function iconColor(icon?: string | null): string | undefined {
  const match = icon?.match(/#([0-9a-f]{3,8})$/i);
  return match ? '#' + match[1] : undefined;
}

export function groupMatches(page: GraphPage, group: GraphGroup): boolean {
  const match = normalized(group.match);
  if (!match) return false;
  if (group.field === 'path') return normalized(page.path ?? '').includes(match);
  if (group.field === 'text') return normalized(page.text ?? '').includes(match);
  if (group.field === 'property') return (page.properties ?? []).some((property) => normalized(property.name) === normalized(group.propertyName ?? '') && normalized(property.value).includes(match));
  return normalized(page.title).includes(match);
}

/** The first matching colour group wins; otherwise the page icon's colour. */
export function nodeColor(page: GraphPage, groups: readonly GraphGroup[]): string {
  return groups.find((group) => groupMatches(page, group))?.color ?? iconColor(page.icon) ?? 'default';
}

function queryTokens(value: string): readonly string[] {
  // AND is the default between terms, so the word itself is not a search term.
  return (value.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []).filter((token) => token !== 'AND');
}
function stripQuotes(value: string): string {
  const result = value.trim();
  return result.startsWith('"') && result.endsWith('"') ? result.slice(1, -1) : result;
}
function matchesQueryTerm(page: GraphPage, rawTerm: string): boolean {
  const separator = rawTerm.indexOf(':');
  if (separator < 1) {
    const term = normalized(stripQuotes(rawTerm));
    return normalized(page.title).includes(term) || normalized(page.text ?? '').includes(term);
  }
  const field = normalized(rawTerm.slice(0, separator));
  const term = normalized(stripQuotes(rawTerm.slice(separator + 1)));
  if (!term) return true;
  if (['file', 'name', 'title'].includes(field)) return normalized(page.title).includes(term);
  if (['path', 'folder'].includes(field)) return normalized(page.path ?? '').includes(term);
  if (['text', 'content'].includes(field)) return normalized(page.text ?? '').includes(term);
  if (field === 'tag') return (page.properties ?? []).some((property) => ['tag', 'tags'].includes(normalized(property.name)) && normalized(property.value).includes(term));
  if (field === 'property') {
    const equalsAt = term.indexOf('=');
    const propertyName = normalized(equalsAt < 0 ? term : term.slice(0, equalsAt));
    const propertyValue = equalsAt < 0 ? undefined : normalized(term.slice(equalsAt + 1));
    return (page.properties ?? []).some((property) => normalized(property.name) === propertyName && (propertyValue === undefined || normalized(property.value).includes(propertyValue)));
  }
  return false;
}

export function matchesGraphQuery(page: GraphPage, query: string): boolean {
  const alternatives = query.trim().split(/\s+\bOR\b\s+/i).filter(Boolean);
  if (!alternatives.length) return true;
  return alternatives.some((alternative) => queryTokens(alternative).every((term) => {
    const excluded = term.startsWith('-');
    const matches = matchesQueryTerm(page, excluded ? term.slice(1) : term);
    return excluded ? !matches : matches;
  }));
}

/**
 * The isolated-page rule: a page with no page link in either direction,
 * anywhere in the workspace, is unlinked. Unlinked pages are shown by default
 * as loose dots and the "Unlinked pages" switch hides them. A filter that hides
 * a page's only neighbour does not make that page unlinked.
 */
export function visibleGraph(graph: PageGraph, options: Readonly<{ filter: string; showUnlinked: boolean }>): Pick<PageGraph, 'links' | 'pages'> {
  const linked = new Set(graph.links.flatMap((link) => [link.sourceId, link.targetId]));
  const pages = graph.pages.filter((page) => matchesGraphQuery(page, options.filter) && (options.showUnlinked || linked.has(page.id)));
  const ids = new Set(pages.map((page) => page.id));
  return { pages, links: graph.links.filter((link) => ids.has(link.sourceId) && ids.has(link.targetId)) };
}

/** Below this zoom, labels would be too small to read and would overlap. */
export const LABEL_MIN_ZOOM = 0.7;

/**
 * A label shows when labels are on and the zoom is readable, or when the page
 * is a hub (large node), hovered, focused or next to the hovered page.
 */
export function labelVisible(options: Readonly<{ showLabels: boolean; zoom: number; radius: number; highlighted: boolean }>): boolean {
  if (options.highlighted) return true;
  if (!options.showLabels) return false;
  return options.zoom >= LABEL_MIN_ZOOM || options.radius * options.zoom >= 10;
}

export function nodeRadius(degree: number, contentWeight = 0): number {
  return Math.min(28, 6 + Math.sqrt(degree) * 2.5 + Math.log1p(contentWeight) * .65);
}
