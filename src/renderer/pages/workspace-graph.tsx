import { useGraphState } from './graph-state';
import { Select } from '../ui/select';
import { SlidersHorizontal, X, Maximize2, Minus, Plus, Search, Waypoints, FileText, ArrowUpRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from 'd3-force';
import { openPage, usePageGraph } from './page-graph-store';
import type { PageGraph } from '../../shared/page-links';
import type { Locale } from '../app/i18n';
import './workspace-graph.css';

const graphColors = [
  ['default', 'Default', 'افتراضي'], ['gray', 'Gray', 'رمادي'], ['brown', 'Brown', 'بني'],
  ['orange', 'Orange', 'برتقالي'], ['yellow', 'Yellow', 'أصفر'], ['green', 'Green', 'أخضر'],
  ['blue', 'Blue', 'أزرق'], ['purple', 'Purple', 'بنفسجي'], ['pink', 'Pink', 'وردي'], ['red', 'Red', 'أحمر'],
] as const;

type GraphPage = PageGraph['pages'][number];
type GraphGroup = { id: string; match: string; color: string; field?: 'title' | 'path' | 'text' | 'property'; propertyName?: string };
type Node = SimulationNodeDatum & { id: string; title: string; page: GraphPage; radius: number };
type Edge = { source: Node; target: Node };

function normalized(value: string): string { return value.toLocaleLowerCase().trim(); }
function graphColor(color?: string): string {
  if (color?.startsWith('#')) return color;
  return color === 'default' || !color ? 'var(--muted)' : 'color-mix(in srgb, var(--option-' + color + '-text, var(--muted)) 65%, var(--muted))';
}
function iconColor(icon?: string | null): string | undefined {
  const match = icon?.match(/#([0-9a-f]{3,8})$/i);
  return match ? '#' + match[1] : undefined;
}
function groupMatches(page: GraphPage, group: GraphGroup): boolean {
  const match = normalized(group.match);
  if (!match) return false;
  if (group.field === 'path') return normalized(page.path ?? '').includes(match);
  if (group.field === 'text') return normalized(page.text ?? '').includes(match);
  if (group.field === 'property') return (page.properties ?? []).some((property) => normalized(property.name) === normalized(group.propertyName ?? '') && normalized(property.value).includes(match));
  return normalized(page.title).includes(match);
}
function queryTokens(value: string): readonly string[] { return value.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []; }
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
function matchesGraphQuery(page: GraphPage, query: string): boolean {
  const alternatives = query.trim().split(/\s+\bOR\b\s+/i).filter(Boolean);
  if (!alternatives.length) return true;
  return alternatives.some((alternative) => queryTokens(alternative).every((term) => {
    const excluded = term.startsWith('-');
    const matches = matchesQueryTerm(page, excluded ? term.slice(1) : term);
    return excluded ? !matches : matches;
  }));
}

export function WorkspaceGraph({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const { graph, error } = usePageGraph();
  const canvas = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [controlsOpen, setControlsOpen] = useGraphState('options', false);
  const [filter, setFilter] = useGraphState('filter', '');
  const [showUnlinked, setShowUnlinked] = useGraphState('unlinked', true);
  const [showLabels, setShowLabels] = useGraphState('labels', true);
  const [groups, setGroups] = useGraphState<GraphGroup[]>('groups', []);
  const [query, setQuery] = useGraphState('query', '');
  const [hover, setHover] = useState<string>();
  const [view, setView] = useGraphState('view', { x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  const drag = useRef<{ x: number; y: number; moved: boolean; node?: Node } | undefined>(undefined);
  const simulation = useRef<ReturnType<typeof forceSimulation<Node>> | undefined>(undefined);
  const ar = locale === 'ar';
  viewRef.current = view;

  const visibleGraph = useMemo(() => {
    const linked = new Set(graph.links.flatMap((link) => [link.sourceId, link.targetId]));
    const pages = graph.pages.filter((page) => matchesGraphQuery(page, filter) && (showUnlinked || linked.has(page.id)));
    const ids = new Set(pages.map((page) => page.id));
    return { pages, links: graph.links.filter((link) => ids.has(link.sourceId) && ids.has(link.targetId)) };
  }, [filter, graph, showUnlinked]);

  useEffect(() => {
    const degree = new Map<string, number>();
    visibleGraph.links.forEach((link) => {
      degree.set(link.sourceId, (degree.get(link.sourceId) ?? 0) + 1);
      degree.set(link.targetId, (degree.get(link.targetId) ?? 0) + 1);
    });
    const next: Node[] = visibleGraph.pages.map((page) => ({ id: page.id, page, title: page.title, radius: Math.min(28, 6 + Math.sqrt(degree.get(page.id) ?? 0) * 2.5 + Math.log1p(page.contentWeight ?? 0) * .65) }));
    const links = visibleGraph.links.map((link) => ({ source: link.sourceId, target: link.targetId }));
    const sim = forceSimulation(next)
      .force('link', forceLink<Node, { source: string | Node; target: string | Node }>(links).id((node) => node.id).distance(110))
      .force('charge', forceManyBody().strength(-240))
      .force('center', forceCenter())
      .force('collide', forceCollide<Node>((node) => node.radius + 18));
    simulation.current = sim;
    sim.on('tick', () => { setNodes([...next]); setEdges(links as unknown as Edge[]); });
    return () => { sim.stop(); };
  }, [visibleGraph]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const zoom = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const current = viewRef.current;
      const k = Math.max(.15, Math.min(5, current.k * Math.exp(-event.deltaY * .001)));
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      setView({ k, x: x - (x - current.x) * k / current.k, y: y - (y - current.y) * k / current.k });
    };
    element.addEventListener('wheel', zoom, { passive: false });
    return () => element.removeEventListener('wheel', zoom);
  }, [setView]);

  function fitView() {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect || !nodes.length) return;
    const xs = nodes.map((node) => node.x ?? 0);
    const ys = nodes.map((node) => node.y ?? 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const k = Math.max(.15, Math.min(1.5, (rect.width - 120) / (maxX - minX + 120), (rect.height - 100) / (maxY - minY + 100)));
    setView({ k, x: -(minX + maxX) / 2 * k, y: -(minY + maxY) / 2 * k });
  }
  function zoomBy(factor: number) {
    setView((current) => {
      const k = Math.max(.15, Math.min(5, current.k * factor));
      return { k, x: current.x * k / current.k, y: current.y * k / current.k };
    });
  }

  const connected = new Set([hover, ...visibleGraph.links.filter((link) => link.sourceId === hover || link.targetId === hover).flatMap((link) => [link.sourceId, link.targetId])]);
  const matches = nodes.filter((node) => normalized(node.title).includes(normalized(query)));

  return <section className="workspace-graph" aria-label={ar ? 'خريطة الصفحات' : 'Page graph'} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <header className="workspace-graph-toolbar">
      <div className="graph-heading"><Waypoints size={21} aria-hidden="true" /><div><h2>{ar ? 'خريطة الصفحات' : 'Page graph'}</h2><span>{nodes.length} {ar ? 'صفحة' : 'pages'} · {edges.length} {ar ? 'رابط' : 'links'}</span></div></div>
      <label className="graph-search"><Search size={16} aria-hidden="true" /><input autoFocus aria-label={ar ? 'بحث في الصفحات' : 'Find a page'} placeholder={ar ? 'بحث في الصفحات…' : 'Find a page…'} value={query} onFocus={() => setControlsOpen(false)} onChange={(event) => { setControlsOpen(false); setQuery(event.target.value); }} /></label>
      <button className="graph-options-button" type="button" aria-expanded={controlsOpen} aria-label={ar ? 'خيارات الخريطة' : 'Graph options'} onClick={() => setControlsOpen(!controlsOpen)}><SlidersHorizontal size={17} /></button>
    </header>

    {controlsOpen && <aside className="graph-options" aria-label={ar ? 'خيارات الخريطة' : 'Graph options'}>
      <div className="graph-options-heading"><strong>{ar ? 'خيارات الخريطة' : 'Graph options'}</strong><button type="button" aria-label={ar ? 'إغلاق الخيارات' : 'Close options'} onClick={() => setControlsOpen(false)}><X size={15} /></button></div>
      <label>{ar ? 'تصفية الصفحات' : 'Filter pages'}<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={'property:Status=Active  path:"Projects"  -tag:archived'} /></label>
      <p className="graph-filter-help">{ar ? 'استخدم AND أو OR أو - للاستبعاد. حقول متاحة: file، path، text، property، tag.' : 'Use AND, OR, or - to exclude. Fields: file, path, text, property, tag.'}</p>
      <div className="graph-option-toggle"><span>{ar ? 'صفحات بدون روابط' : 'Unlinked pages'}</span><button type="button" className="settings-switch" role="switch" aria-label={ar ? 'صفحات بدون روابط' : 'Unlinked pages'} aria-checked={showUnlinked} data-checked={showUnlinked} onClick={() => setShowUnlinked(!showUnlinked)}><span aria-hidden="true" /></button></div>
      <div className="graph-option-toggle"><span>{ar ? 'أسماء الصفحات' : 'Page labels'}</span><button type="button" className="settings-switch" role="switch" aria-label={ar ? 'أسماء الصفحات' : 'Page labels'} aria-checked={showLabels} data-checked={showLabels} onClick={() => setShowLabels(!showLabels)}><span aria-hidden="true" /></button></div>
      <div className="graph-options-heading"><strong>{ar ? 'مجموعات الألوان' : 'Color groups'}</strong><button type="button" aria-label={ar ? 'إضافة مجموعة' : 'Add color group'} onClick={() => setGroups([...groups, { id: crypto.randomUUID(), field: 'title', match: '', color: 'blue' }])}><Plus size={15} /></button></div>
      <p>{ar ? 'طابق الاسم أو المسار أو النص أو قيمة خاصية. المجموعات تتجاوز لون أيقونة الصفحة.' : 'Match a name, path, text, or property value. A group overrides the page icon color.'}</p>
      {groups.map((group) => <div className="graph-color-group" data-property={group.field === 'property'} key={group.id}>
        <Select className="graph-color-select" aria-label={ar ? 'مجال المجموعة' : 'Group field'} value={group.field ?? 'title'} onChange={(event) => setGroups(groups.map((item) => item.id === group.id ? { ...item, field: event.target.value as GraphGroup['field'] } : item))}>
          <option value="title">{ar ? 'اسم الصفحة' : 'Page name'}</option><option value="path">{ar ? 'المسار' : 'Path'}</option><option value="text">{ar ? 'محتوى الصفحة' : 'Page content'}</option><option value="property">{ar ? 'خاصية' : 'Property'}</option>
        </Select>
        {group.field === 'property' && <input aria-label={ar ? 'اسم الخاصية' : 'Property name'} placeholder={ar ? 'اسم الخاصية' : 'Property name'} value={group.propertyName ?? ''} onChange={(event) => setGroups(groups.map((item) => item.id === group.id ? { ...item, propertyName: event.target.value } : item))} />}
        <input aria-label={ar ? 'قيمة المطابقة' : 'Match value'} placeholder={ar ? 'يحتوي على…' : 'Contains…'} value={group.match} onChange={(event) => setGroups(groups.map((item) => item.id === group.id ? { ...item, match: event.target.value } : item))} />
        <Select className="graph-color-select" aria-label={ar ? 'لون المجموعة' : 'Group color'} value={group.color} onChange={(event) => setGroups(groups.map((item) => item.id === group.id ? { ...item, color: event.target.value } : item))}>{graphColors.map(([color, english, arabic]) => <option key={color} value={color}>{ar ? arabic : english}</option>)}</Select>
        <button type="button" aria-label={ar ? 'حذف المجموعة' : 'Remove group'} onClick={() => setGroups(groups.filter((item) => item.id !== group.id))}><X size={14} /></button>
      </div>)}
    </aside>}

    <svg ref={canvas} className="workspace-graph-canvas" aria-label={ar ? 'اسحب للتحريك ومرر للتكبير' : 'Drag to pan, scroll to zoom'} onPointerDown={(event) => { if (event.button !== 0) return; canvas.current?.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, moved: false }; }} onPointerMove={(event) => {
      const current = drag.current;
      if (!current) return;
      const dx = event.clientX - current.x, dy = event.clientY - current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true;
      if (current.node) {
        current.node.fx = (current.node.fx ?? current.node.x ?? 0) + dx / view.k;
        current.node.fy = (current.node.fy ?? current.node.y ?? 0) + dy / view.k;
        simulation.current?.alpha(.3).restart();
      } else setView((currentView) => ({ ...currentView, x: currentView.x + dx, y: currentView.y + dy }));
      current.x = event.clientX; current.y = event.clientY;
    }} onPointerUp={() => {
      const current = drag.current;
      if (current?.node) {
        current.node.fx = null; current.node.fy = null;
        if (!current.moved) openPage(current.node.id);
      }
      drag.current = undefined;
    }} onPointerCancel={() => {
      if (drag.current?.node) { drag.current.node.fx = null; drag.current.node.fy = null; }
      drag.current = undefined;
    }}>
      <svg x="50%" y="50%" overflow="visible"><g transform={'translate(' + view.x + ',' + view.y + ') scale(' + view.k + ')'}>
        {edges.map((edge, index) => <line key={index} x1={edge.source.x} y1={edge.source.y} x2={edge.target.x} y2={edge.target.y} className={hover && edge.source.id !== hover && edge.target.id !== hover ? 'is-dim' : ''} />)}
        {nodes.map((node) => {
          const group = groups.find((item) => groupMatches(node.page, item));
          const color = group?.color ?? iconColor(node.page.icon) ?? 'default';
          const dimmed = (hover && !connected.has(node.id)) || (query && !matches.includes(node));
          return <g style={{ fill: graphColor(color) }} key={node.id} role="button" tabIndex={0} aria-label={node.title} transform={'translate(' + (node.x ?? 0) + ',' + (node.y ?? 0) + ')'} className={'graph-dot ' + (hover === node.id ? 'is-active ' : '') + (dimmed ? 'is-dim' : '')} onMouseEnter={() => setHover(node.id)} onMouseLeave={() => setHover(undefined)} onFocus={() => setHover(node.id)} onBlur={() => setHover(undefined)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPage(node.id); } }} onPointerDown={(event) => { if (event.button !== 0) return; event.stopPropagation(); canvas.current?.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, moved: false, node }; node.fx = node.x; node.fy = node.y; }}>
            <circle className="graph-hit-target" r={Math.max(18, node.radius + 5)} /><circle className="graph-node-core" r={node.radius + (hover === node.id ? 2 : 0)} />{(showLabels || hover === node.id) && <text y={node.radius + 16} textAnchor="middle">{node.title.length > 30 ? node.title.slice(0, 29) + '…' : node.title}</text>}<title>{node.page.path ? node.title + ' · ' + node.page.path : node.title}</title>
          </g>;
        })}
      </g></svg>
    </svg>

    {query && !controlsOpen && <div className="graph-search-results">{matches.map((node) => <button key={node.id} type="button" onClick={() => openPage(node.id)}><FileText size={15} /><span>{node.title}</span><ArrowUpRight size={14} /></button>)}{!matches.length && <span>{ar ? 'لا توجد نتائج' : 'No matching pages'}</span>}</div>}
    {error && <p className="graph-notice" role="alert">{ar ? 'تعذر تحميل الروابط.' : 'Could not load page links.'}</p>}
    {!error && !nodes.length && <p className="graph-notice">{ar ? 'أنشئ صفحة للبدء.' : (graph.pages.length ? 'No pages match these filters.' : 'Create a page to start your graph.')}</p>}
    <footer><span>{ar ? 'اسحب للتحريك · مرر للتكبير · انقر لفتح صفحة' : 'Drag to pan · Scroll to zoom · Click a page to open'}</span><div className="graph-zoom-controls"><button type="button" aria-label={ar ? 'تصغير' : 'Zoom out'} onClick={() => zoomBy(1 / 1.2)}><Minus size={16} /></button><output>{Math.round(view.k * 100)}%</output><button type="button" aria-label={ar ? 'تكبير' : 'Zoom in'} onClick={() => zoomBy(1.2)}><Plus size={16} /></button><button type="button" title={ar ? 'إظهار كل الصفحات' : 'Fit all pages'} aria-label={ar ? 'إظهار كل الصفحات' : 'Fit all pages'} onClick={fitView}><Maximize2 size={16} /></button></div></footer>
  </section>;
}
