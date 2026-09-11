import type { Locale } from './i18n';

export type ThemePreference = 'dark' | 'light' | 'system';
export type EffectiveTheme = Exclude<ThemePreference, 'system'>;

export const preferenceKeys = {
  locale: 'max.ui.locale',
  sidebarCollapsed: 'max.ui.sidebar-collapsed',
  sidebarWidth: 'max.ui.sidebar-width',
  theme: 'max.ui.theme',
} as const;

function readAllowedValue<T extends string>(
  storage: Storage,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const persisted = storage.getItem(key);
  return persisted && allowed.includes(persisted as T) ? (persisted as T) : fallback;
}

export function readLocale(storage: Storage): Locale {
  return readAllowedValue(storage, preferenceKeys.locale, ['ar', 'en'], 'en');
}

/**
 * A first run opens in light mode rather than following the operating system.
 * Most shop machines sit under bright fluorescent light, and a workspace that
 * starts dark reads as broken to someone who has never opened the app before.
 * The system option stays available; it is simply not the untouched default.
 */
export function readTheme(storage: Storage): ThemePreference {
  return readAllowedValue(storage, preferenceKeys.theme, ['dark', 'light', 'system'], 'light');
}

export function readSidebarCollapsed(storage: Storage): boolean {
  return storage.getItem(preferenceKeys.sidebarCollapsed) === 'true';
}

export function readSidebarWidth(storage: Storage): number {
  const raw = storage.getItem(preferenceKeys.sidebarWidth);
  if (raw === null) return 238;
  const persisted = Number(raw);
  return Number.isFinite(persisted) ? Math.min(420, Math.max(180, persisted)) : 238;
}

export function resolveTheme(preference: ThemePreference, systemUsesDark: boolean): EffectiveTheme {
  return preference === 'system' ? (systemUsesDark ? 'dark' : 'light') : preference;
}
