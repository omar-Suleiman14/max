import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackupService } from '../database/backup-service';
import { CloudBackupService } from './cloud-backup-service';

/**
 * Every way the cloud path can fail, and what the desktop does about it.
 *
 * The rule each of these holds to is the same: a cloud failure is allowed to
 * lose a cloud backup and nothing else. The local backup stands, the database
 * is untouched, and the reported line says which of the fourteen steps gave up
 * and what the remote said, without ever carrying a token.
 *
 * `fetch` is injected, so none of this reaches a network.
 */

const directories: string[] = [];

function setup(fetchImpl: typeof fetch, workerUrl: string | undefined = 'https://backup.example.test') {
  const directory = mkdtempSync(join(tmpdir(), 'max-cloud-failure-'));
  directories.push(directory);
  const backups = new BackupService(':memory:', join(directory, 'backups'));
  const lines: string[] = [];
  return {
    backups,
    lines,
    service: new CloudBackupService(backups, workerUrl, join(directory, 'state.json'), fetchImpl, (line) => lines.push(line)),
  };
}

/** A real backup, and the listing entry that honestly describes it. */
function realBackup() {
  const directory = mkdtempSync(join(tmpdir(), 'max-cloud-source-'));
  directories.push(directory);
  const source = new BackupService(':memory:', join(directory, 'source')).createBackup('manual');
  const bytes = readFileSync(source.filePath);
  return {
    bytes,
    listing: {
      checksum: createHash('sha256').update(bytes).digest('hex'),
      createdAt: source.createdAt,
      id: 'cloud-copy',
      sizeBytes: bytes.byteLength,
      trigger: 'manual',
    },
  };
}

afterEach(() => {
  directories.splice(0).forEach((directory) => rmSync(directory, { force: true, recursive: true }));
});

