import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type {
  BackupMetadata,
  BackupTrigger,
  CloudBackupCreateResult,
  CloudBackupMetadata,
  CloudBackupStatus,
  CloudBackupStep,
  RestoreResult,
} from '../../shared/backup-contract';
import type { BackupService } from '../database/backup-service';
import {
  CloudBackupError,
  consoleCloudBackupLogger,
  describeToken,
  formatTokenDescription,
  type CloudBackupLogger,
} from './cloud-backup-diagnostics';

type Fetch = typeof fetch;

const backupTriggers: readonly BackupTrigger[] = ['daily', 'manual', 'pre-delete', 'pre-migration', 'pre-restore', 'weekly'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBackup(value: unknown): CloudBackupMetadata {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id)
    || typeof value.checksum !== 'string' || !/^[a-f0-9]{64}$/i.test(value.checksum)
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
    || typeof value.sizeBytes !== 'number' || !Number.isFinite(value.sizeBytes) || value.sizeBytes < 1
    || typeof value.trigger !== 'string' || !backupTriggers.includes(value.trigger as BackupTrigger)) {
    throw new CloudBackupError('list', 'Cloud backup service returned malformed backup metadata.');
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

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return undefined; }
}

export class CloudBackupService {
  readonly #logger: CloudBackupLogger;
  readonly #workerUrl?: string;

