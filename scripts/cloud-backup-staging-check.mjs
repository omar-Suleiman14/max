#!/usr/bin/env node
/**
 * Exercise the deployed Max Cloud Backup path for real.
 *
 * Every other cloud backup test runs against doubles, on purpose: an ordinary
 * pull request must never depend on Cloudflare or Clerk being up. This one is
 * the opposite. It runs only where real credentials exist, and it puts a small
 * object through the whole round trip so that a Worker which is deployed but
 * broken cannot sit there looking fine.
 *
 * It needs two things in the environment and refuses to guess at either:
 *
 *   MAX_STAGING_WORKER_URL      the https address of the staging Worker
 *   MAX_STAGING_SESSION_TOKEN   a Clerk session token for a staging account
 *
 * Nothing here prints the token, and the object it writes is named for this
 * run and deleted before it finishes.
 */

import { createHash, randomUUID } from 'node:crypto';

const workerUrl = (process.env.MAX_STAGING_WORKER_URL ?? '').trim().replace(/\/$/, '');
const sessionToken = (process.env.MAX_STAGING_SESSION_TOKEN ?? '').trim();

if (!workerUrl || !sessionToken) {
  console.error('Refusing to run: MAX_STAGING_WORKER_URL and MAX_STAGING_SESSION_TOKEN must both be set.');
  process.exit(2);
}
if (!/^https:\/\//i.test(workerUrl)) {
  console.error('Refusing to run: MAX_STAGING_WORKER_URL must be an https address.');
  process.exit(2);
}

/** A step that failed, said in one line that names the step and the status. */
class StagingFailure extends Error {
  constructor(step, reason, status) {
    super(`Staging check failed at step "${step}"${status === undefined ? '' : ` (HTTP ${status})`}: ${reason}`);
    this.step = step;
  }
}

const backupId = `staging-check-${randomUUID()}`;
const payload = Buffer.from(`max staging check ${new Date().toISOString()}\n`);
const checksum = createHash('sha256').update(payload).digest('hex');

function request(path, init = {}) {
  return fetch(`${workerUrl}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${sessionToken}` },
    signal: AbortSignal.timeout(25_000),
  });
}

async function step(name, run) {
  process.stdout.write(`${name} ... `);
  try {
    const result = await run();
    process.stdout.write('ok\n');
    return result;
  } catch (error) {
    process.stdout.write('failed\n');
    throw error instanceof StagingFailure
      ? error
      : new StagingFailure(name, error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  await step('health', async () => {
    const response = await fetch(`${workerUrl}/health`, { signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new StagingFailure('health', 'The Worker did not answer its health check.', response.status);
    const body = await response.json();
    if (body?.status !== 'ok') throw new StagingFailure('health', `The Worker reported status ${String(body?.status)}.`);
  });

  await step('authenticate', async () => {
    const response = await request('/v1/backups');
    if (response.status === 401 || response.status === 403) {
      const body = await response.json().catch(() => undefined);
      // The reason is the Worker's own, and never contains the token.
      throw new StagingFailure('authenticate', `The Worker rejected the staging token: ${body?.reason ?? 'no reason given'}.`, response.status);
    }
    if (!response.ok) throw new StagingFailure('authenticate', 'The Worker refused the listing request.', response.status);
  });

  await step('upload', async () => {
    const response = await request(`/v1/backups/${backupId}`, {
      body: payload,
      headers: { 'Content-Type': 'application/octet-stream', 'X-Backup-Checksum': checksum, 'X-Backup-Trigger': 'manual' },
      method: 'PUT',
    });
    if (!response.ok) throw new StagingFailure('upload', 'The Worker refused the upload.', response.status);
    const body = await response.json();
    if (body?.id !== backupId || body?.checksum !== checksum) {
      throw new StagingFailure('upload', 'The Worker described a different backup than the one that was sent.');
    }
  });

  await step('list', async () => {
    const response = await request('/v1/backups');
    if (!response.ok) throw new StagingFailure('list', 'The Worker refused the listing request.', response.status);
    const body = await response.json();
    const found = Array.isArray(body?.backups) && body.backups.some((backup) => backup?.id === backupId);
    if (!found) throw new StagingFailure('list', 'The backup just uploaded is not in the listing.');
  });

  await step('download', async () => {
    const response = await request(`/v1/backups/${backupId}`);
    if (!response.ok) throw new StagingFailure('download', 'The Worker refused the download.', response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    const downloadedChecksum = createHash('sha256').update(bytes).digest('hex');
    if (downloadedChecksum !== checksum) {
      throw new StagingFailure('checksum', 'The downloaded bytes are not the bytes that were uploaded.');
    }
  });
}

let failure;
try {
  await main();
} catch (error) {
  failure = error;
} finally {
  // Clean up whatever happened, so a failed run does not leave objects behind.
  try {
    await request(`/v1/backups/${backupId}`, { method: 'DELETE' });
  } catch {
    console.error(`Could not remove the staging object ${backupId}. Remove it by hand.`);
  }
}

if (failure) {
  console.error(String(failure.message));
  process.exit(1);
}

console.log('Max Cloud Backup staging check passed: health, authenticate, upload, list, download, checksum.');
