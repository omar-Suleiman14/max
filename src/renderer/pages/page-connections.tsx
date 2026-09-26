import { useWorkspaceDisplay } from './workspace-display-preferences';
import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, FileX, Waypoints } from 'lucide-react';
import { openPage, usePageGraph } from './page-graph-store';
import type { Locale } from '../app/i18n';
import './page-editor.css';

/**
 * Page links are the links written inside pages. Database relations are a
 * separate system set on records, so this panel only ever says "page links".
 */
export function PageConnections({ pageId, locale }: { pageId: string; locale: Locale }) {
  const [graphEnabled] = useWorkspaceDisplay('graph');
  const { graph, error } = usePageGraph();
  const [showGraph, setShowGraph] = useState(false);
  const ar = locale === 'ar';
  const incoming = new Set(graph.links.filter((link) => link.targetId === pageId).map((link) => link.sourceId));
  const outgoing = new Set(graph.links.filter((link) => link.sourceId === pageId).map((link) => link.targetId));
  const broken = (graph.brokenLinks ?? []).filter((link) => link.sourceId === pageId);
  const incomingPages = graph.pages.filter((p) => p.id !== pageId && incoming.has(p.id));
  const outgoingPages = graph.pages.filter((p) => p.id !== pageId && outgoing.has(p.id));
  const linked = graph.pages.filter((p) => p.id !== pageId && (incoming.has(p.id) || outgoing.has(p.id))).slice(0, 12);
  const parent = graph.pages.find((p) => p.id === graph.pages.find((p) => p.id === pageId)?.parentNodeId);
  const outgoingCount = outgoingPages.length + broken.length;
  return <aside className="page-connections" aria-label={ar ? 'روابط الصفحة' : 'Page links'}>
    {parent && <button type="button" onClick={() => openPage(parent.id)}>↰ {parent.title}</button>}
    <div className="page-connections-heading"><span>{ar ? 'روابط الصفحة' : 'Page links'}</span>{graphEnabled && <button type="button" aria-pressed={showGraph} onClick={() => setShowGraph(!showGraph)}><Waypoints size={15} />{ar ? 'خريطة' : 'Map'}</button>}</div>
    {error && <p role="status">{ar ? 'تعذر تحميل الروابط.' : 'Could not load page links.'}</p>}
    <details open={incomingPages.length > 0}><summary>{ar ? 'مرتبطة من' : 'Linked from'} <small>{incomingPages.length}</small></summary>
      {!incomingPages.length && <p>{ar ? 'اربط هذه الصفحة من صفحة أخرى لرؤيتها هنا.' : 'Link to this page from another page to see it here.'}</p>}
      {incomingPages.map((p) => <button type="button" key={p.id} onClick={() => openPage(p.id)}><ArrowDownLeft aria-hidden="true" size={14} />{p.title}</button>)}
    </details>
    <details open={broken.length > 0}><summary>{ar ? 'روابط إلى' : 'Links to'} <small>{outgoingCount}</small></summary>
      {!outgoingCount && <p>{ar ? 'اكتب @ أو / في الصفحة لربط صفحة أخرى.' : 'Type @ or / on the page to link another page.'}</p>}
      {outgoingPages.map((p) => <button type="button" key={p.id} onClick={() => openPage(p.id)}><ArrowUpRight aria-hidden="true" size={14} />{p.title}</button>)}
      {broken.map((link) => <span className="page-connection-broken" data-state={link.state} key={link.targetId}>
        <FileX aria-hidden="true" size={14} />
        {link.state === 'archived'
          ? <><s>{link.title || (ar ? 'صفحة' : 'Page')}</s><small>{ar ? 'في سلة المهملات' : 'In Trash'}</small></>
          : <><s>{ar ? 'صفحة محذوفة' : 'Deleted page'}</s><small>{ar ? 'لم تعد موجودة' : 'No longer exists'}</small></>}
      </span>)}
    </details>
    {graphEnabled && showGraph && <div className="page-local-graph" aria-label={ar ? 'خريطة الروابط المحلية' : 'Local page graph'}>
      <svg viewBox="0 0 600 300" aria-hidden="true" preserveAspectRatio="none">{linked.map((p, i) => <line key={p.id} x1="300" y1="150" x2={300 + Math.cos(i * Math.PI * 2 / linked.length) * 215} y2={150 + Math.sin(i * Math.PI * 2 / linked.length) * 105} />)}</svg>
      <span className="page-graph-node page-graph-current" style={{ left: '50%', top: '50%' }}>{graph.pages.find((p) => p.id === pageId)?.title}</span>
      {linked.map((p, i) => <button type="button" className="page-graph-node" key={p.id} style={{ left: `${50 + Math.cos(i * Math.PI * 2 / linked.length) * 35.83}%`, top: `${50 + Math.sin(i * Math.PI * 2 / linked.length) * 35}%` }} onClick={() => openPage(p.id)} title={p.title}>{p.title}</button>)}
      {!linked.length && <small>{ar ? 'أضف رابط صفحة لبدء الخريطة.' : 'Add a page link to start your map.'}</small>}
    </div>}
  </aside>;
}
