import { useRef, useState } from 'react';
import type { NotionBlock } from '../ui/notion-block-editor';
import type { Locale } from '../app/i18n';
import { ResizableImage } from './resizable-image';

export function ImageBlock({ block, locale, onChange }: { block: NotionBlock; locale: Locale; onChange: (patch: Partial<NotionBlock>) => void }) {
  const ar = locale === 'ar';
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const local = /^max:\/\/asset\/[0-9a-f]{64}\.(png|jpg|gif|webp)$/.test(block.url ?? '');

  async function importImage(file?: File, address?: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = file
        ? await window.maxApi.assets.importImage(new Uint8Array(await file.arrayBuffer()), file.name)
        : await window.maxApi.assets.downloadImage(address ?? link);
      if (!result.ok) throw new Error(result.error.message);
      onChange({ url: result.value.url, caption: file?.name ?? block.caption, content: '' });
      setLinkOpen(false); setLink('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : (ar ? 'تعذر حفظ الصورة.' : 'Could not save the image.')); }
    finally { lock.current = false; setBusy(false); }
  }

  return <figure className="page-media-block page-image-block" aria-busy={busy} data-drop-active={over || undefined}
    onDragOver={event => { if (!local && event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; setOver(true); } }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false); }}
    onDrop={event => { if (local || !event.dataTransfer.files.length) return; event.preventDefault(); event.stopPropagation(); setOver(false); void importImage(event.dataTransfer.files[0]); }}>
    <input ref={input} hidden type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importImage(file); }} />
    {local ? <ResizableImage alt={block.caption || (ar ? 'صورة' : 'Image')} ar={ar} src={location.protocol.startsWith('http') ? block.url!.replace('max://asset/', '/__max/asset/') : block.url!} width={block.width} onResize={width => onChange({ width })} onError={() => setError(ar ? 'تعذر قراءة الصورة المحفوظة.' : 'Could not read the saved image.')} />
      : <div className="page-image-upload"><p>{ar ? 'اسحب صورة هنا أو اختر ملفًا' : 'Drop an image here or choose a file'}</p><button type="button" disabled={busy} onClick={() => input.current?.click()}>{ar ? 'اختيار صورة' : 'Choose image'}</button>{block.url && <button type="button" disabled={busy} onClick={() => void importImage(undefined, block.url)}>{ar ? 'حفظ الصورة محليًا' : 'Save linked image locally'}</button>}</div>}
    {busy && <p role="status">{ar ? 'جارٍ حفظ الصورة…' : 'Saving image…'}</p>}
    {/* A picture in the page is a picture, not a panel of tools. Only the
        caption stays; changing or saving a placed image is the cover's job,
        and an inline one is replaced by removing the block and adding another. */}
    {local
      ? <div className="extra-block-actions"><input aria-label={ar ? 'تعليق الصورة' : 'Image caption'} placeholder={ar ? 'إضافة تعليق…' : 'Add a caption…'} value={block.caption ?? ''} onChange={event => onChange({ caption: event.target.value })} /></div>
      : <div className="extra-block-actions"><button type="button" disabled={busy} aria-expanded={linkOpen} onClick={() => setLinkOpen(!linkOpen)}>{ar ? 'إدراج من رابط' : 'Insert from link'}</button></div>}
    {!local && linkOpen && <form className="page-url-form" onSubmit={event => { event.preventDefault(); void importImage(); }}><input aria-label={ar ? 'رابط الصورة' : 'Image URL'} type="url" required value={link} onChange={event => setLink(event.target.value)} placeholder="https://…" /><button disabled={busy} type="submit">{ar ? 'حفظ الصورة' : 'Save image'}</button></form>}
    {error && <p role="alert">{error}</p>}
  </figure>;
}
