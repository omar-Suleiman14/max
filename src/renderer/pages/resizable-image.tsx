import { useRef, useState } from 'react';
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
export function ResizableImage({ alt, ar, onError, onResize, src, width }: Readonly<{
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
    <img alt={alt} draggable={false} onError={onError} src={src} />
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
