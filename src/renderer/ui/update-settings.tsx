import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { UpdateStatus } from '../../shared/update-contract';
import { Button } from './button';

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
    unsupported: ar ? 'التحديث التلقائي متاح في نسخة Windows المثبتة.' : 'Automatic updates are available in the installed Windows app.',
    idle: ar ? 'يتم البحث عن التحديثات تلقائيًا.' : 'Updates are checked automatically.',
    checking: ar ? 'جارٍ البحث عن تحديثات…' : 'Checking for updates…',
    downloading: ar ? 'جارٍ تنزيل التحديث…' : 'Downloading update…',
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
    try { setStatus(await (install ? window.maxApi.updates.install() : window.maxApi.updates.check())); }
    catch { setStatus(previous => ({ currentVersion: previous?.currentVersion ?? '', state: 'error' })); }
    finally { inFlight.current = false; setPending(false); }
  };
  const busy = pending || status?.state === 'checking' || status?.state === 'downloading';
  return <div className="apple-settings-row">
    <div className="apple-settings-row-left"><div className="apple-settings-content">
      <span className="apple-settings-title">{ar ? 'تحديثات Max' : 'Max updates'} {status?.currentVersion}</span>
      <span className="apple-settings-description" role="status">{status ? messages[status.state] : (ar ? 'جارٍ تحميل حالة التحديث…' : 'Loading update status…')}</span>
    </div></div>
    <div className="apple-settings-row-right"><Button aria-busy={busy} icon={busy ? <LoaderCircle className="update-spinner" aria-hidden="true" size={16} /> : undefined} disabled={!status || busy || status.state === 'unsupported'} onClick={() => void run(status?.state === 'ready')} variant="ghost">
      {busy ? (status?.state === 'ready' ? (ar ? 'جارٍ إعادة التشغيل…' : 'Restarting…') : messages[status?.state ?? 'checking']) : status?.state === 'ready' ? (ar ? 'إعادة التشغيل والتثبيت' : 'Restart and install') : (ar ? 'البحث عن تحديثات' : 'Check for updates')}
    </Button></div>
  </div>;
}
