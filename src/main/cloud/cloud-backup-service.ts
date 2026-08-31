import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type {
  BackupTrigger,
  CloudBackupCreateResult,
  CloudBackupMetadata,
  CloudBackupStatus,
  RestoreResult,
} from '../../shared/backup-contract';
import type { BackupService } from '../database/backup-service';
import { ObjectDomainError } from '../database/object-repository';

type Fetch = typeof fetch;

const backupTriggers: readonly BackupTrigger[] = ['daily', 'manual', 'pre-delete', 'pre-restore', 'weekly'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBackup(value: unknown): CloudBackupMetadata {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id)
    || typeof value.checksum !== 'string' || !/^[a-f0-9]{64}$/i.test(value.checksum)
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
    || typeof value.sizeBytes !== 'number' || !Number.isFinite(value.sizeBytes) || value.sizeBytes < 1
    || typeof value.trigger !== 'string' || !backupTriggers.includes(value.trigger as BackupTrigger)) {
    throw new ObjectDomainError('invalid-input', 'Cloud backup service returned malformed backup metadata.');
  }
  return {
    checksum: value.checksum,
    createdAt: value.createdAt,
    id: value.id,
    sizeBytes: value.sizeBytes,
    trigger: value.trigger as BackupTrigger,
  };
}

function cleanRemoteError(value: unknown): string {
  if (isRecord(value) && typeof value.error === 'string') return value.error.slice(0, 240);
  return 'Cloud backup request failed.';
}

export class CloudBackupService {
  readonly #workerUrl?: string;

  constructor(
    private readonly backups: BackupService,
    workerUrl: string | undefined,
    private readonly statePath: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {
    const normalized = workerUrl?.trim().replace(/\/$/, '');
    this.#workerUrl = normalized && /^https:\/\//i.test(normalized) ? normalized : undefined;
  }

  getStatus(): CloudBackupStatus {
    let lastSuccessfulCloudBackupAt: string | undefined;
    try {
      if (existsSync(this.statePath)) {
        const state = JSON.parse(readFileSync(this.statePath, 'utf-8')) as unknown;
        if (isRecord(state) && typeof state.lastSuccessfulCloudBackupAt === 'string') {
          lastSuccessfulCloudBackupAt = state.lastSuccessfulCloudBackupAt;
        }
      }
    } catch {
      // A damaged optional status file must never affect local Max.
    }
    return { configured: Boolean(this.#workerUrl), lastSuccessfulCloudBackupAt };
  }

  async create(sessionToken: string, trigger: BackupTrigger = 'manual'): Promise<CloudBackupCreateResult> {
    const localBackup = this.backups.createBackup(trigger);
    try {
      const cloudBackup = await this.#upload(sessionToken, localBackup);
      this.#recordSuccess(cloudBackup.createdAt);
      return { cloudBackup, localBackup };
    } catch (error) {
      return {
        cloudError: error instanceof Error ? error.message : 'Cloud backup failed.',
        localBackup,
      };
    }
  }

  async list(sessionToken: string): Promise<readonly CloudBackupMetadata[]> {
    const response = await this.#request('/v1/backups', sessionToken);
    const body: unknown = await response.json();
    if (!response.ok) throw new ObjectDomainError('invalid-input', cleanRemoteError(body));
    if (!isRecord(body) || !Array.isArray(body.backups)) {
      throw new ObjectDomainError('invalid-input', 'Cloud backup service returned a malformed list.');
    }
    return body.backups.map(parseBackup);
  }

  async restore(sessionToken: string, backupId: string): Promise<RestoreResult> {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(backupId)) throw new ObjectDomainError('invalid-input', 'Invalid cloud backup identifier.');
    const metadata = (await this.list(sessionToken)).find(({ id }) => id === backupId);
    if (!metadata) throw new ObjectDomainError('not-found', 'Cloud backup not found.');
    const response = await this.#request(`/v1/backups/${backupId}`, sessionToken);
    if (!response.ok) {
      let body: unknown;
      try { body = await response.json(); } catch { body = undefined; }
      throw new ObjectDomainError('invalid-input', cleanRemoteError(body));
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const downloaded = this.backups.importDownloadedBackup({
      bytes,
      checksum: metadata.checksum,
      createdAt: metadata.createdAt,
      id: metadata.id,
      trigger: metadata.trigger,
    });
    return this.backups.restoreBackup(downloaded.filePath);
  }

  async runScheduled(sessionToken: string, schedule: 'daily' | 'manual' | 'weekly'): Promise<CloudBackupCreateResult | null> {
    if (schedule === 'manual') return null;
    const last = this.getStatus().lastSuccessfulCloudBackupAt;
    const interval = schedule === 'daily' ? 24 * 60 * 60 * 1_000 : 7 * 24 * 60 * 60 * 1_000;
    if (last && Date.now() - Date.parse(last) < interval) return null;
    return this.create(sessionToken, schedule);
  }

  async #upload(sessionToken: string, localBackup: ReturnType<BackupService['createBackup']>): Promise<CloudBackupMetadata> {
    const response = await this.#request(`/v1/backups/${localBackup.id}`, sessionToken, {
      body: readFileSync(localBackup.filePath),
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Backup-Checksum': localBackup.checksum,
        'X-Backup-Trigger': localBackup.trigger,
      },
      method: 'PUT',
    });
    let body: unknown;
    try { body = await response.json(); } catch { body = undefined; }
    if (!response.ok) throw new ObjectDomainError('invalid-input', cleanRemoteError(body));
    if (!isRecord(body) || body.id !== localBackup.id || body.checksum !== localBackup.checksum
      || typeof body.sizeBytes !== 'number' || typeof body.storedAt !== 'string') {
      throw new ObjectDomainError('invalid-input', 'Cloud backup service returned a malformed upload result.');
    }
    return parseBackup({
      checksum: body.checksum,
      createdAt: body.storedAt,
      id: body.id,
      sizeBytes: body.sizeBytes,
      trigger: localBackup.trigger,
    });
  }

  async #request(path: string, sessionToken: string, init: RequestInit = {}): Promise<Response> {
    if (!this.#workerUrl) throw new ObjectDomainError('invalid-input', 'Max Cloud Backup is not configured in this build.');
    if (!sessionToken || sessionToken.length > 16_384) throw new ObjectDomainError('invalid-input', 'Sign in to use Max Cloud Backup.');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${sessionToken}`);
    return this.fetchImpl(`${this.#workerUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(25_000) });
  }

  #recordSuccess(timestamp: string): void {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify({ lastSuccessfulCloudBackupAt: timestamp }), 'utf-8');
  }
}
