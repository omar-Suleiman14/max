import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateService } from './update-service';

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
