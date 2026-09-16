import { useRef, useState } from 'react';
import { ExternalLink, FileText, Link2, Plus, X } from 'lucide-react';
import type { NotionBlock } from '../ui/notion-block-editor';
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

const MIN_IMAGE_WIDTH = 80;
const IMAGE_KEYBOARD_STEP = 24;
const IMAGE_CORNERS = ['nw', 'ne', 'sw', 'se'] as const;

/**
 * An image that can be resized by dragging any of its four corners.
 *
 * Only the width is stored. Height stays `auto`, so the aspect ratio is kept by
 * construction rather than by arithmetic that can drift. The corner sitting on
 * the visual leading edge is worked out from live geometry instead of from the
 * corner's name, so the gesture behaves the same in a right-to-left workspace.
 */
function ResizableImage({ alt, ar, onError, onResize, src, width }: Readonly<{
  alt: string;
  ar: boolean;
  onError?: () => void;
  onResize: (width: number | undefined) => void;
  src: string;
  width?: number;
}>) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<number>();
  const shown = draft ?? width;

  function widest() {
    const available = frameRef.current?.parentElement?.getBoundingClientRect().width ?? 0;
    return Math.max(MIN_IMAGE_WIDTH, Math.round(available) || MIN_IMAGE_WIDTH);
  }

  function clamp(value: number) {
    return Math.min(widest(), Math.max(MIN_IMAGE_WIDTH, Math.round(value)));
  }

  function nudge(delta: number) {
    const frame = frameRef.current;
    if (frame) onResize(clamp(frame.getBoundingClientRect().width + delta));
  }

  function startResize(event: React.PointerEvent<HTMLButtonElement>) {
    const frame = frameRef.current;
    if (!frame || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const frameBox = frame.getBoundingClientRect();
    const handleBox = handle.getBoundingClientRect();
    const towardsPointer = handleBox.left + handleBox.width / 2 < frameBox.left + frameBox.width / 2 ? -1 : 1;
    const startX = event.clientX;
    const startWidth = frameBox.width;
    let latest = startWidth;

    const move = (moveEvent: PointerEvent) => {
      latest = clamp(startWidth + (moveEvent.clientX - startX) * towardsPointer);
      setDraft(latest);
    };
    const finish = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
      setDraft(undefined);
      onResize(Math.round(latest));
    };

    handle.setPointerCapture(event.pointerId);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }

  return <div className="page-image-frame" data-resized={shown !== undefined} ref={frameRef} style={shown === undefined ? undefined : { width: `${shown}px` }}>
    <img alt={alt} onError={onError} src={src} />
    {IMAGE_CORNERS.map((corner) => <button
      aria-label={ar ? 'تغيير حجم الصورة' : 'Resize image'}
      className="page-image-handle"
      data-corner={corner}
      key={corner}
      onKeyDown={(event) => {
        if (['ArrowRight', 'ArrowUp'].includes(event.key)) { event.preventDefault(); nudge(IMAGE_KEYBOARD_STEP); }
        else if (['ArrowLeft', 'ArrowDown'].includes(event.key)) { event.preventDefault(); nudge(-IMAGE_KEYBOARD_STEP); }
        else if (event.key === 'Home') { event.preventDefault(); onResize(undefined); }
      }}
      onPointerDown={startResize}
      title={ar ? 'اسحب لتغيير الحجم · الأسهم للضبط · Home للحجم الأصلي' : 'Drag to resize · Arrow keys to adjust · Home for the original size'}
      type="button"
    />)}
  </div>;
}

