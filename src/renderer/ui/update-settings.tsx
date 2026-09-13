import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { UpdateStatus } from '../../shared/update-contract';
import { Button } from './button';

/**
 * A check that answers in twenty milliseconds reads as a button that did
 * nothing at all, so the spinner is held on screen long enough to be seen.
 */
const MINIMUM_SPIN = 700;

export function UpdateSettings({ locale }: { locale: string }) {
  const [status, setStatus] = useState<UpdateStatus>();
  const [pending, setPending] = useState(false);
  const request = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (inFlight.current) return;
      const generation = request.current;
      if (!window.maxApi?.updates) { setStatus({ state: 'unsupported', currentVersion: '' }); return; }
      void window.maxApi.updates.getStatus().then(value => {
        if (alive && generation === request.current) setStatus(value);
      }).catch(() => {
        if (alive && generation === request.current) setStatus(previous => ({ currentVersion: previous?.currentVersion ?? '', state: 'error' }));
      });
    };
    refresh(); const timer = setInterval(refresh, 2000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  const ar = locale === 'ar';
  const messages = {
    unsupported: ar ? 'هذه نسخة محمولة، فلا تُحدِّث نفسها.' : 'This is a portable copy, so it does not update itself.',
    idle: ar ? 'يتم البحث عن التحديثات تلقائيًا.' : 'Updates are checked automatically.',
    checking: ar ? 'جارٍ البحث عن تحديثات…' : 'Checking for updates…',
    downloading: ar ? 'جارٍ تنزيل التحديث…' : 'Downloading update…',
    available: ar ? 'يتوفر إصدار أحدث للتنزيل.' : 'A newer version is available to download.',
    ready: ar ? 'التحديث جاهز. أعد التشغيل لتثبيته.' : 'Update ready. Restart to install it.',
    current: ar ? 'لديك أحدث إصدار.' : 'You’re up to date.',
    error: ar ? 'تعذر البحث عن تحديثات. حاول مرة أخرى.' : 'Could not update. Check your connection and try again.',
  };
  const run = async (install: boolean) => {
    if (!window.maxApi?.updates || inFlight.current) return;
    request.current += 1;
    inFlight.current = true;
    setPending(true);
    if (!install) setStatus(previous => ({ currentVersion: previous?.currentVersion ?? '', state: 'checking' }));
    const held = new Promise(resolve => setTimeout(resolve, MINIMUM_SPIN));
    try {
      const next = await (install ? window.maxApi.updates.install() : window.maxApi.updates.check());
      await held;
      setStatus(next);
    }
    catch { await held; setStatus(previous => ({ currentVersion: previous?.currentVersion ?? '', state: 'error' })); }
    finally { inFlight.current = false; setPending(false); }
  };
  const busy = pending || status?.state === 'checking' || status?.state === 'downloading';
  const offered = status?.state === 'available' ? status : undefined;
  const label = busy
    ? (status?.state === 'ready' ? (ar ? 'جارٍ إعادة التشغيل…' : 'Restarting…') : messages[status?.state === 'downloading' ? 'downloading' : 'checking'])
    : status?.state === 'ready' ? (ar ? 'إعادة التشغيل والتثبيت' : 'Restart and install')
      : offered ? (ar ? 'تنزيل' : 'Download')
        : (ar ? 'البحث عن تحديثات' : 'Check for updates');
  return <div className="apple-settings-row">
    <div className="apple-settings-row-left"><div className="apple-settings-content">
      <span className="apple-settings-title">{ar ? 'تحديثات Max' : 'Max updates'} {status?.currentVersion}</span>
      <span className="apple-settings-description" role="status">
        {status ? messages[status.state] : (ar ? 'جارٍ تحميل حالة التحديث…' : 'Loading update status…')}
        {status?.availableVersion ? ` (${status.availableVersion})` : ''}
      </span>
      {/* Squirrel reports a download as started and finished and nothing in
          between, so the bar says work is happening rather than how much. */}
      {busy && <progress aria-label={messages[status?.state === 'downloading' ? 'downloading' : 'checking']} className="update-progress" />}
    </div></div>
    <div className="apple-settings-row-right"><Button
      aria-busy={busy}
      icon={busy ? <LoaderCircle className="update-spinner" aria-hidden="true" size={16} /> : undefined}
      disabled={!status || busy || status.state === 'unsupported'}
      onClick={() => {
        if (offered?.downloadUrl) { void window.maxApi.workspace.openExternal(offered.downloadUrl); return; }
        void run(status?.state === 'ready');
      }}
      variant="ghost"
    >{label}</Button></div>
  </div>;
}
