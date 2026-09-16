import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackupService } from '../database/backup-service';
import { CloudBackupService } from './cloud-backup-service';

const directories: string[] = [];

function setup(fetchImpl: typeof fetch) {
  const directory = mkdtempSync(join(tmpdir(), 'max-cloud-backup-'));
  directories.push(directory);
  const backups = new BackupService(':memory:', join(directory, 'backups'));
  return {
    backups,
    service: new CloudBackupService(backups, 'https://backup.example.test', join(directory, 'state.json'), fetchImpl),
  };
}

afterEach(() => {
  directories.splice(0).forEach((directory) => rmSync(directory, { force: true, recursive: true }));
});

describe('CloudBackupService', () => {
  it('creates the local snapshot first, uploads it with a short-lived token, and records success', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      const id = url.split('/').at(-1)!;
      const headers = new Headers(init?.headers);
      const bytes = init?.body as Uint8Array;
      return Promise.resolve(Response.json({ checksum: headers.get('X-Backup-Checksum'), id, ok: true, sizeBytes: bytes.byteLength, storedAt: '2026-08-31T01:00:00.000Z' }));
    });
    const { backups, service } = setup(fetchMock);

    const result = await service.create('short-lived-session', 'manual');

    expect(result.cloudBackup?.checksum).toBe(result.localBackup.checksum);
    expect(backups.listBackups()).toHaveLength(1);
    expect(service.getStatus().lastSuccessfulCloudBackupAt).toBe('2026-08-31T01:00:00.000Z');
    const requestHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(requestHeaders.get('Authorization')).toBe('Bearer short-lived-session');
  });

  it('keeps a successful local backup when the cloud is unavailable', async () => {
    const { backups, service } = setup(vi.fn(() => Promise.reject(new Error('offline'))));
    const result = await service.create('session', 'manual');
    // The report now names the step and the reason rather than only the reason.
    expect(result.cloudError).toBe('Cloud backup failed at step "upload": offline');
    expect(backups.listBackups().map(({ id }) => id)).toContain(result.localBackup.id);
    expect(service.getStatus().lastSuccessfulCloudBackupAt).toBeUndefined();
  });

  it('rejects malformed Worker list responses', async () => {
    const { service } = setup(vi.fn(() => Promise.resolve(Response.json({ backups: [{ id: '../other-user' }] }))));
    await expect(service.list('session')).rejects.toThrow('malformed backup metadata');
  });

  it('downloads, verifies, and routes a cloud snapshot through the existing safe restore path', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'max-cloud-source-'));
    directories.push(directory);
    const sourceBackups = new BackupService(':memory:', join(directory, 'source'));
    const source = sourceBackups.createBackup('manual');
    const bytes = readFileSync(source.filePath);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ backups: [{ checksum, createdAt: source.createdAt, id: 'cloud-safe', sizeBytes: bytes.byteLength, trigger: 'manual' }] }))
      .mockResolvedValueOnce(new Response(bytes, { status: 200 }));
    const { backups, service } = setup(fetchMock);

    const result = await service.restore('session', 'cloud-safe');
    expect(result.restored).toBe(true);
    expect(backups.listBackups().some(({ id }) => id === 'cloud-safe')).toBe(true);
  });

  it('runs at most one overdue scheduled backup and skips manual or non-overdue schedules', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      const id = url.split('/').at(-1)!;
      const headers = new Headers(init?.headers);
      const bytes = init?.body as Uint8Array;
      return Promise.resolve(Response.json({ checksum: headers.get('X-Backup-Checksum'), id, sizeBytes: bytes.byteLength, storedAt: new Date().toISOString() }));
    });
    const { service } = setup(fetchMock);
    expect(await service.runScheduled('session', 'manual')).toBeNull();
    expect(await service.runScheduled('session', 'daily')).not.toBeNull();
    expect(await service.runScheduled('session', 'daily')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('CloudBackupService diagnostics and the offline guarantee', () => {
  // The Worker address is passed explicitly rather than defaulted, because a
  // default parameter would swallow the `undefined` that the unconfigured case
  // is entirely about.
  function setupWithLog(fetchImpl: typeof fetch, workerUrl: string | undefined) {
    const directory = mkdtempSync(join(tmpdir(), 'max-cloud-backup-log-'));
    directories.push(directory);
    const backups = new BackupService(':memory:', join(directory, 'backups'));
    const lines: string[] = [];
    return {
      backups,
      lines,
      service: new CloudBackupService(backups, workerUrl, join(directory, 'state.json'), fetchImpl, (line) => lines.push(line)),
    };
  }

  it('makes no network request at all when no Max Cloud address is configured', async () => {
    const fetchMock = vi.fn();
    const { backups, service } = setupWithLog(fetchMock, undefined);
    expect(service.getStatus().configured).toBe(false);

    // The local backup still happens, and it is a real one.
    const result = await service.create('session', 'manual');
    expect(result.localBackup.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(backups.listBackups().map(({ id }) => id)).toContain(result.localBackup.id);
    expect(result.cloudError).toContain('not configured');
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(service.list('session')).rejects.toThrow('not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses without a token before it reaches the network, and says which step refused', async () => {
    const fetchMock = vi.fn();
    const { service } = setupWithLog(fetchMock, 'https://backup.example.test');

    await expect(service.list('')).rejects.toThrow('Sign in to use Max Cloud Backup.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(service.getStatus().lastSuccessfulCloudBackupAt).toBeUndefined();
  });

  it('downloads and checksum-verifies without touching the database', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'max-cloud-download-'));
    directories.push(directory);
    const sourceBackups = new BackupService(':memory:', join(directory, 'source'));
    const source = sourceBackups.createBackup('manual');
    const bytes = readFileSync(source.filePath);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ backups: [{ checksum, createdAt: source.createdAt, id: 'cloud-copy', sizeBytes: bytes.byteLength, trigger: 'manual' }] }))
      .mockResolvedValueOnce(new Response(bytes, { status: 200 }));
    const { backups, lines, service } = setupWithLog(fetchMock, 'https://backup.example.test');

    const downloaded = await service.download('session', 'cloud-copy');

    expect(downloaded.checksum).toBe(checksum);
    expect(backups.listBackups().some(({ id }) => id === 'cloud-copy')).toBe(true);
    expect(lines.some((line) => line.startsWith('checksum: matched'))).toBe(true);
  });

  it('stops a damaged download at the checksum, before anything reaches the database', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ backups: [{ checksum: 'b'.repeat(64), createdAt: '2026-09-01T00:00:00.000Z', id: 'damaged', sizeBytes: 3, trigger: 'manual' }] }))
      .mockResolvedValueOnce(new Response(new Uint8Array([9, 9, 9]), { status: 200 }));
    const { backups, service } = setupWithLog(fetchMock, 'https://backup.example.test');

    await expect(service.download('session', 'damaged')).rejects.toThrow(/checksum/i);
    expect(backups.listBackups().some(({ id }) => id === 'damaged')).toBe(false);
  });

  it('reports the step and the HTTP status a remote failure came back with', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ error: 'Storage quota exceeded' }, { status: 507 })));
    const { service, lines } = setupWithLog(fetchMock, 'https://backup.example.test');

    const result = await service.create('session', 'manual');

    expect(result.cloudError).toBe('Cloud backup failed at step "upload" (HTTP 507): Storage quota exceeded');
    expect(result.localBackup.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(lines.some((line) => line.includes('HTTP 507'))).toBe(true);
  });

  it('names the authenticate step when the Worker rejects the token', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ error: 'Authentication failed', reason: 'token-rejected' }, { status: 401 })));
    const { service } = setupWithLog(fetchMock, 'https://backup.example.test');

    await expect(service.list('expired-token')).rejects.toThrow(/Authentication failed/);
  });

  it('never writes a token into any diagnostic line', async () => {
    const secret = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1_000) + 60, sub: 'user_secret' })).toString('base64url')}.signature`;
    const fetchMock = vi.fn(() => Promise.reject(new Error('offline')));
    const { service, lines } = setupWithLog(fetchMock, 'https://backup.example.test');

    const result = await service.create(secret, 'manual');

    const everything = [...lines, result.cloudError ?? ''].join('\n');
    expect(everything).not.toContain(secret);
    expect(everything).not.toContain('user_secret');
    expect(everything).toContain('token=present');
    expect(everything).toContain('expiry=in');
  });
});
