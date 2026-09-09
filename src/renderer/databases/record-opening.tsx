import { useEffect, useState } from 'react';
import type { Locale } from '../app/i18n';
import { Select } from '../ui/select';
export type RecordPageMode = 'center' | 'full' | 'side';
const key = 'max:record-page-mode';
function read(): RecordPageMode {
  try { const value = localStorage.getItem(key); return value === 'full' || value === 'side' ? value : 'center'; } catch { return 'center'; }
}
// Shared hook and its settings control intentionally live together.
// eslint-disable-next-line react-refresh/only-export-components
export function useRecordPageMode() {
  const [mode, setMode] = useState<RecordPageMode>(read);
  useEffect(() => { const changed = () => setMode(read()); window.addEventListener('max:record-opening-changed', changed); window.addEventListener('storage', changed); return () => { window.removeEventListener('max:record-opening-changed', changed); window.removeEventListener('storage', changed); }; }, []);
  return mode;
}
export function RecordOpeningSettings({ locale }: { locale: Locale }) {
  const mode = useRecordPageMode();
  return <div className="settings-control-row"><div className="settings-control-copy"><strong>{locale === 'ar' ? 'فتح السجلات في' : 'Open records in'}</strong><small>{locale === 'ar' ? 'الوضع الافتراضي. يمكنك تغييره لكل عرض من إعدادات قاعدة البيانات.' : 'Default for record pages. Individual database views can override this.'}</small></div><Select aria-label={locale === 'ar' ? 'طريقة فتح السجلات' : 'Record opening mode'} value={mode} onChange={(event) => { localStorage.setItem(key, event.target.value); window.dispatchEvent(new Event('max:record-opening-changed')); }}><option value="center">{locale === 'ar' ? 'صفحة منبثقة' : 'Popup page'}</option><option value="full">{locale === 'ar' ? 'صفحة كاملة' : 'Full page'}</option><option value="side">{locale === 'ar' ? 'عرض جانبي' : 'Side peek'}</option></Select></div>;
}
