import { ArrowUpCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { UpdateStatus } from '../../shared/update-contract';

const dismissedKey = 'max.updates.dismissed-version';

/**
 * Tells people an update is waiting.
 *
 * A quiet button in the toolbar was easy to never notice, so a ready update
 * announces itself once as a notification with the two answers that matter:
 * restart now, or later. "Later" is remembered for that version only, so the
 * notice returns for the next release rather than nagging every half minute.
 */
export function UpdateNotice({ locale, onOpen }: { locale: string; onOpen: () => void }) {
  const ar = locale === 'ar';
  const [status, setStatus] = useState<UpdateStatus>();
  const [dismissed, setDismissed] = useState(() => window.localStorage.getItem(dismissedKey) ?? '');
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void window.maxApi.updates?.getStatus()
        .then((value) => { if (active) setStatus(value); })
        .catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  if (!status) return null;

  const version = status.availableVersion ?? '';
  const ready = status.state === 'ready';
  const announced = ready && dismissed !== (version || 'ready');

  if (status.state === 'available') {
    return (
      <button className="update-chip update-chip--ready" onClick={onOpen} type="button">
        <ArrowUpCircle aria-hidden="true" size={15} />
        {ar ? `الإصدار ${version} متاح` : `${version} available`}
      </button>
    );
  }

  if (status.state === 'downloading') {
    return (
      <span className="update-chip" role="status">
        <ArrowUpCircle aria-hidden="true" size={15} />
        {ar ? 'جارٍ تنزيل التحديث…' : 'Downloading update…'}
      </span>
    );
  }

  if (!ready) return null;

  const install = () => {
    setInstalling(true);
    void window.maxApi.updates?.install().catch(() => setInstalling(false));
  };

  return (
    <>
      <button className="update-chip update-chip--ready" onClick={onOpen} type="button">
        <ArrowUpCircle aria-hidden="true" size={15} />
        {ar ? 'تحديث جاهز' : 'Update ready'}
      </button>

      {announced && (
        <div className="toast toast--update" role="status">
          <div className="toast__body">
            <strong>{ar
              ? `الإصدار ${version || 'الجديد'} من Max جاهز للتثبيت`
              : `Max ${version || 'update'} is ready to install`}</strong>
            <p>{ar
              ? 'تم تنزيل التحديث. أعد تشغيل Max لتثبيته، أو تابع عملك وثبّته لاحقًا.'
              : 'The update is downloaded. Restart Max to install it, or carry on and install it later.'}</p>
            <div className="toast__actions">
              <button className="btn btn-primary" disabled={installing} onClick={install} type="button">
                {installing
                  ? (ar ? 'جارٍ إعادة التشغيل…' : 'Restarting…')
                  : (ar ? 'إعادة التشغيل والتثبيت' : 'Restart and install')}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const mark = version || 'ready';
                  window.localStorage.setItem(dismissedKey, mark);
                  setDismissed(mark);
                }}
                type="button"
              >
                {ar ? 'لاحقًا' : 'Later'}
              </button>
            </div>
          </div>
          <button
            aria-label={ar ? 'إغلاق' : 'Close'}
            onClick={() => {
              const mark = version || 'ready';
              window.localStorage.setItem(dismissedKey, mark);
              setDismissed(mark);
            }}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      )}
    </>
  );
}
