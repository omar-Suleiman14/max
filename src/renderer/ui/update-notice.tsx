import { useEffect, useState } from 'react';

export function UpdateNotice({ locale, onOpen }: { locale: string; onOpen: () => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => { void window.maxApi.updates?.getStatus().then(status => { if (active) setReady(status.state === 'ready'); }).catch(() => {}); };
    refresh(); const timer = setInterval(refresh, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  if (!ready) return null;
  return <button className="topbar-tool" type="button" onClick={onOpen}>{locale === 'ar' ? 'تحديث جاهز' : 'Update ready'}</button>;
}
