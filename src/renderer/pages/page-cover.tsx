import { useCallback, useEffect, useRef, useState } from 'react';

import { clampCoverPosition, coverBackground, type PageCover } from '../../shared/cover-contract';
import type { Locale } from '../app/i18n';
import { CoverPicker } from './cover-picker';

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
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startPosition: number } | undefined>(undefined);
  const isImage = cover.kind === 'image';
  const position = clampCoverPosition(repositioning ? draft : cover.position);

  useEffect(() => { if (!repositioning) setDraft(cover.position ?? 50); }, [cover.position, repositioning]);

  const move = useCallback((clientY: number) => {
    const start = drag.current;
    const height = strip.current?.getBoundingClientRect().height ?? 1;
    if (!start) return;
    // A full drag across the strip sweeps the whole image, which makes the
    // gesture feel attached to the picture rather than to an invisible scale.
    setDraft(clampCoverPosition(start.startPosition + ((start.startY - clientY) / height) * 100));
  }, []);

  useEffect(() => {
    if (!repositioning) return;
    const onMove = (event: PointerEvent) => { if (drag.current) { event.preventDefault(); move(event.clientY); } };
    const onUp = () => { drag.current = undefined; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [move, repositioning]);

  return (
    <div className="page-cover" data-repositioning={repositioning || undefined}>
      <div
        aria-label={text.cover}
        className="page-cover__image"
        onPointerDown={(event) => {
          if (!repositioning || !isImage) return;
          drag.current = { startPosition: draft, startY: event.clientY };
        }}
        ref={strip}
        role="img"
        style={isImage
          ? { backgroundImage: `url("${displayUrl(cover.value)}")`, backgroundPosition: `center ${position}%` }
          : { background: coverBackground(cover) }}
      />

      {repositioning ? (
        <div className="page-cover__reposition" role="group" aria-label={text.reposition}>
          <span>{text.drag}</span>
          <input
            aria-label={text.reposition}
            max={100}
            min={0}
            onChange={(event) => setDraft(Number(event.target.value))}
            type="range"
            value={draft}
          />
          <button onClick={() => { setRepositioning(false); setDraft(cover.position ?? 50); }} type="button">{text.cancel}</button>
          <button className="page-cover__primary" onClick={() => { onChange({ ...cover, position: clampCoverPosition(draft) }); setRepositioning(false); }} type="button">{text.done}</button>
        </div>
      ) : (
        <div className="page-cover__controls">
          <button onClick={() => setPicking((open) => !open)} type="button">{text.change}</button>
          {isImage && <button onClick={() => { setDraft(cover.position ?? 50); setRepositioning(true); setPicking(false); }} type="button">{text.reposition}</button>}
        </div>
      )}

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
        {locale === 'ar' ? '🖼 إضافة غلاف' : '🖼 Add cover'}
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
