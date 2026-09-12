import { FileJson } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { Locale } from '../app/i18n';

function draggingFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.items ?? []).some((item) => item.kind === 'file');
}

function isJson(file: File): boolean {
  return file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');
}

/**
 * Dropping a blueprint file onto Max opens it.
 *
 * The listeners are on the window, and they swallow every file drag rather than
 * only the ones Max understands: a browser's own answer to a dropped file is to
 * navigate to it, which would replace the running workspace with a page of raw
 * JSON. A file that is not JSON is refused in the same overlay that accepted
 * one, so the drop is never simply ignored.
 */
export function useBlueprintFileDrop({ enabled = true, locale, onFile }: { enabled?: boolean; locale: Locale; onFile: (text: string, fileName: string) => void }) {
  const ar = locale === 'ar';
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState('');

  useEffect(() => {
    if (!rejected) return;
    const timer = window.setTimeout(() => setRejected(''), 3200);
    return () => window.clearTimeout(timer);
  }, [rejected]);

  const accept = useCallback((file: File) => {
    void file.text()
      .then((text) => onFile(text, file.name))
      .catch(() => setRejected(ar ? 'تعذر قراءة الملف.' : 'That file could not be read.'));
  }, [ar, onFile]);

  useEffect(() => {
    // Depth counting: dragging across a child element fires `dragleave` on the
    // one being left before `dragenter` on the one being entered, so a plain
    // boolean flickers the overlay off in the middle of the window.
    let depth = 0;
    const enter = (event: DragEvent) => {
      if (!draggingFiles(event)) return;
      depth += 1;
      if (enabled) setOver(true);
    };
    const move = (event: DragEvent) => {
      if (!draggingFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = enabled ? 'copy' : 'none';
    };
    const leave = (event: DragEvent) => {
      if (!draggingFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const drop = (event: DragEvent) => {
      if (!draggingFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setOver(false);
      if (!enabled) return;
      const files = Array.from(event.dataTransfer?.files ?? []);
      const blueprint = files.find(isJson);
      if (blueprint) accept(blueprint);
      else if (files.length) setRejected(ar ? 'أفلت ملف مخطط ‎.json‎.' : 'Drop a .json blueprint file.');
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', move);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', move);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [accept, ar, enabled]);

  const overlay = (over && enabled) || rejected
    ? createPortal(
      <div className="blueprint-drop" data-state={rejected ? 'rejected' : 'ready'} role="status">
        <div className="blueprint-drop__card">
          <FileJson aria-hidden="true" size={26} />
          <strong>{rejected || (ar ? 'أفلت المخطط هنا' : 'Drop the blueprint here')}</strong>
          {!rejected && <span>{ar ? 'ملف ‎.json‎ سيُفتح للمراجعة قبل الاستيراد' : 'A .json file opens for review before anything is imported'}</span>}
        </div>
      </div>,
      document.body,
    )
    : null;

  return overlay;
}