  constructor(
    private readonly backups: BackupService,
    workerUrl: string | undefined,
    private readonly statePath: string,
    private readonly fetchImpl: Fetch = fetch,
    logger: CloudBackupLogger = consoleCloudBackupLogger,
  ) {
    const normalized = workerUrl?.trim().replace(/\/$/, '');
    this.#workerUrl = normalized && /^https:\/\//i.test(normalized) ? normalized : undefined;
    this.#logger = logger;
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

  /**
   * Create a local backup first, then try to put it in the cloud. The local
   * backup is the one that matters, so a cloud failure is reported alongside a
   * valid local backup rather than thrown over the top of it.
   */
  async create(sessionToken: string, trigger: BackupTrigger = 'manual'): Promise<CloudBackupCreateResult> {
    const localBackup = this.backups.createBackup(trigger);
    this.#log('local-backup', `created id=${localBackup.id} bytes=${localBackup.sizeBytes}`);
    try {
      const cloudBackup = await this.#upload(sessionToken, localBackup);
      this.#recordSuccess(cloudBackup.createdAt);
      this.#log('upload', `stored id=${cloudBackup.id} bytes=${cloudBackup.sizeBytes}`);
      return { cloudBackup, localBackup };
    } catch (error) {
      return { cloudError: this.#report(error, 'upload'), localBackup };
    }
  }

  async list(sessionToken: string): Promise<readonly CloudBackupMetadata[]> {
    const response = await this.#request('list', '/v1/backups', sessionToken);
    const body = await readJson(response);
    if (!response.ok) throw new CloudBackupError('list', cleanRemoteError(body), response.status);
    if (!isRecord(body) || !Array.isArray(body.backups)) {
      throw new CloudBackupError('list', 'Cloud backup service returned a malformed list.', response.status);
    }
    const backups = body.backups.map(parseBackup);
    this.#log('list', `returned ${backups.length} backup(s)`);
    return backups;
  }

  /**
   * Fetch a cloud backup onto this machine and put it in the local backup list,
   * without touching the database. Downloading and restoring are separate on
   * purpose: a person can take a copy, check it, and only then decide to
   * overwrite what they have.
   */
  async download(sessionToken: string, backupId: string): Promise<BackupMetadata> {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(backupId)) {
      throw new CloudBackupError('download', 'Invalid cloud backup identifier.');
    }
    const metadata = (await this.list(sessionToken)).find(({ id }) => id === backupId);
    if (!metadata) throw new CloudBackupError('download', 'Cloud backup not found.', 404);

    const response = await this.#request('download', `/v1/backups/${backupId}`, sessionToken);
    if (!response.ok) {
      throw new CloudBackupError('download', cleanRemoteError(await readJson(response)), response.status);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    this.#log('download', `received id=${backupId} bytes=${bytes.byteLength}`);

    try {
      // importDownloadedBackup rejects the bytes unless they hash to the
      // checksum the listing promised, so a damaged download stops here rather
      // than reaching the database.
      const imported = this.backups.importDownloadedBackup({
        bytes,
        checksum: metadata.checksum,
        createdAt: metadata.createdAt,
        id: metadata.id,
        trigger: metadata.trigger,
      });
      this.#log('checksum', `matched id=${backupId}`);
      return imported;
    } catch (error) {
      throw new CloudBackupError('checksum', error instanceof Error ? error.message : 'Downloaded cloud backup failed checksum verification.');
    }
  }

  /** Download the backup, then restore it through the local restore path. */
  async restore(sessionToken: string, backupId: string): Promise<RestoreResult> {
    const downloaded = await this.download(sessionToken, backupId);
    try {
      const result = this.backups.restoreBackup(downloaded.filePath);
      this.#log('restore', `restored=${result.restored} rolledBack=${result.safetyRollbackOccurred}`);
      return result;
    } catch (error) {
      throw new CloudBackupError('restore', error instanceof Error ? error.message : 'Restoring the downloaded backup failed.');
    }
  }

  async runScheduled(sessionToken: string, schedule: 'daily' | 'manual' | 'weekly'): Promise<CloudBackupCreateResult | null> {
    if (schedule === 'manual') return null;
    const last = this.getStatus().lastSuccessfulCloudBackupAt;
    const interval = schedule === 'daily' ? 24 * 60 * 60 * 1_000 : 7 * 24 * 60 * 60 * 1_000;
    if (last && Date.now() - Date.parse(last) < interval) {
      this.#log('schedule', `skipped ${schedule}: last success ${last}`);
      return null;
    }
    this.#log('schedule', `running ${schedule}`);
    return this.create(sessionToken, schedule);
  }

  async #upload(sessionToken: string, localBackup: BackupMetadata): Promise<CloudBackupMetadata> {
    const response = await this.#request('upload', `/v1/backups/${localBackup.id}`, sessionToken, {
      body: readFileSync(localBackup.filePath),
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Backup-Checksum': localBackup.checksum,
        'X-Backup-Trigger': localBackup.trigger,
      },
      method: 'PUT',
    });
    const body = await readJson(response);
    if (!response.ok) throw new CloudBackupError('upload', cleanRemoteError(body), response.status);
    if (!isRecord(body) || body.id !== localBackup.id || body.checksum !== localBackup.checksum
      || typeof body.sizeBytes !== 'number' || typeof body.storedAt !== 'string') {
      throw new CloudBackupError('upload', 'Cloud backup service returned a malformed upload result.', response.status);
    }
    return parseBackup({
      checksum: body.checksum,
      createdAt: body.storedAt,
      id: body.id,
      sizeBytes: body.sizeBytes,
      trigger: localBackup.trigger,
    });
  }

  async #request(step: CloudBackupStep, path: string, sessionToken: string, init: RequestInit = {}): Promise<Response> {
    if (!this.#workerUrl) throw new CloudBackupError(step, 'Max Cloud Backup is not configured in this build.');

    const token = describeToken(sessionToken);
    if (!sessionToken || sessionToken.length > 16_384) {
      this.#log('authenticate', `refused: ${formatTokenDescription(token)}`);
      throw new CloudBackupError('authenticate', 'Sign in to use Max Cloud Backup.');
    }
    this.#log('authenticate', formatTokenDescription(token));

    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${sessionToken}`);
    try {
      const response = await this.fetchImpl(`${this.#workerUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(25_000) });
      if (response.status === 401 || response.status === 403) {
        throw new CloudBackupError('authenticate', cleanRemoteError(await readJson(response)), response.status);
      }
      return response;
    } catch (error) {
      if (error instanceof CloudBackupError) throw error;
      const reason = error instanceof Error && error.name === 'TimeoutError'
        ? 'Max Cloud Backup did not answer within 25 seconds.'
        : error instanceof Error ? error.message : 'Could not reach Max Cloud Backup.';
      throw new CloudBackupError(step, reason);
    }
  }

  /** Turn any failure into one redacted line, log it, and return it. */
  #report(error: unknown, fallbackStep: CloudBackupStep): string {
    const described = error instanceof CloudBackupError
      ? error
      : new CloudBackupError(fallbackStep, error instanceof Error ? error.message : 'Cloud backup failed.');
    this.#log(described.step, described.describe());
    return described.describe();
  }

  #log(step: CloudBackupStep, line: string): void {
    this.#logger(`${step}: ${line}`);
  }

  #recordSuccess(timestamp: string): void {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify({ lastSuccessfulCloudBackupAt: timestamp }), 'utf-8');
  }
}
