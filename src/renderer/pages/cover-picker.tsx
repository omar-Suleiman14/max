import { Image as ImageIcon, Link2, Search, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { COVER_GRADIENTS, type PageCover, type PhotoResult } from '../../shared/cover-contract';
import type { Locale } from '../app/i18n';

type Tab = 'gallery' | 'upload' | 'link' | 'unsplash';

const copy = {
  ar: {
    add: 'إضافة', busy: 'جارٍ الحفظ…', colors: 'ألوان وتدرجات', gallery: 'المعرض',
    key: 'مفتاح Unsplash', keyHelp: 'صور Unsplash تحتاج مفتاح وصول مجاني من unsplash.com/developers. تبقى بقية الخيارات متاحة بدونه.',
    keySave: 'حفظ المفتاح', link: 'رابط', linkHelp: 'يُنزَّل الرابط ويُحفظ داخل مساحة العمل، فلا يحتاج اتصالاً بعد ذلك.',
    linkPlaceholder: 'الصق رابط صورة', loading: 'جارٍ التحميل…', noResults: 'لا توجد نتائج.',
    remove: 'إزالة', searchPhotos: 'ابحث عن صور…', unsplash: 'Unsplash',
    upload: 'رفع', uploadButton: 'اختر صورة', uploadHelp: 'PNG أو JPEG أو GIF أو WebP، حتى ١٢ ميجابايت.',
  },
  en: {
    add: 'Add', busy: 'Saving…', colors: 'Color & gradient', gallery: 'Gallery',
    key: 'Unsplash key', keyHelp: 'Unsplash photos need a free access key from unsplash.com/developers. Everything else here works without one.',
    keySave: 'Save key', link: 'Link', linkHelp: 'The link is downloaded and kept inside this workspace, so it needs no connection afterwards.',
    linkPlaceholder: 'Paste an image link', loading: 'Loading…', noResults: 'No photos found.',
    remove: 'Remove', searchPhotos: 'Search photos…', unsplash: 'Unsplash',
    upload: 'Upload', uploadButton: 'Choose an image', uploadHelp: 'PNG, JPEG, GIF or WebP, up to 12 MB.',
  },
} as const;

/**
 * Where a cover comes from: the gallery, a file, a link, or Unsplash.
 *
 * Whichever is chosen, what the page ends up holding is a local file or a
 * gallery gradient. Even the Unsplash result thumbnails arrive as bytes the
 * main process fetched, so this window never loads a remote address.
 */
export function CoverPicker({ locale, onClose, onPick, onRemove, hasCover }: {
  hasCover: boolean;
  locale: Locale;
  onClose: () => void;
  onPick: (cover: PageCover) => void;
  onRemove: () => void;
}) {
  const text = copy[locale === 'ar' ? 'ar' : 'en'];
  const [tab, setTab] = useState<Tab>('gallery');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const [query, setQuery] = useState('');
  const [photos, setPhotos] = useState<readonly PhotoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [keyConfigured, setKeyConfigured] = useState<boolean>();
  const [keyDraft, setKeyDraft] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) onClose();
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [onClose]);

  useEffect(() => {
    if (tab !== 'unsplash' || keyConfigured !== undefined) return;
    void window.maxApi.photos.getAccessKey().then(({ configured }) => setKeyConfigured(configured));
  }, [keyConfigured, tab]);

  const runSearch = useCallback(async (term: string) => {
    setSearching(true);
    setError('');
    try {
      const result = await window.maxApi.photos.search(term);
      if (!result.ok) {
        setError(result.error.message === 'unconfigured' ? '' : result.error.message);
        if (result.error.message === 'unconfigured') setKeyConfigured(false);
        setPhotos([]);
        return;
      }
      setPhotos(result.value);
    } catch {
      setError(locale === 'ar' ? 'تعذر البحث في Unsplash.' : 'Could not search Unsplash.');
    } finally {
      setSearching(false);
    }
  }, [locale]);

  useEffect(() => {
    if (tab !== 'unsplash' || !keyConfigured) return;
    const timer = window.setTimeout(() => void runSearch(query), query ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [keyConfigured, query, runSearch, tab]);

  const settle = async (work: () => Promise<{ ok: true; value: { url: string } } | { ok: false; error: { message: string } }>, credit?: PageCover['credit']) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await work();
      if (!result.ok) { setError(result.error.message); return; }
      onPick({ credit, kind: 'image', position: 50, value: result.value.url });
    } catch {
      setError(locale === 'ar' ? 'تعذر حفظ الصورة.' : 'Could not save the image.');
    } finally {
      setBusy(false);
    }
  };

  const tabs: readonly Readonly<{ id: Tab; label: string }>[] = [
    { id: 'gallery', label: text.gallery },
    { id: 'upload', label: text.upload },
    { id: 'link', label: text.link },
    { id: 'unsplash', label: text.unsplash },
  ];

  return (
    <div className="cover-picker" ref={root} role="dialog" aria-label={locale === 'ar' ? 'اختيار الغلاف' : 'Choose a cover'} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <header className="cover-picker__tabs">
        <div role="tablist" aria-label={locale === 'ar' ? 'مصدر الغلاف' : 'Cover source'}>
          {tabs.map((entry) => (
            <button key={entry.id} aria-selected={tab === entry.id} data-active={tab === entry.id || undefined} onClick={() => setTab(entry.id)} role="tab" type="button">
              {entry.id === 'upload' && <Upload aria-hidden="true" size={13} />}
              {entry.id === 'link' && <Link2 aria-hidden="true" size={13} />}
              {entry.id === 'unsplash' && <ImageIcon aria-hidden="true" size={13} />}
              {entry.label}
            </button>
          ))}
        </div>
        {hasCover && <button className="cover-picker__remove" onClick={onRemove} type="button">{text.remove}</button>}
      </header>

      <div className="cover-picker__body">
        {tab === 'gallery' && <>
          <p className="cover-picker__section">{text.colors}</p>
          <div className="cover-picker__grid">
            {COVER_GRADIENTS.map((gradient) => (
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

        {tab === 'unsplash' && (keyConfigured === false ? (
          <form className="cover-picker__pane" onSubmit={(event) => {
            event.preventDefault();
            if (!keyDraft.trim()) return;
            void window.maxApi.photos.setAccessKey(keyDraft.trim()).then((result) => {
              if (!result.ok) { setError(result.error.message); return; }
              setKeyDraft('');
              setKeyConfigured(result.value.configured);
            });
          }}>
            <p className="cover-picker__hint">{text.keyHelp}</p>
            <input aria-label={text.key} onChange={(event) => setKeyDraft(event.target.value)} placeholder={text.key} value={keyDraft} />
            <button className="cover-picker__primary" disabled={!keyDraft.trim()} type="submit">{text.keySave}</button>
          </form>
        ) : (
          <>
            <div className="cover-picker__search">
              <Search aria-hidden="true" size={14} />
              <input aria-label={text.searchPhotos} onChange={(event) => setQuery(event.target.value)} placeholder={text.searchPhotos} value={query} />
              {query && <button aria-label={locale === 'ar' ? 'مسح' : 'Clear'} onClick={() => setQuery('')} type="button"><X size={12} /></button>}
            </div>
            {searching && <p className="cover-picker__hint">{text.loading}</p>}
            {!searching && !photos.length && keyConfigured && <p className="cover-picker__hint">{text.noResults}</p>}
            <div className="cover-picker__grid cover-picker__grid--photos">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  aria-label={photo.authorName}
                  className="cover-swatch cover-swatch--photo"
                  disabled={busy}
                  onClick={() => void settle(
                    () => window.maxApi.photos.use(photo),
                    { name: photo.authorName, url: photo.authorUrl },
                  )}
                  style={photo.thumbnail ? { backgroundImage: `url(${photo.thumbnail})` } : undefined}
                  type="button"
                >
                  <span>{photo.authorName}</span>
                </button>
              ))}
            </div>
          </>
        ))}

        {error && <p className="cover-picker__error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
