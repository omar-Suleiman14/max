import { ImagePlus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { clampCoverPosition, coverBackground, type PageCover } from '../../shared/cover-contract';
import type { Locale } from '../app/i18n';
import { CoverPicker } from './cover-picker';
import { exportWorkspaceImage } from './export-image';
import '../ui/workspace-media.css';

/** In the browser preview the renderer is served over http, where `max:` has no handler. */
function displayUrl(value: string): string {
  return location.protocol === 'http:' || location.protocol === 'https:'
    ? value.replace('max://asset/', '/__max/asset/')
    : value;
}

const copy = {
  ar: { change: 'تغيير الغلاف', cover: 'غلاف الصفحة', done: 'حفظ الموضع', drag: 'اسحب لتغيير الموضع', reposition: 'تغيير الموضع', cancel: 'إلغاء', photoBy: 'تصوير' },
  en: { change: 'Change cover', cover: 'Page cover', done: 'Save position', drag: 'Drag to reposition', reposition: 'Reposition', cancel: 'Cancel', photoBy: 'Photo by' },
} as const;

/**
 * The banner strip at the top of a page.
 *
 * An image cover can be dragged vertically to choose which part of it the strip
 * shows, because a wide crop of a tall photograph is almost never right the
 * first time. The position is a percentage rather than pixels, so it survives
 * the window being resized and the same page being opened on another machine.
 */
export function PageCover({ cover, locale, onChange }: {
  cover: PageCover;
  locale: Locale;
  onChange: (cover: PageCover | undefined) => void;
}) {
  const text = copy[locale === 'ar' ? 'ar' : 'en'];
  const [picking, setPicking] = useState(false);
  const [repositioning, setRepositioning] = useState(false);
  const [draft, setDraft] = useState(cover.position ?? 50);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const dimensions = useRef({ width: 0, height: 0 });
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startPosition: number; overflow: number } | undefined>(undefined);
  const isImage = cover.kind === 'image';
  const position = clampCoverPosition(repositioning ? draft : cover.position);

  useEffect(() => { if (!repositioning) setDraft(cover.position ?? 50); }, [cover.position, repositioning]);
  useEffect(() => {
    dimensions.current = { width: 0, height: 0 };
    if (!isImage) return;
    const image = new Image();
    image.onload = () => { dimensions.current = { width: image.naturalWidth, height: image.naturalHeight }; };
    image.src = displayUrl(cover.value);
    return () => { image.onload = null; };
  }, [cover.value, isImage]);

  const move = useCallback((clientY: number) => {
    const start = drag.current;
    if (!start) return;
    // A full drag across the strip sweeps the whole image, which makes the
    // gesture feel attached to the picture rather than to an invisible scale.
    if (start.overflow > 0) setDraft(clampCoverPosition(start.startPosition + ((start.startY - clientY) / start.overflow) * 100));
  }, []);

  useEffect(() => {
    if (!repositioning) return;
    const onMove = (event: PointerEvent) => { if (drag.current) { event.preventDefault(); move(event.clientY); } };
    const onUp = () => { drag.current = undefined; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => { drag.current = undefined; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); };
  }, [move, repositioning]);

  return (
    <div className="page-cover" data-repositioning={repositioning || undefined}>
      <div
        aria-label={text.cover}
        className="page-cover__image"
        onPointerDown={(event) => {
          if (!repositioning || !isImage || event.button !== 0) return;
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const size = dimensions.current;
          const scale = size.width && size.height ? Math.max(rect.width / size.width, rect.height / size.height) : 1;
          drag.current = { startPosition: draft, startY: event.clientY, overflow: Math.max(0, size.height * scale - rect.height) };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onDoubleClick={() => {
          if (!repositioning || !isImage) return;
          // The neutral crop is always the middle. A quick double click is a
          // discoverable way to return there without dragging a tiny slider.
          setDraft(50);
        }}
        ref={strip}
        role="img"
        style={isImage
          ? { backgroundImage: `url("${displayUrl(cover.value)}")`, backgroundPosition: `center ${position}%` }
          : { background: coverBackground(cover) }}
      />

      {repositioning && (
        <div className="page-cover__reposition" role="group" aria-label={text.reposition}>
          <span>{text.drag}</span>
          <input
            aria-label={text.reposition}
            max={100}
            min={0}
            onChange={(event) => setDraft(Number(event.target.value))}
            onDoubleClick={() => setDraft(50)}
            title={locale === 'ar' ? 'انقر مرتين لإعادة التوسيط' : 'Double-click to reset to center'}
            type="range"
            value={draft}
          />
          <button onClick={() => { setRepositioning(false); setDraft(cover.position ?? 50); }} type="button">{text.cancel}</button>
          <button className="page-cover__primary" onClick={() => { onChange({ ...cover, position: clampCoverPosition(draft) }); setRepositioning(false); }} type="button">{text.done}</button>
        </div>
      )}
        <div className="page-cover__controls">
          <button onClick={() => { setRepositioning(false); setPicking((open) => !open); }} type="button">{text.change}</button>
          {isImage && <button aria-pressed={repositioning} onClick={() => { setDraft(cover.position ?? 50); setRepositioning(!repositioning); setPicking(false); }} type="button">{text.reposition}</button>}
          {isImage && <button disabled={exporting} onClick={() => {
            setExporting(true); setExportError('');
            void exportWorkspaceImage(cover.value).catch(() => setExportError(locale === 'ar' ? 'تعذر تصدير الصورة.' : 'Could not export the image.')).finally(() => setExporting(false));
          }} type="button">{exporting ? (locale === 'ar' ? 'جارٍ التصدير…' : 'Exporting…') : (locale === 'ar' ? 'تنزيل' : 'Download')}</button>}
        </div>
      {exportError && <p className="page-cover__error" role="alert">{exportError}</p>}

      {cover.credit && !repositioning && (
        <p className="page-cover__credit">
          {text.photoBy} <a href={cover.credit.url} rel="noreferrer" target="_blank">{cover.credit.name}</a>
        </p>
      )}

      {picking && (
        <div className="page-cover__picker">
          <CoverPicker
            hasCover
            locale={locale}
            onClose={() => setPicking(false)}
            onPick={(next) => { onChange(next); setPicking(false); }}
            onRemove={() => { onChange(undefined); setPicking(false); }}
          />
        </div>
      )}
    </div>
  );
}

/** The "Add cover" affordance a page without one shows above its title. */
export function AddCoverButton({ locale, onChange }: { locale: Locale; onChange: (cover: PageCover | undefined) => void }) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="page-cover-add">
      <button onClick={() => setPicking((open) => !open)} type="button">
        <ImagePlus aria-hidden="true" size={16} />
        {locale === 'ar' ? 'إضافة غلاف' : 'Add cover'}
      </button>
      {picking && (
        <div className="page-cover__picker page-cover__picker--inline">
          <CoverPicker
            hasCover={false}
            locale={locale}
            onClose={() => setPicking(false)}
            onPick={(next) => { onChange(next); setPicking(false); }}
            onRemove={() => setPicking(false)}
          />
        </div>
      )}
    </div>
  );
}
