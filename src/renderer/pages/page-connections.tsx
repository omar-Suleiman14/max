import { useWorkspaceDisplay } from './workspace-display-preferences';
import { useState } from 'react';
import { Waypoints } from 'lucide-react';
import { openPage, usePageGraph } from './page-graph-store';
import type { Locale } from '../app/i18n';
import './page-editor.css';

export function PageConnections({ pageId, locale }: { pageId: string; locale: Locale }) {
  const [graphEnabled] = useWorkspaceDisplay('graph');
  const { graph, error } = usePageGraph();
  const [showGraph, setShowGraph] = useState(false);
  const ar = locale === 'ar';
  const incoming = graph.links.filter((link) => link.targetId === pageId).map((link) => link.sourceId);
  const outgoing = graph.links.filter((link) => link.sourceId === pageId).map((link) => link.targetId);
  const linked = graph.pages.filter((p) => p.id !== pageId && (incoming.includes(p.id) || outgoing.includes(p.id))).slice(0, 12);
  const parent = graph.pages.find((p) => p.id === graph.pages.find((p) => p.id === pageId)?.parentNodeId);
  return <aside className="page-connections" aria-label={ar ? 'روابط الصفحة' : 'Page connections'}>
    {parent && <button type="button" onClick={() => openPage(parent.id)}>↰ {parent.title}</button>}
    <div className="page-connections-heading"><span>{ar ? 'روابط الصفحة' : 'Connections'}</span>{graphEnabled && <button type="button" aria-pressed={showGraph} onClick={() => setShowGraph(!showGraph)}><Waypoints size={15} />{ar ? 'خريطة' : 'Map'}</button>}</div>
    {error && <p role="status">{ar ? 'تعذر تحميل الروابط.' : 'Could not load page links.'}</p>}
    <details open={incoming.length > 0}><summary>{ar ? 'روابط إلى هذه الصفحة' : 'Backlinks'} <small>{incoming.length}</small></summary>
      {!incoming.length && <p>{ar ? 'اربط هذه الصفحة من صفحة أخرى لرؤيتها هنا.' : 'Link to this page from another page to see it here.'}</p>}
      {graph.pages.filter((p) => incoming.includes(p.id)).map((p) => <button type="button" key={p.id} onClick={() => openPage(p.id)}>↗ {p.title}</button>)}
    </details>
    <details><summary>{ar ? 'روابط من هذه الصفحة' : 'Outgoing links'} <small>{outgoing.length}</small></summary>{graph.pages.filter((p) => outgoing.includes(p.id)).map((p) => <button type="button" key={p.id} onClick={() => openPage(p.id)}>↗ {p.title}</button>)}</details>
    {graphEnabled && showGraph && <div className="page-local-graph" aria-label={ar ? 'خريطة الروابط المحلية' : 'Local page graph'}>
      <svg viewBox="0 0 600 300" aria-hidden="true" preserveAspectRatio="none">{linked.map((p, i) => <line key={p.id} x1="300" y1="150" x2={300 + Math.cos(i * Math.PI * 2 / linked.length) * 215} y2={150 + Math.sin(i * Math.PI * 2 / linked.length) * 105} />)}</svg>
      <span className="page-graph-node page-graph-current" style={{ left: '50%', top: '50%' }}>{graph.pages.find((p) => p.id === pageId)?.title}</span>
      {linked.map((p, i) => <button type="button" className="page-graph-node" key={p.id} style={{ left: `${50 + Math.cos(i * Math.PI * 2 / linked.length) * 35.83}%`, top: `${50 + Math.sin(i * Math.PI * 2 / linked.length) * 35}%` }} onClick={() => openPage(p.id)} title={p.title}>{p.title}</button>)}
      {!linked.length && <small>{ar ? 'أضف رابط صفحة لبدء الخريطة.' : 'Add a page link to start your map.'}</small>}
    </div>}
  </aside>;
}
