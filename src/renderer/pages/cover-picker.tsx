import { Link2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { COVER_GALLERY, MET_JAPANESE_PRINTS, MET_LANDSCAPES, MET_PORTRAITS, MET_STILL_LIFES, type CoverArtwork, type PageCover } from '../../shared/cover-contract';
import type { Locale } from '../app/i18n';
import { MET_COVER_IMAGES } from './met-cover-images';

type Tab = 'gallery' | 'upload' | 'link';

const copy = {
  ar: {
    add: 'إضافة', busy: 'جارٍ الحفظ…', gallery: 'المعرض',
    link: 'رابط', linkHelp: 'يُنزَّل الرابط ويُحفظ داخل مساحة العمل، فلا يحتاج اتصالاً بعد ذلك.',
    linkPlaceholder: 'الصق رابط صورة', loading: 'جارٍ التحميل…', noResults: 'لا توجد نتائج.',
    prints: 'مطبوعات يابانية، متحف المتروبوليتان',
    publicDomain: 'ملكية عامة',
    remove: 'إزالة',
    upload: 'رفع', uploadButton: 'اختر صورة', uploadHelp: 'PNG أو JPEG أو GIF أو WebP، حتى ١٢ ميجابايت.',
  },
  en: {
    add: 'Add', busy: 'Saving…', gallery: 'Gallery',
    link: 'Link', linkHelp: 'The link is downloaded and kept inside this workspace, so it needs no connection afterwards.',
    linkPlaceholder: 'Paste an image link', loading: 'Loading…', noResults: 'No photos found.',
    prints: 'Japanese prints, The Met',
    publicDomain: 'Public domain',
    remove: 'Remove',
    upload: 'Upload', uploadButton: 'Choose an image', uploadHelp: 'PNG, JPEG, GIF or WebP, up to 12 MB.',
  },
} as const;

/**
 * Where a cover comes from: a colour, a print from the Met, a file, or a link.
 *
 * Whichever is chosen, what the page ends up holding is a local file or a
 * gallery gradient. The prints ship inside the app, so this window never loads
 * a remote address and the gallery works with no connection.
 */
export function CoverPicker({ locale, onClose, onPick, onRemove, hasCover }: {
  hasCover: boolean;
  locale: Locale;
  onClose: () => void;
  onPick: (cover: PageCover) => void;
  onRemove: () => void;
}) {
  const text = copy[locale === 'ar' ? 'ar' : 'en'];
  const ar = locale === 'ar';
  const [tab, setTab] = useState<Tab>('gallery');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) onClose();
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [onClose]);

  const settle = async (work: () => Promise<{ ok: true; value: { url: string } } | { ok: false; error: { message: string } }>, credit?: PageCover['credit']) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await work();
      if (!result.ok) { setError(result.error.message); return; }
      onPick({ credit, kind: 'image', position: 50, value: result.value.url });
    } catch {
      setError(ar ? 'تعذر حفظ الصورة.' : 'Could not save the image.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Take a bundled print into the workspace's own asset store.
   *
   * The picture is already on this machine, so this reads the file out of the
   * app bundle and hands the bytes to the same importer an upload uses. The
   * store is content-addressed, so choosing the same print on two pages keeps
   * one copy, and the cover needs no network at any point.
   */
  const pickArtwork = (artwork: CoverArtwork) => void settle(
    async () => {
      const source = MET_COVER_IMAGES[artwork.id];
      if (!source) return { error: { message: ar ? 'تعذر العثور على الصورة.' : 'That picture is missing from this build.' }, ok: false as const };
      const bytes = new Uint8Array(await (await fetch(source)).arrayBuffer());
      return window.maxApi.assets.importImage(bytes, `${artwork.id}.jpg`);
    },
    { name: `${artwork.title}, ${artwork.artist}`, url: artwork.objectUrl },
  );

  const tabs: readonly Readonly<{ id: Tab; label: string }>[] = [
    { id: 'gallery', label: text.gallery },
    { id: 'upload', label: text.upload },
    { id: 'link', label: text.link },
  ];

  return (
    <div className="cover-picker" ref={root} role="dialog" aria-label={ar ? 'اختيار الغلاف' : 'Choose a cover'} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <header className="cover-picker__tabs">
        <div role="tablist" aria-label={ar ? 'مصدر الغلاف' : 'Cover source'}>
          {tabs.map((entry) => (
            <button key={entry.id} aria-selected={tab === entry.id} data-active={tab === entry.id || undefined} onClick={() => setTab(entry.id)} role="tab" type="button">
              {entry.id === 'upload' && <Upload aria-hidden="true" size={13} />}
              {entry.id === 'link' && <Link2 aria-hidden="true" size={13} />}
              {entry.label}
            </button>
          ))}
        </div>
        {hasCover && <button className="cover-picker__remove" onClick={onRemove} type="button">{text.remove}</button>}
      </header>

      <div className="cover-picker__body">
        {tab === 'gallery' && <>
          {COVER_GALLERY.map((category) => (
            <div key={category.id} className="cover-picker__category">
              <p className="cover-picker__section">{ar ? category.labelAr : category.label}</p>
              <div className="cover-picker__grid">
                {category.items.map((gradient) => (
                  <button
                    key={gradient.id}
                    aria-label={gradient.label}
                    className="cover-swatch"
                    onClick={() => onPick({ kind: 'gradient', position: 50, value: gradient.id })}
                    style={{ background: gradient.background }}
                    title={gradient.label}
                    type="button"
                  />
                ))}
              </div>
            </div>
          ))}

          {[
            { title: ar ? 'مناظر طبيعية، متحف المتروبوليتان' : 'Landscapes, The Met', artworks: MET_LANDSCAPES },
            { title: text.prints, artworks: MET_JAPANESE_PRINTS },
            { title: ar ? 'طبيعة صامتة، متحف المتروبوليتان' : 'Still life, The Met', artworks: MET_STILL_LIFES },
            { title: ar ? 'صور شخصية، متحف المتروبوليتان' : 'Portraits, The Met', artworks: MET_PORTRAITS },
          ].map(section => <div key={section.title} className="cover-picker__category">
            <p className="cover-picker__section">{section.title} <span>{text.publicDomain}</span></p>
            <div className="cover-picker__grid cover-picker__grid--photos">
              {section.artworks.map((artwork) => (
                <button
                  key={artwork.id}
                  aria-label={`${artwork.title}, ${artwork.artist}`}
                  className="cover-swatch cover-swatch--photo"
                  disabled={busy}
                  onClick={() => pickArtwork(artwork)}
                  style={{ backgroundImage: `url(${MET_COVER_IMAGES[artwork.id] ?? ''})` }}
                  title={`${artwork.title}, ${artwork.artist}, ${artwork.date}`}
                  type="button"
                >
                  <span>{artwork.title}</span>
                </button>
              ))}
            </div>
          </div>)}
        </>}

        {tab === 'upload' && <div className="cover-picker__pane">
          <input
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              event.target.value = '';
              if (!chosen) return;
              void settle(async () => window.maxApi.assets.importImage(new Uint8Array(await chosen.arrayBuffer()), chosen.name));
            }}
            ref={file}
            type="file"
          />
          <button className="cover-picker__primary" disabled={busy} onClick={() => file.current?.click()} type="button">
            {busy ? text.busy : text.uploadButton}
          </button>
          <p className="cover-picker__hint">{text.uploadHelp}</p>
        </div>}

        {tab === 'link' && <form className="cover-picker__pane" onSubmit={(event) => { event.preventDefault(); if (link.trim()) void settle(() => window.maxApi.assets.downloadImage(link.trim())); }}>
          <input aria-label={text.linkPlaceholder} onChange={(event) => setLink(event.target.value)} placeholder={text.linkPlaceholder} value={link} />
          <button className="cover-picker__primary" disabled={busy || !link.trim()} type="submit">{busy ? text.busy : text.add}</button>
          <p className="cover-picker__hint">{text.linkHelp}</p>
        </form>}

        {error && <p className="cover-picker__error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
