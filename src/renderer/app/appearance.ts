import { useEffect } from 'react';

export const appearanceDefaults = { contrast: 100, glass: 85, motion: 200 };
export type Appearance = typeof appearanceDefaults;
const key = 'max.ui.appearance';
export function readAppearance(): Appearance {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<Appearance>;
    const bounded = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
    return { contrast: bounded(raw.contrast, 100, 80, 140), glass: bounded(raw.glass, 85, 40, 100), motion: bounded(raw.motion, 200, 0, 500) };
  } catch { return { ...appearanceDefaults }; }
}
export function saveAppearance(value: Appearance) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event('max:appearance-changed'));
}
export function useAppearance() {
  useEffect(() => {
    const apply = () => {
      const value = readAppearance();
      const style = document.documentElement.style;
      style.setProperty('--interface-contrast', String(value.contrast / 100));
      style.setProperty('--popup-opacity', `${value.glass}%`);
      style.setProperty('--panel-duration', `${value.motion}ms`);
      style.setProperty('--line', `color-mix(in srgb, var(--text) ${Math.round(value.contrast * 0.1)}%, transparent)`);
      style.setProperty('--line-strong', `color-mix(in srgb, var(--text) ${Math.round(value.contrast * 0.18)}%, transparent)`);
    };
    apply(); window.addEventListener('max:appearance-changed', apply);
    return () => window.removeEventListener('max:appearance-changed', apply);
  }, []);
}
