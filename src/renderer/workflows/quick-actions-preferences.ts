const key = 'max.quick-actions.enabled';

export function readQuickActionsEnabled(): boolean {
  return window.localStorage.getItem(key) !== 'false';
}

export function saveQuickActionsEnabled(enabled: boolean): void {
  window.localStorage.setItem(key, String(enabled));
  window.dispatchEvent(new Event('max:quick-actions-preference-changed'));
}

export function quickActionModifier(platform?: 'linux' | 'macos' | 'windows'): string {
  return platform === 'macos' ? '⌘' : 'Ctrl';
}