describe('a cloud backup that cannot reach the Worker', () => {
  it('gives up after twenty-five seconds and says so in plain words', async () => {
    // What `AbortSignal.timeout` throws, which is the only thing the service
    // ever sees of a request that never came back.
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    const { backups, service } = setup(vi.fn(() => Promise.reject(timeout)));

    const result = await service.create('session', 'manual');

    expect(result.cloudError).toBe('Cloud backup failed at step "upload": Max Cloud Backup did not answer within 25 seconds.');
    // A timeout is a cloud failure, so the local backup is still a real one.
    expect(backups.listBackups().map(({ id }) => id)).toContain(result.localBackup.id);
    expect(service.getStatus().lastSuccessfulCloudBackupAt).toBeUndefined();
  });

  it('names the step that was reaching out when the connection failed', async () => {
    const { service } = setup(vi.fn(() => Promise.reject(new Error('getaddrinfo ENOTFOUND'))));

    await expect(service.list('session')).rejects.toThrow('Cloud backup failed at step "list": getaddrinfo ENOTFOUND');
  });

  it('refuses a token so long it cannot be a token, before reaching the network', async () => {
    const fetchMock = vi.fn();
    const { service } = setup(fetchMock);

    await expect(service.list('t'.repeat(16_385))).rejects.toThrow('Sign in to use Max Cloud Backup.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('a Worker that answers, but not with what was asked for', () => {
  it('reports a failed listing with its status rather than an empty list', async () => {
    const { service } = setup(vi.fn(() => Promise.resolve(Response.json({ error: 'Backup storage is unavailable.' }, { status: 503 }))));

    await expect(service.list('session')).rejects.toThrow('Cloud backup failed at step "list" (HTTP 503): Backup storage is unavailable.');
  });

  it('rejects a listing whose shape is wrong outright', async () => {
    const { service } = setup(vi.fn(() => Promise.resolve(Response.json({ backups: 'all of them' }))));

    await expect(service.list('session')).rejects.toThrow('malformed list');
  });

  it.each([
    ['an identifier that is a path', { checksum: 'a'.repeat(64), createdAt: '2026-09-01T00:00:00.000Z', id: '../other-user', sizeBytes: 12, trigger: 'manual' }],
    ['a checksum that is not one', { checksum: 'not-a-checksum', createdAt: '2026-09-01T00:00:00.000Z', id: 'ok-id', sizeBytes: 12, trigger: 'manual' }],
    ['a date that is not one', { checksum: 'a'.repeat(64), createdAt: 'whenever', id: 'ok-id', sizeBytes: 12, trigger: 'manual' }],
    ['a size of nothing', { checksum: 'a'.repeat(64), createdAt: '2026-09-01T00:00:00.000Z', id: 'ok-id', sizeBytes: 0, trigger: 'manual' }],
    ['a trigger Max does not have', { checksum: 'a'.repeat(64), createdAt: '2026-09-01T00:00:00.000Z', id: 'ok-id', sizeBytes: 12, trigger: 'whenever-it-feels-like-it' }],
  ])('refuses a listing entry carrying %s', async (_what, entry) => {
    const { service } = setup(vi.fn(() => Promise.resolve(Response.json({ backups: [entry] }))));

    // parseBackup has to reject these rather than let a malformed entry through
    // and become a request for somebody else's object.
    await expect(service.list('session')).rejects.toThrow('malformed backup metadata');
  });

  it('refuses an upload result that does not describe the backup that was sent', async () => {
    const { backups, service } = setup(vi.fn(() => Promise.resolve(Response.json({
      checksum: 'a'.repeat(64), id: 'some-other-backup', ok: true, sizeBytes: 12, storedAt: '2026-09-01T00:00:00.000Z',
    }))));

    const result = await service.create('session', 'manual');

    expect(result.cloudError).toContain('malformed upload result');
    expect(result.cloudBackup).toBeUndefined();
    expect(backups.listBackups().map(({ id }) => id)).toContain(result.localBackup.id);
    expect(service.getStatus().lastSuccessfulCloudBackupAt).toBeUndefined();
  });

  it('reports an upload the Worker refused, keeping the local backup', async () => {
    const { backups, service } = setup(vi.fn(() => Promise.resolve(Response.json({ error: 'Empty backup payload' }, { status: 400 }))));

    const result = await service.create('session', 'manual');

    expect(result.cloudError).toBe('Cloud backup failed at step "upload" (HTTP 400): Empty backup payload');
    expect(backups.listBackups()).toHaveLength(1);
  });

  it('reports a rejected token as an authentication failure whatever step asked', async () => {
    const { service } = setup(vi.fn(() => Promise.resolve(Response.json({ error: 'Authentication failed', reason: 'token-rejected' }, { status: 401 }))));

    // The Worker answers 401 to the upload, and the report says authenticate
    // rather than upload, because signing in again is what would fix it.
    const result = await service.create('an-expired-token', 'manual');
    expect(result.cloudError).toContain('"authenticate"');

    await expect(service.download('an-expired-token', 'anything')).rejects.toThrow(/authenticate/);
  });
});

describe('downloading and restoring, when something is wrong with the copy', () => {
  it('refuses an identifier that could address another person’s object, before any request', async () => {
    const fetchMock = vi.fn();
    const { service } = setup(fetchMock);

    await expect(service.download('session', '../someone-else')).rejects.toThrow('Invalid cloud backup identifier.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says a backup is not there when the listing does not hold it', async () => {
    const { service } = setup(vi.fn(() => Promise.resolve(Response.json({ backups: [] }))));

    await expect(service.download('session', 'not-in-the-listing')).rejects.toThrow('Cloud backup not found.');
  });

  it('reports a download the Worker refused, without importing anything', async () => {
    const { listing } = realBackup();
    const { backups, service } = setup(vi.fn()
      .mockResolvedValueOnce(Response.json({ backups: [listing] }))
      .mockResolvedValueOnce(Response.json({ error: 'Backup not found' }, { status: 404 })));

    await expect(service.download('session', 'cloud-copy')).rejects.toThrow('Cloud backup failed at step "download" (HTTP 404): Backup not found');
    expect(backups.listBackups()).toHaveLength(0);
  });

  it('leaves the database exactly as it was when the downloaded bytes are damaged', async () => {
    const { bytes, listing } = realBackup();
    const damaged = new Uint8Array(bytes);
    damaged[damaged.length - 1] = (damaged.at(-1)! + 1) % 256;
    const { backups, service } = setup(vi.fn()
      .mockResolvedValueOnce(Response.json({ backups: [listing] }))
      .mockResolvedValueOnce(new Response(damaged, { status: 200 })));
    const before = backups.listBackups();

    await expect(service.restore('session', 'cloud-copy')).rejects.toThrow(/checksum/i);

    // Restore is the one operation that overwrites the workspace, so a copy
    // that failed its checksum must never have reached it.
    expect(backups.listBackups()).toEqual(before);
  });

  it('names the restore step when the local restore itself fails', async () => {
    const { bytes, listing } = realBackup();
    const { backups, service } = setup(vi.fn()
      .mockResolvedValueOnce(Response.json({ backups: [listing] }))
      .mockResolvedValueOnce(new Response(bytes, { status: 200 })));
    vi.spyOn(backups, 'restoreBackup').mockImplementation(() => { throw new Error('The workspace is open elsewhere.'); });

    await expect(service.restore('session', 'cloud-copy')).rejects.toThrow('Cloud backup failed at step "restore": The workspace is open elsewhere.');
    // The downloaded copy is still on this machine, so it can be tried again.
    expect(backups.listBackups().some(({ id }) => id === 'cloud-copy')).toBe(true);
  });
});

describe('the scheduled cloud backup', () => {
  it('does nothing at all for a manual schedule', async () => {
    const fetchMock = vi.fn();
    const { service } = setup(fetchMock);

    expect(await service.runScheduled('session', 'manual')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['daily', 2 * 60 * 60 * 1_000, 25 * 60 * 60 * 1_000],
    ['weekly', 2 * 24 * 60 * 60 * 1_000, 8 * 24 * 60 * 60 * 1_000],
  ] as const)('skips a %s run that is not due yet and takes one that is', async (schedule, recently, longAgo) => {
    const succeed = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      const headers = new Headers(init?.headers);
      return Promise.resolve(Response.json({
        checksum: headers.get('X-Backup-Checksum'), id: url.split('/').at(-1), ok: true,
        sizeBytes: (init?.body as Uint8Array).byteLength, storedAt: new Date().toISOString(),
      }));
    });
    const { service } = setup(succeed);

    // A first run establishes when the last success was.
    expect(await service.runScheduled('session', schedule)).not.toBeNull();
    const callsAfterFirst = succeed.mock.calls.length;

    vi.setSystemTime(new Date(Date.now() + recently));
    expect(await service.runScheduled('session', schedule)).toBeNull();
    expect(succeed.mock.calls).toHaveLength(callsAfterFirst);

    vi.setSystemTime(new Date(Date.now() + longAgo));
    expect(await service.runScheduled('session', schedule)).not.toBeNull();
    expect(succeed.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    vi.useRealTimers();
  });

  it('still leaves a local backup when a scheduled cloud run fails', async () => {
    const { backups, service } = setup(vi.fn(() => Promise.reject(new Error('offline'))));

    const result = await service.runScheduled('session', 'daily');

    expect(result?.cloudError).toContain('offline');
    expect(backups.listBackups()).toHaveLength(1);
    // A failed run must not record a success, or the next one would be skipped.
    expect(service.getStatus().lastSuccessfulCloudBackupAt).toBeUndefined();
  });
});
