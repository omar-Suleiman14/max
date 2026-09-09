import { useEffect, useState } from 'react';
import type { UpdateStatus } from '../../shared/update-contract';
import { Button } from './button';

export function UpdateSettings({ locale }: { locale: string }) {
  const [status, setStatus] = useState<UpdateStatus>();
  useEffect(() => {
    let alive = true;
    const refresh = () => { void window.maxApi?.updates?.getStatus().then(value => { if (alive) setStatus(value); }).catch(() => {}); };
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
    if (!window.maxApi?.updates) return;
    try { setStatus(await (install ? window.maxApi.updates.install() : window.maxApi.updates.check())); }
    catch { setStatus(previous => ({ currentVersion: previous?.currentVersion ?? '', state: 'error' })); }
  };
  return <div className="apple-settings-row">
    <div className="apple-settings-row-left"><div className="apple-settings-content">
      <span className="apple-settings-title">{ar ? 'تحديثات Max' : 'Max updates'} {status?.currentVersion}</span>
      <span className="apple-settings-description" role="status">{messages[status?.state ?? 'unsupported']}</span>
    </div></div>
    <div className="apple-settings-row-right"><Button disabled={!status || ['unsupported', 'checking', 'downloading'].includes(status.state)} onClick={() => void run(status?.state === 'ready')} variant="ghost">
      {status?.state === 'ready' ? (ar ? 'إعادة التشغيل والتثبيت' : 'Restart and install') : (ar ? 'البحث عن تحديثات' : 'Check for updates')}
    </Button></div>
  </div>;
}
