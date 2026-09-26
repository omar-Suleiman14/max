import { forgetTransientGraphState, useGraphState } from './graph-state';
import { Select } from '../ui/select';
import { SlidersHorizontal, X, Maximize2, Minus, Plus, Search, Waypoints, FileText, ArrowUpRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from 'd3-force';
import { openPage, usePageGraph } from './page-graph-store';
import { graphColor, labelVisible, nodeColor, nodeRadius, normalized, visibleGraph as filterGraph, type GraphGroup, type GraphPage } from './graph-model';
import type { Locale } from '../app/i18n';
import './workspace-graph.css';

const graphColors = [
  ['default', 'Default', 'افتراضي'], ['gray', 'Gray', 'رمادي'], ['brown', 'Brown', 'بني'],
  ['orange', 'Orange', 'برتقالي'], ['yellow', 'Yellow', 'أصفر'], ['green', 'Green', 'أخضر'],
  ['blue', 'Blue', 'أزرق'], ['purple', 'Purple', 'بنفسجي'], ['pink', 'Pink', 'وردي'], ['red', 'Red', 'أحمر'],
] as const;

type Node = SimulationNodeDatum & { id: string; title: string; page: GraphPage; radius: number };
type Edge = { source: Node; target: Node };

/** Layout time spent before the first paint, so a large graph opens settled. */
const PRESETTLE_MS = 200;

export function WorkspaceGraph({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const { graph, error } = usePageGraph();
  const canvas = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [filter, setFilter] = useGraphState('filter', '');
  const [showUnlinked, setShowUnlinked] = useGraphState('unlinked', true);
  const [showLabels, setShowLabels] = useGraphState('labels', true);
  const [groups, setGroups] = useGraphState<GraphGroup[]>('groups', []);
  // Finding a page and the camera are per visit; the settings above are kept.
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState<string>();
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const fitted = useRef(false);
  const viewRef = useRef(view);
  const drag = useRef<{ x: number; y: number; moved: boolean; node?: Node } | undefined>(undefined);
  const simulation = useRef<ReturnType<typeof forceSimulation<Node>> | undefined>(undefined);
  const ar = locale === 'ar';
  viewRef.current = view;

  const visibleGraph = useMemo(() => filterGraph(graph, { filter, showUnlinked }), [filter, graph, showUnlinked]);

  useEffect(() => {
    const degree = new Map<string, number>();
    visibleGraph.links.forEach((link) => {
      degree.set(link.sourceId, (degree.get(link.sourceId) ?? 0) + 1);
      degree.set(link.targetId, (degree.get(link.targetId) ?? 0) + 1);
    });
    const next: Node[] = visibleGraph.pages.map((page) => ({ id: page.id, page, title: page.title, radius: nodeRadius(degree.get(page.id) ?? 0, page.contentWeight) }));
    const links = visibleGraph.links.map((link) => ({ source: link.sourceId, target: link.targetId }));
    const sim = forceSimulation(next)
      .force('link', forceLink<Node, { source: string | Node; target: string | Node }>(links).id((node) => node.id).distance(110))
      .force('charge', forceManyBody().strength(-240))
      .force('center', forceCenter())
      .force('collide', forceCollide<Node>((node) => node.radius + 18));
    simulation.current = sim;
    // Settle most of the layout before the first paint, then animate the rest
    // at most once per frame rather than once per simulation tick.
    sim.stop();
    const started = performance.now();
    for (let tick = 0; tick < 300 && sim.alpha() > .05 && performance.now() - started < PRESETTLE_MS; tick += 1) sim.tick();
    let frame = 0;
    const paint = () => { frame = 0; setNodes([...next]); setEdges(links as unknown as Edge[]); };
    paint();
    sim.on('tick', () => { frame ||= requestAnimationFrame(paint); });
    sim.restart();
    return () => { sim.stop(); cancelAnimationFrame(frame); };
  }, [visibleGraph]);

  useEffect(forgetTransientGraphState, []);

  // Escape closes the map wherever the focus sits, including the canvas, which
  // takes no focus of its own after a drag.
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      // A dialog opened over the map, such as search, answers Escape first.
      if (event.key !== 'Escape' || document.querySelector('[role=dialog]')) return;
      onClose();
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);

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
  // The first layout is framed to fit; after that the camera is the reader's.
  useEffect(() => { if (!fitted.current && nodes.length) { fitted.current = true; fitView(); } });

  function zoomBy(factor: number) {
    setView((current) => {
      const k = Math.max(.15, Math.min(5, current.k * factor));
      return { k, x: current.x * k / current.k, y: current.y * k / current.k };
    });
  }

  const connected = new Set([hover, ...visibleGraph.links.filter((link) => link.sourceId === hover || link.targetId === hover).flatMap((link) => [link.sourceId, link.targetId])]);
  const matches = nodes.filter((node) => normalized(node.title).includes(normalized(query)));

  return <section className="workspace-graph" aria-label={ar ? 'خريطة الصفحات' : 'Page graph'} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1.2); }
    else if (event.key === '-') { event.preventDefault(); zoomBy(1 / 1.2); }
    else if (event.key === '0') { event.preventDefault(); fitView(); }
  }}>
    <header className="workspace-graph-toolbar">
      <div className="graph-heading"><Waypoints size={21} aria-hidden="true" /><div><h2>{ar ? 'خريطة الصفحات' : 'Page graph'}</h2><span>{nodes.length} {ar ? 'صفحة' : 'pages'} · {edges.length} {ar ? 'رابط' : 'links'}</span></div></div>
      <label className="graph-search"><Search size={16} aria-hidden="true" /><input autoFocus aria-label={ar ? 'بحث في الصفحات' : 'Find a page'} placeholder={ar ? 'بحث في الصفحات…' : 'Find a page…'} value={query} onFocus={() => setControlsOpen(false)} onChange={(event) => { setControlsOpen(false); setQuery(event.target.value); }} /></label>
      <button className="graph-options-button" type="button" aria-expanded={controlsOpen} aria-label={ar ? 'خيارات الخريطة' : 'Graph options'} onClick={() => setControlsOpen(!controlsOpen)}><SlidersHorizontal size={17} /></button>
      <button className="graph-back" type="button" onClick={onClose}><X size={16} aria-hidden="true" />{ar ? 'إغلاق' : 'Close'}<kbd>Esc</kbd></button>
    </header>

    {controlsOpen && <aside className="graph-options" aria-label={ar ? 'خيارات الخريطة' : 'Graph options'}>
      <div className="graph-options-heading"><strong>{ar ? 'خيارات الخريطة' : 'Graph options'}</strong><button type="button" aria-label={ar ? 'إغلاق الخيارات' : 'Close options'} onClick={() => setControlsOpen(false)}><X size={15} /></button></div>
      <label>{ar ? 'تصفية الصفحات' : 'Filter pages'}<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={'property:Status=Active  path:"Projects"  -tag:archived'} /></label>
      <p className="graph-filter-help">{ar ? 'استخدم AND أو OR أو - للاستبعاد. حقول متاحة: file، path، text، property، tag.' : 'Use AND, OR, or - to exclude. Fields: file, path, text, property, tag.'}</p>
      <div className="graph-option-toggle"><span>{ar ? 'صفحات بدون روابط' : 'Unlinked pages'}</span><button type="button" className="settings-switch" role="switch" aria-label={ar ? 'صفحات بدون روابط' : 'Unlinked pages'} aria-checked={showUnlinked} data-checked={showUnlinked} onClick={() => setShowUnlinked(!showUnlinked)}><span aria-hidden="true" /></button></div>
      <p className="graph-filter-help">{ar ? 'صفحات لا تربطها أي صفحة ولا تربط أي صفحة.' : 'Pages with no page links in or out.'}</p>
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
          const color = nodeColor(node.page, groups);
          const dimmed = (hover && !connected.has(node.id)) || (query && !matches.includes(node));
          return <g style={{ fill: graphColor(color) }} key={node.id} role="button" tabIndex={0} aria-label={node.title} transform={'translate(' + (node.x ?? 0) + ',' + (node.y ?? 0) + ')'} className={'graph-dot ' + (hover === node.id ? 'is-active ' : '') + (dimmed ? 'is-dim' : '')} onMouseEnter={() => setHover(node.id)} onMouseLeave={() => setHover(undefined)} onFocus={() => setHover(node.id)} onBlur={() => setHover(undefined)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPage(node.id); } }} onPointerDown={(event) => { if (event.button !== 0) return; event.stopPropagation(); canvas.current?.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, moved: false, node }; node.fx = node.x; node.fy = node.y; }}>
            <circle className="graph-hit-target" r={Math.max(18, node.radius + 5)} /><circle className="graph-node-core" r={node.radius + (hover === node.id ? 2 : 0)} />{labelVisible({ highlighted: Boolean(hover) && connected.has(node.id), radius: node.radius, showLabels, zoom: view.k }) && <text y={node.radius + 16} textAnchor="middle">{node.title.length > 30 ? node.title.slice(0, 29) + '…' : node.title}</text>}<title>{node.page.path ? node.title + ' · ' + node.page.path : node.title}</title>
          </g>;
        })}
      </g></svg>
    </svg>

    {query && !controlsOpen && <div className="graph-search-results">{matches.map((node) => <button key={node.id} type="button" onClick={() => openPage(node.id)}><FileText size={15} /><span>{node.title}</span><ArrowUpRight size={14} /></button>)}{!matches.length && <span>{ar ? 'لا توجد نتائج' : 'No matching pages'}</span>}</div>}
    {error && <p className="graph-notice" role="alert">{ar ? 'تعذر تحميل الروابط.' : 'Could not load page links.'}</p>}
    {!error && !nodes.length && <p className="graph-notice">{graph.pages.length ? (ar ? 'لا توجد صفحات تطابق هذه التصفية.' : 'No pages match these filters.') : (ar ? 'أنشئ صفحة لبدء الخريطة.' : 'Create a page to start your graph.')}</p>}
    <footer><span>{ar ? 'اسحب للتحريك، مرر أو اضغط + و - للتكبير، 0 لإظهار الكل، Enter لفتح صفحة' : 'Drag to pan, scroll or press + and - to zoom, 0 to fit, Enter to open a page'}</span><div className="graph-zoom-controls"><button type="button" aria-label={ar ? 'تصغير' : 'Zoom out'} onClick={() => zoomBy(1 / 1.2)}><Minus size={16} /></button><output>{Math.round(view.k * 100)}%</output><button type="button" aria-label={ar ? 'تكبير' : 'Zoom in'} onClick={() => zoomBy(1.2)}><Plus size={16} /></button><button type="button" title={ar ? 'إظهار كل الصفحات' : 'Fit all pages'} aria-label={ar ? 'إظهار كل الصفحات' : 'Fit all pages'} onClick={fitView}><Maximize2 size={16} /></button></div></footer>
  </section>;
}
