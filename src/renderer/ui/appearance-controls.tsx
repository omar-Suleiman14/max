import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { appearanceDefaults, readAppearance, saveAppearance, type Appearance } from '../app/appearance';
import type { Locale } from '../app/i18n';

export function AppearanceControls({ locale }: { locale: Locale }) {
  const [value, setValue] = useState(readAppearance);
  const ar = locale === 'ar';
  const change = (key: keyof Appearance, next: number) => { const updated = { ...value, [key]: next }; setValue(updated); saveAppearance(updated); };
  return <div className="appearance-controls">
    {([
      { key: 'contrast', label: ar ? 'التباين' : 'Contrast', description: ar ? 'تباين الألوان والحدود في الواجهة.' : 'Adjust the contrast of interface colors and borders.', min: 80, max: 140, unit: '%' },
      { key: 'glass', label: ar ? 'عتامة الزجاج' : 'Glass opacity', description: ar ? 'القيم الأعلى تجعل القوائم والنوافذ أكثر عتامة.' : 'Higher values make menus and popups more solid.', min: 40, max: 100, unit: '%' },
      { key: 'motion', label: ar ? 'حركة النوافذ' : 'Panel animations', description: ar ? 'سرعة فتح النوافذ والقوائم.' : 'Set how fast panels and menus open.', min: 0, max: 500, unit: ' ms' },
    ] as const).map(({ key, label, description, min, max, unit }) => <div className="appearance-control" key={key}><div><div className="appearance-control-title"><label htmlFor={`appearance-${key}`}>{label}</label><button type="button" className="appearance-reset" aria-label={`${ar ? 'إعادة ضبط' : 'Reset'} ${label}`} onClick={() => change(key, appearanceDefaults[key])}><RotateCcw size={12} /></button></div><p>{description}</p></div><div className="appearance-slider"><output htmlFor={`appearance-${key}`}>{value[key]}{unit}</output><input id={`appearance-${key}`} type="range" min={min} max={max} step={key === 'motion' ? 10 : 1} value={value[key]} onChange={(e) => change(key, Number(e.target.value))} /></div></div>)}
  </div>;
}
