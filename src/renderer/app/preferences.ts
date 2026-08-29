import type { Locale } from './i18n';

export type ThemePreference = 'dark' | 'light' | 'system';
export type EffectiveTheme = Exclude<ThemePreference, 'system'>;

export const preferenceKeys = {
  locale: 'max.ui.locale',
  sidebarCollapsed: 'max.ui.sidebar-collapsed',
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

export function readTheme(storage: Storage): ThemePreference {
  return readAllowedValue(storage, preferenceKeys.theme, ['dark', 'light', 'system'], 'system');
}

export function readSidebarCollapsed(storage: Storage): boolean {
  return storage.getItem(preferenceKeys.sidebarCollapsed) === 'true';
}

export function resolveTheme(preference: ThemePreference, systemUsesDark: boolean): EffectiveTheme {
  return preference === 'system' ? (systemUsesDark ? 'dark' : 'light') : preference;
}
