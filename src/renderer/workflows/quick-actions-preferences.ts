const key = 'max.quick-actions.enabled';

/** Off until it is asked for: quick actions are a workflow to opt into. */
export function readQuickActionsEnabled(): boolean {
  return window.localStorage.getItem(key) === 'true';
}

export function saveQuickActionsEnabled(enabled: boolean): void {
  window.localStorage.setItem(key, String(enabled));
  window.dispatchEvent(new Event('max:quick-actions-preference-changed'));
}

export function quickActionModifier(platform?: 'linux' | 'macos' | 'windows'): string {
  return platform === 'macos' ? '⌘' : 'Ctrl';
}
