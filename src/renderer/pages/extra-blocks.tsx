import { useState } from 'react';
import { ExternalLink, FileText, Link2 } from 'lucide-react';
import type { NotionBlock } from '../editor/page-blocks';
import type { Locale } from '../app/i18n';
import { safeWebUrl } from '../../shared/page-links';
import { openPage, usePageGraph } from './page-graph-store';
import { PageIconRenderer } from '../ui/page-icon-renderer';

function PageLinkBlock({ block, locale, onChange }: { block: NotionBlock; locale: Locale; onChange: (patch: Partial<NotionBlock>) => void }) {
  const { graph, error } = usePageGraph();
  const [query, setQuery] = useState('');
  const [choosing, setChoosing] = useState(!block.pageId);
  const page = graph.pages.find((p) => p.id === block.pageId);
  const ar = locale === 'ar';
  return <div className="page-link-block">
    {!choosing ? <div className="page-link-row"><button type="button" disabled={!page} onClick={() => page && openPage(page.id)}><PageIconRenderer icon={page?.icon ?? 'lucide:FileText'} size={18} /><span>{page?.title ?? (ar ? 'صفحة غير متاحة' : 'Page unavailable')}</span></button><button type="button" onClick={() => setChoosing(true)} aria-label={ar ? 'تغيير الصفحة' : 'Change linked page'}><Link2 size={15} /></button></div> : <div className="page-link-picker">
      <input autoFocus aria-label={ar ? 'بحث عن صفحة' : 'Find a page'} placeholder={ar ? 'بحث عن صفحة…' : 'Search pages…'} value={query} onChange={(event) => setQuery(event.target.value)} />
      <div role="list" className="page-link-results">{graph.pages.filter((p) => p.title.toLowerCase().includes(query.toLowerCase())).map((p) => <button type="button" key={p.id} onClick={() => { onChange({ pageId: p.id, content: '' }); setChoosing(false); }}><PageIconRenderer icon={p.icon ?? 'lucide:FileText'} size={16} />{p.title}</button>)}</div>
      {error && <p role="alert">{ar ? 'تعذر تحميل الصفحات.' : 'Could not load pages.'}</p>}
      {!graph.pages.some((p) => p.title.toLowerCase().includes(query.toLowerCase())) && <p>{ar ? 'لا توجد صفحات مطابقة.' : 'No matching pages.'}</p>}
    </div>}
  </div>;
}

/** Page link, embed and bookmark blocks, rendered inside the BlockNote editor. */
export function ExtraBlock({ block, locale, onChange }: { block: NotionBlock; locale: Locale; onChange: (patch: Partial<NotionBlock>) => void }) {
  const ar = locale === 'ar';
  const [url, setUrl] = useState(block.url ?? '');
  const [editing, setEditing] = useState(!block.url);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  if (block.type === 'page-link') return <PageLinkBlock block={block} locale={locale} onChange={onChange} />;
  const savedUrl = safeWebUrl(block.url ?? '');
  const open = () => { if (savedUrl) void window.maxApi.workspace.openExternal(savedUrl).then((result) => { if (!result.ok) setError(result.error.message); }).catch(() => setError(ar ? 'تعذر فتح الرابط.' : 'Could not open link.')); };
  return <figure className="page-media-block">
    {editing && ['image', 'file'].includes(block.type) && <label className="page-upload-control">{ar ? 'رفع ملف' : 'Upload file'}<input type="file"  onChange={event => {
      const file = event.target.files?.[0]; if (!file) return;
      void file.arrayBuffer().then(bytes => window.maxApi.assets.importAttachment(new Uint8Array(bytes), file.name)).then(result => { if (result.ok) onChange({ url: result.value.url, caption: file.name }); else setError(result.error.message); }).catch(error => setError(String(error)));
    }}/></label>}
    {editing || !savedUrl ? <form className="page-url-form" onSubmit={(event) => { event.preventDefault(); const next = safeWebUrl(url); if (!next) { setError(ar ? 'أدخل رابط HTTP أو HTTPS صالحاً.' : 'Enter a valid HTTP or HTTPS URL.'); return; } onChange({ url: next, content: '' }); setEditing(false); setLoaded(false); setError(''); }}><Link2 size={18} /><input autoFocus type="url" required aria-label={ar ? 'رابط المحتوى' : 'Content URL'} placeholder="https://…" value={url} onChange={(event) => setUrl(event.target.value)} /><button type="submit">{ar ? 'إدراج' : 'Insert'}</button></form> : <>
      {['bookmark', 'file'].includes(block.type) ? <button type="button" className="page-bookmark" onClick={open}><FileText size={24} /><span><strong>{block.caption || new URL(savedUrl).hostname}</strong><small>{savedUrl}</small></span><ExternalLink size={16} /></button> : !loaded ? <button type="button" className="page-media-placeholder" onClick={() => setLoaded(true)}>{ar ? 'تحميل المحتوى الخارجي' : `Load ${block.type}`}<small>{new URL(savedUrl).hostname} · {ar ? 'يتطلب اتصالاً بالإنترنت' : 'Requires internet'}</small></button> : block.type === 'video' ? <video src={savedUrl} controls preload="metadata" onError={() => setError(ar ? 'استخدم رابط فيديو مباشر أو كتلة تضمين.' : 'Use a direct video URL or an Embed block.')} /> : block.type === 'audio' ? <audio src={savedUrl} controls preload="metadata" onError={() => setError(ar ? 'تعذر تحميل الصوت.' : 'Could not load audio.')} /> : <iframe title={block.caption || (ar ? 'محتوى مضمن' : 'Embedded content')} src={savedUrl} sandbox="allow-scripts allow-presentation" referrerPolicy="no-referrer" allowFullScreen />}
      <div className="extra-block-actions"><input aria-label={ar ? 'تعليق' : 'Caption'} placeholder={ar ? 'إضافة تعليق…' : 'Add a caption…'} value={block.caption ?? ''} onChange={(event) => onChange({ caption: event.target.value })} /><button type="button" onClick={() => { setUrl(block.url ?? ''); setEditing(true); }}>{ar ? 'تعديل الرابط' : 'Edit URL'}</button><button type="button" onClick={open} aria-label={ar ? 'فتح في المتصفح' : 'Open in browser'}><ExternalLink size={14} /></button></div>
      {block.type === 'embed' && <small>{ar ? 'إذا منع الموقع التضمين، افتحه في المتصفح.' : 'If this site blocks embedding, open it in your browser.'}</small>}
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </figure>;
}