export function ExtraBlock({ block, blocks, locale, onChange }: { block: NotionBlock; blocks: readonly NotionBlock[]; locale: Locale; onChange: (patch: Partial<NotionBlock>) => void }) {
  const ar = locale === 'ar';
  const [url, setUrl] = useState(block.url ?? '');
  const [editing, setEditing] = useState(!block.url);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const localImage = /^max:\/\/asset\/[0-9a-f]{64}\.(png|jpg|gif|webp)$/.test(block.url ?? '');
  const localFile = /^max:\/\/attachment\/[0-9a-f]{64}\.[a-z0-9]{1,10}$/.test(block.url ?? '');
  if (localImage || localFile) return <figure className="page-media-block">
    {localImage ? <ResizableImage alt={block.caption || ''} ar={ar} onResize={(width) => onChange({ width })} src={location.protocol.startsWith('http') ? block.url!.replace('max://asset/', '/__max/asset/') : block.url!} width={block.width} /> : <button className="page-bookmark" type="button" onClick={() => { void window.maxApi.assets.openAttachment(block.url!).then(result => { if (!result.ok) setError(result.error.message); }); }}><FileText size={24}/><span>{block.caption || (ar ? 'ملف مرفق' : 'Attachment')}</span><ExternalLink size={16}/></button>}
    <figcaption>{block.caption}</figcaption>{error && <p role="alert">{error}</p>}
  </figure>;
  if (block.type === 'page-link') return <PageLinkBlock block={block} locale={locale} onChange={onChange} />;
  if (block.type === 'table-of-contents') {
    const headings = blocks.filter((b) => ['h1', 'h2', 'h3'].includes(b.type));
    return <nav className="page-toc" aria-label={ar ? 'محتويات الصفحة' : 'Table of contents'}>{headings.length ? headings.map((heading) => <button type="button" key={heading.id} style={{ paddingInlineStart: `${(Number(heading.type.slice(1)) - 1) * 14 + 8}px` }} onClick={(event) => { const root = event.currentTarget.closest('.notion-editor-canvas'); const target = [...(root?.querySelectorAll<HTMLElement>('[data-block-id]') ?? [])].find((element) => element.dataset.blockId === heading.id); target?.scrollIntoView({ behavior: 'smooth', block: 'start' }); target?.querySelector<HTMLElement>('input,[contenteditable]')?.focus({ preventScroll: true }); }}>{heading.content || (ar ? 'عنوان' : 'Heading')}</button>) : <p>{ar ? 'أضف عناوين لتظهر هنا.' : 'Add headings to build a table of contents.'}</p>}</nav>;
  }
  if (block.type === 'simple-table') {
    const cells = block.cells ?? [['', ''], ['', '']];
    return <div className="page-simple-table"><table><thead><tr>{cells[0]?.map((_, column) => <th key={column}><button type="button" disabled={(cells[0]?.length ?? 0) <= 1} aria-label={ar ? `حذف العمود ${column + 1}` : `Remove column ${column + 1}`} onClick={() => onChange({ cells: cells.map((row) => row.filter((_, c) => c !== column)) })}><X size={12} /></button></th>)}</tr></thead><tbody>{cells.map((row, r) => <tr key={r}>{row.map((value, c) => <td key={c}><input aria-label={ar ? `صف ${r + 1} عمود ${c + 1}` : `Row ${r + 1}, column ${c + 1}`} value={value} onChange={(event) => onChange({ cells: cells.map((row, ri) => ri === r ? row.map((cell, ci) => ci === c ? event.target.value : cell) : row) })} /></td>)}<td><button type="button" disabled={cells.length <= 1} aria-label={ar ? 'حذف الصف' : 'Remove row'} onClick={() => onChange({ cells: cells.filter((_, ri) => ri !== r) })}><X size={12} /></button></td></tr>)}</tbody></table><div className="extra-block-actions"><button type="button" disabled={cells.length >= 100} onClick={() => onChange({ cells: [...cells, (cells[0] ?? ['']).map(() => '')] })}><Plus size={14} />{ar ? 'صف' : 'Row'}</button><button type="button" disabled={(cells[0]?.length ?? 0) >= 20} onClick={() => onChange({ cells: cells.map((row) => [...row, '']) })}><Plus size={14} />{ar ? 'عمود' : 'Column'}</button></div></div>;
  }
  const savedUrl = safeWebUrl(block.url ?? '');
  const open = () => { if (savedUrl) void window.maxApi.workspace.openExternal(savedUrl).then((result) => { if (!result.ok) setError(result.error.message); }).catch(() => setError(ar ? 'تعذر فتح الرابط.' : 'Could not open link.')); };
  return <figure className="page-media-block">
    {editing && ['image', 'file'].includes(block.type) && <label className="page-upload-control">{ar ? 'رفع ملف' : 'Upload file'}<input type="file" accept={block.type === 'image' ? 'image/png,image/jpeg,image/gif,image/webp' : undefined} onChange={event => {
      const file = event.target.files?.[0]; if (!file) return;
      void file.arrayBuffer().then(bytes => block.type === 'image' ? window.maxApi.assets.importImage(new Uint8Array(bytes), file.name) : window.maxApi.assets.importAttachment(new Uint8Array(bytes), file.name)).then(result => { if (result.ok) onChange({ url: result.value.url, caption: file.name }); else setError(result.error.message); }).catch(error => setError(String(error)));
    }}/></label>}
    {editing || !savedUrl ? <form className="page-url-form" onSubmit={(event) => { event.preventDefault(); const next = safeWebUrl(url); if (!next) { setError(ar ? 'أدخل رابط HTTP أو HTTPS صالحاً.' : 'Enter a valid HTTP or HTTPS URL.'); return; } onChange({ url: next, content: '' }); setEditing(false); setLoaded(false); setError(''); }}><Link2 size={18} /><input autoFocus type="url" required aria-label={ar ? 'رابط المحتوى' : 'Content URL'} placeholder="https://…" value={url} onChange={(event) => setUrl(event.target.value)} /><button type="submit">{ar ? 'إدراج' : 'Insert'}</button></form> : <>
      {['bookmark', 'file'].includes(block.type) ? <button type="button" className="page-bookmark" onClick={open}><FileText size={24} /><span><strong>{block.caption || new URL(savedUrl).hostname}</strong><small>{savedUrl}</small></span><ExternalLink size={16} /></button> : !loaded ? <button type="button" className="page-media-placeholder" onClick={() => setLoaded(true)}>{ar ? 'تحميل المحتوى الخارجي' : `Load ${block.type}`}<small>{new URL(savedUrl).hostname} · {ar ? 'يتطلب اتصالاً بالإنترنت' : 'Requires internet'}</small></button> : block.type === 'image' ? <ResizableImage alt={block.caption ?? ''} ar={ar} onError={() => setError(ar ? 'تعذر تحميل الصورة.' : 'Could not load this image.')} onResize={(width) => onChange({ width })} src={savedUrl} width={block.width} /> : block.type === 'video' ? <video src={savedUrl} controls preload="metadata" onError={() => setError(ar ? 'استخدم رابط فيديو مباشر أو كتلة تضمين.' : 'Use a direct video URL or an Embed block.')} /> : block.type === 'audio' ? <audio src={savedUrl} controls preload="metadata" onError={() => setError(ar ? 'تعذر تحميل الصوت.' : 'Could not load audio.')} /> : <iframe title={block.caption || (ar ? 'محتوى مضمن' : 'Embedded content')} src={savedUrl} sandbox="allow-scripts allow-presentation" referrerPolicy="no-referrer" allowFullScreen />}
      <div className="extra-block-actions"><input aria-label={ar ? 'تعليق' : 'Caption'} placeholder={ar ? 'إضافة تعليق…' : 'Add a caption…'} value={block.caption ?? ''} onChange={(event) => onChange({ caption: event.target.value })} /><button type="button" onClick={() => { setUrl(block.url ?? ''); setEditing(true); }}>{ar ? 'تعديل الرابط' : 'Edit URL'}</button><button type="button" onClick={open} aria-label={ar ? 'فتح في المتصفح' : 'Open in browser'}><ExternalLink size={14} /></button></div>
      {block.type === 'embed' && <small>{ar ? 'إذا منع الموقع التضمين، افتحه في المتصفح.' : 'If this site blocks embedding, open it in your browser.'}</small>}
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </figure>;
}
