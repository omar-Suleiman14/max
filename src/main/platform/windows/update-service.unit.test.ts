import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNewerVersion, UpdateService } from './update-service';

class Updater extends EventEmitter {
  setFeedURL = vi.fn();
  checkForUpdates = vi.fn();
  quitAndInstall = vi.fn();
}
afterEach(() => vi.useRealTimers());
describe('Windows updates', () => {
  it('checks automatically, prevents duplicate downloads, and installs only when ready', () => {
    vi.useFakeTimers(); const updater = new Updater();
    const service = new UpdateService(updater, '0.3.0', 'https://example.com/feed');
    service.start(); vi.advanceTimersByTime(60_000);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    service.check(); service.install(); expect(updater.quitAndInstall).not.toHaveBeenCalled();
    updater.emit('update-available'); expect(service.getStatus().state).toBe('downloading');
    service.check(); expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    updater.emit('update-downloaded'); service.install(); expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
    service.dispose(); expect(updater.listenerCount('error')).toBe(0);
  });
  it('retries failed checks and handles current versions', () => {
    const updater = new Updater(); const service = new UpdateService(updater, '0.3.0', 'https://example.com/feed');
    updater.checkForUpdates.mockImplementationOnce(() => { throw new Error('offline'); });
    expect(service.check().state).toBe('error'); service.check(); updater.emit('update-not-available');
    expect(service.getStatus().state).toBe('current'); service.dispose();
  });
  it('does not try to update portable/development installations', () => {
    const service = new UpdateService(undefined, '0.3.0', '');
    expect(service.check().state).toBe('unsupported'); service.install(); service.dispose();
  });
});

describe('a build that cannot replace itself', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('reads the release feed and offers the download', async () => {
    const latest = vi.fn().mockResolvedValue({ downloadUrl: 'https://github.com/o/r/releases/tag/v1.0.2', version: 'v1.0.2' });
    const service = new UpdateService(undefined, '1.0.1', '', latest);

    // The button used to be greyed out on a Mac with no explanation at all.
    expect(service.check().state).toBe('checking');
    await settle();

    expect(service.getStatus()).toMatchObject({ availableVersion: 'v1.0.2', downloadUrl: 'https://github.com/o/r/releases/tag/v1.0.2', state: 'available' });
    service.dispose();
  });

  it('says the copy is current when the feed names the running version', async () => {
    const service = new UpdateService(undefined, '1.0.2', '', vi.fn().mockResolvedValue({ downloadUrl: 'https://github.com/o/r', version: 'v1.0.2' }));
    service.check();
    await settle();
    expect(service.getStatus().state).toBe('current');
    service.dispose();
  });

  it('reports an unreachable feed as an error rather than as being up to date', async () => {
    const service = new UpdateService(undefined, '1.0.1', '', vi.fn().mockRejectedValue(new Error('offline')));
    service.check();
    await settle();
    expect(service.getStatus().state).toBe('error');
    service.dispose();
  });

  it('orders versions by number, not by text', () => {
    expect(isNewerVersion('v1.0.10', '1.0.9')).toBe(true);
    expect(isNewerVersion('v1.0.2', '1.0.2')).toBe(false);
    expect(isNewerVersion('v0.9.9', '1.0.0')).toBe(false);
    expect(isNewerVersion('v1.1.0', '1.0.99')).toBe(true);
  });
});
