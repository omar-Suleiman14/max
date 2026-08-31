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
    expect(result.cloudError).toBe('offline');
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
