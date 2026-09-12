import type { UpdateStatus } from '../../../shared/update-contract';

export interface NativeUpdater {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener(event: string, listener: (...args: unknown[]) => void): unknown;
  setFeedURL(options: { url: string }): void;
  checkForUpdates(): void;
  quitAndInstall(): void;
}

/** Only the installed Windows adapter supplies a native updater. No renderer URLs. */
export class UpdateService {
  #status: UpdateStatus;
  #listeners: [string, (...args: unknown[]) => void][] = [];
  #startup?: ReturnType<typeof setTimeout>;
  #interval?: ReturnType<typeof setInterval>;
  constructor(private readonly updater: NativeUpdater | undefined, version: string, feedUrl: string) {
    this.#status = { state: updater ? 'idle' : 'unsupported', currentVersion: version };
    if (!updater) return;
    if (new URL(feedUrl).protocol !== 'https:') throw new Error('Updates require HTTPS.');
    updater.setFeedURL({ url: feedUrl });
    for (const [event, state] of Object.entries({
      'checking-for-update': 'checking', 'update-available': 'downloading',
      'update-not-available': 'current', 'update-downloaded': 'ready', error: 'error',
    } as const)) {
      const listener = (...args: unknown[]) => {
        // Squirrel reports `update-downloaded` as
        // (event, releaseNotes, releaseName, releaseDate, updateURL), so the
        // version people are being offered is the third argument.
        const releaseName = state === 'ready' && typeof args[2] === 'string' ? args[2] : undefined;
        this.#status = {
          ...this.#status,
          availableVersion: state === 'current' ? undefined : releaseName ?? this.#status.availableVersion,
          state,
        };
      };
      updater.on(event, listener); this.#listeners.push([event, listener]);
    }
  }
  getStatus(): UpdateStatus { return { ...this.#status }; }
  check(): UpdateStatus {
    if (!this.updater || ['checking', 'downloading', 'ready'].includes(this.#status.state)) return this.getStatus();
    this.#status = { ...this.#status, state: 'checking', checkedAt: new Date().toISOString() };
    try { this.updater.checkForUpdates(); } catch { this.#status = { ...this.#status, state: 'error' }; }
    return this.getStatus();
  }
  install(): UpdateStatus {
    if (this.#status.state === 'ready') {
      try { this.updater?.quitAndInstall(); } catch { this.#status = { ...this.#status, state: 'error' }; }
    }
    return this.getStatus();
  }
  start(): void {
    if (!this.updater || this.#interval) return;
    // Squirrel's first-run install lock needs time to settle.
    this.#startup = setTimeout(() => this.check(), 60_000);
    this.#interval = setInterval(() => this.check(), 4 * 60 * 60_000);
    this.#startup.unref(); this.#interval.unref();
  }
  dispose(): void {
    clearTimeout(this.#startup); clearInterval(this.#interval);
    for (const [event, listener] of this.#listeners) this.updater?.removeListener(event, listener);
  }
}
