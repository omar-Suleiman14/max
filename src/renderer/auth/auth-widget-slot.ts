/**
 * Where the Clerk account controls are allowed to appear.
 *
 * Clerk's sign-in and account buttons only work inside a `ClerkProvider`, but
 * `ClerkProvider` must not be an ancestor of the application: mounting it above
 * Max when somebody ticks the cloud backup box would remount the whole
 * application and throw them out of whatever screen they were on.
 *
 * So the provider is mounted as a sibling of the application, and the account
 * controls are sent into this slot with a portal. The cloud backup panel
 * registers the element it wants them in; nothing else in Max needs to know.
 */

let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();

export function setAuthWidgetSlot(element: HTMLElement | null): void {
  slot = element;
  for (const listener of listeners) listener();
}

export function getAuthWidgetSlot(): HTMLElement | null {
  return slot;
}

export function subscribeToAuthWidgetSlot(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
