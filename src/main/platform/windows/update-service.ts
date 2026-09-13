import type { UpdateStatus } from '../../../shared/update-contract';

export interface NativeUpdater {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener(event: string, listener: (...args: unknown[]) => void): unknown;
  setFeedURL(options: { url: string }): void;
  checkForUpdates(): void;
  quitAndInstall(): void;
}

/** What a release feed can say about the newest published version. */
export type LatestRelease = Readonly<{ downloadUrl: string; version: string }>;

/** Compares two dotted versions without treating 1.0.10 as older than 1.0.9. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parts = (value: string) => value.replace(/^v/, '').split(/[.\-+]/).map((piece) => Number.parseInt(piece, 10));
  const left = parts(candidate);
  const right = parts(current);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const a = left[index];
    const b = right[index];
    if (Number.isNaN(a ?? Number.NaN) || Number.isNaN(b ?? Number.NaN)) return false;
    if ((a ?? 0) !== (b ?? 0)) return (a ?? 0) > (b ?? 0);
  }
  return false;
}

/**
 * Only the installed Windows adapter supplies a native updater. No renderer URLs.
 *
 * Everywhere else — a Mac, a Linux package, a portable copy — Max cannot
 * replace itself, but it can still answer the question honestly rather than
 * greying the button out and leaving the person to guess. When a release feed
 * is supplied, Check for updates reads it and offers the download.
 */
export class UpdateService {
  #status: UpdateStatus;
  #listeners: [string, (...args: unknown[]) => void][] = [];
  #startup?: ReturnType<typeof setTimeout>;
  #interval?: ReturnType<typeof setInterval>;
  #looking = false;
  constructor(
    private readonly updater: NativeUpdater | undefined,
    private readonly version: string,
    feedUrl: string,
    private readonly latestRelease?: () => Promise<LatestRelease | null>,
  ) {
    this.#status = { state: updater ? 'idle' : latestRelease ? 'idle' : 'unsupported', currentVersion: version };
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
    if (['checking', 'downloading', 'ready'].includes(this.#status.state)) return this.getStatus();
    if (!this.updater) { void this.#askTheFeed(); return this.getStatus(); }
    this.#status = { ...this.#status, state: 'checking', checkedAt: new Date().toISOString() };
    try { this.updater.checkForUpdates(); } catch { this.#status = { ...this.#status, state: 'error' }; }
    return this.getStatus();
  }

  /** The answer arrives over the network, so the renderer polls for it. */
  async #askTheFeed(): Promise<void> {
    if (!this.latestRelease || this.#looking) return;
    this.#looking = true;
    this.#status = { ...this.#status, state: 'checking', checkedAt: new Date().toISOString() };
    try {
      const release = await this.latestRelease();
      this.#status = release && isNewerVersion(release.version, this.version)
        ? { ...this.#status, availableVersion: release.version, downloadUrl: release.downloadUrl, state: 'available' }
        : { ...this.#status, availableVersion: undefined, state: 'current' };
    } catch { this.#status = { ...this.#status, state: 'error' }; }
    finally { this.#looking = false; }
  }
  install(): UpdateStatus {
    if (this.#status.state === 'ready') {
      try { this.updater?.quitAndInstall(); } catch { this.#status = { ...this.#status, state: 'error' }; }
    }
    return this.getStatus();
  }
  start(): void {
    if ((!this.updater && !this.latestRelease) || this.#interval) return;
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
