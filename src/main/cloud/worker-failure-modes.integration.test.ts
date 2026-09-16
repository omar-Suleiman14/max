import { describe, expect, it } from 'vitest';

import { envWith, memoryBucket, nobodyIsAuthenticated, workerWith } from './worker.fixture';

/**
 * What the backup Worker does when something goes wrong, rather than when
 * everything works.
 *
 * All of it runs with no Cloudflare account, no Clerk keys and no network: R2
 * is an in-memory double that can be told to fail, and the authenticator is
 * injected. An ordinary pull request must never depend on either service being
 * up.
 */

const prefix = 'users/owner/backups/';

function put(id: string, body: Uint8Array = new Uint8Array([1, 2, 3])): Request {
  return new Request(`https://worker.test/v1/backups/${id}`, {
    body,
    headers: { Authorization: 'Bearer owner', 'X-Backup-Checksum': 'a'.repeat(64), 'X-Backup-Trigger': 'manual' },
    method: 'PUT',
  });
}

function get(path: string): Request {
  return new Request(`https://worker.test${path}`, { headers: { Authorization: 'Bearer owner' } });
}

function remove(id: string): Request {
  return new Request(`https://worker.test/v1/backups/${id}`, { headers: { Authorization: 'Bearer owner' }, method: 'DELETE' });
}

/** Thirty backups already stored, an hour apart, oldest first. */
function bucketHoldingThirty() {
  const memory = memoryBucket();
  for (let index = 0; index < 30; index += 1) {
    memory.seed(`${prefix}backup-${String(index).padStart(2, '0')}.maxbak`, { uploaded: new Date(Date.UTC(2026, 7, 31, index)) });
  }
  return memory;
}

describe('the Worker refusing a request it should not serve', () => {
  it('refuses every backup route when authentication fails, and says which check failed', async () => {
    const worker = workerWith(nobodyIsAuthenticated);
    const env = envWith(memoryBucket().bucket);

    for (const request of [get('/v1/backups'), get('/v1/backups/some-id'), put('some-id'), remove('some-id')]) {
      const response = await worker.fetch(request, env);
      expect(response.status).toBe(401);
      expect((await response.json() as { reason: string }).reason).toBe('token-rejected');
    }
  });

  it('serves the health check without authentication, because that is what it is for', async () => {
    const response = await workerWith(nobodyIsAuthenticated).fetch(get('/health'), envWith(memoryBucket().bucket));

    expect(response.status).toBe(200);
    expect((await response.json() as { status: string }).status).toBe('ok');
  });

  it.each([
    ['a path separator in it', '..%2Fescape'],
    ['characters an R2 key may not carry', 'has spaces'],
    ['more than a hundred characters', 'a'.repeat(101)],
  ])('refuses an identifier with %s rather than turning it into a key', async (_why, id) => {
    const { bucket, keys } = memoryBucket();
    const env = envWith(bucket);
    const worker = workerWith();

    const upload = await worker.fetch(put(id), env);
    const download = await worker.fetch(get(`/v1/backups/${id}`), env);

    expect(upload.status).toBe(400);
    expect(download.status).toBe(400);
    expect(keys()).toEqual([]);
  });

  it('refuses an upload with no bytes in it', async () => {
    const { bucket, keys } = memoryBucket();

    const response = await workerWith().fetch(put('empty-backup', new Uint8Array()), envWith(bucket));

    expect(response.status).toBe(400);
    expect((await response.json() as { error: string }).error).toBe('Empty backup payload');
    expect(keys()).toEqual([]);
  });

  it('answers 404 for a backup that is not there, rather than an empty success', async () => {
    const response = await workerWith().fetch(get('/v1/backups/never-uploaded'), envWith(memoryBucket().bucket));

    expect(response.status).toBe(404);
    expect((await response.json() as { error: string }).error).toBe('Backup not found');
  });

  it('answers 404 for a route it does not serve', async () => {
    const response = await workerWith().fetch(get('/v1/something-else'), envWith(memoryBucket().bucket));

    expect(response.status).toBe(404);
  });
});

describe('the Worker when R2 itself is failing', () => {
  it.each([
    ['listing', 'list', () => get('/v1/backups'), 'list'],
    ['storing', 'put', () => put('a-backup'), 'put'],
    ['reading', 'get', () => get('/v1/backups/a-backup'), 'get'],
    ['deleting', 'delete', () => remove('a-backup'), 'delete'],
  ] as const)('answers rather than crashing when %s fails, and names the operation', async (_what, fault, makeRequest, operation) => {
    const { bucket, fail } = memoryBucket();
    fail(fault);

    // Left unhandled these threw, so a desktop Max received an exception with
    // no body and no way to tell "your backup was not stored" apart from "the
    // request never arrived".
    const response = await workerWith().fetch(makeRequest(), envWith(bucket));

    expect(response.status).toBe(503);
    const body = await response.json() as { error: string; operation: string };
    expect(body.error).toBe('Backup storage is unavailable.');
    expect(body.operation).toBe(operation);
  });

  it('reports an upload as failed when trimming old backups fails, rather than claiming success', async () => {
    const memory = bucketHoldingThirty();
    const stored = memory.keys().length;
    memory.fail('delete');

    // The bytes are in R2 by this point, but the answer must not say the
    // backup is safely stored when the Worker could not finish the write it
    // committed to.
    const response = await workerWith().fetch(put('backup-30'), envWith(memory.bucket));

    expect(response.status).toBe(503);
    expect((await response.json() as { operation: string }).operation).toBe('retention-delete');
    expect(memory.keys().length).toBe(stored + 1);
  });

  it('does not reveal anything about the storage failure beyond the operation', async () => {
    const { bucket, fail } = memoryBucket();
    fail('get');

    const body = await (await workerWith().fetch(get('/v1/backups/a-backup'), envWith(bucket))).text();

    // The double throws `R2 get failed`; that message is the bucket's, not the
    // caller's business, and must not be passed through.
    expect(body).not.toContain('R2 get failed');
  });
});

describe('the Worker keeping the newest thirty backups', () => {
  it('keeps all thirty when the thirtieth arrives', async () => {
    const memory = memoryBucket();
    for (let index = 0; index < 29; index += 1) {
      memory.seed(`${prefix}backup-${String(index).padStart(2, '0')}.maxbak`, { uploaded: new Date(Date.UTC(2026, 7, 31, index)) });
    }

    const response = await workerWith().fetch(put('backup-29'), envWith(memory.bucket));

    expect(response.status).toBe(200);
    expect(memory.keys()).toHaveLength(30);
    expect(memory.keys()).toContain(`${prefix}backup-00.maxbak`);
  });

  it('trims the oldest when the thirty-first arrives', async () => {
    const memory = bucketHoldingThirty();

    const response = await workerWith().fetch(put('backup-30'), envWith(memory.bucket));

    expect(response.status).toBe(200);
    expect(memory.keys()).toHaveLength(30);
    // The one seeded at the earliest hour is the one that goes.
    expect(memory.keys()).not.toContain(`${prefix}backup-00.maxbak`);
    expect(memory.keys()).toContain(`${prefix}backup-30.maxbak`);
  });

  it('trims the caller’s own backups and never another person’s', async () => {
    const memory = bucketHoldingThirty();
    memory.seed('users/someone-else/backups/theirs.maxbak', { uploaded: new Date(Date.UTC(2020, 0, 1)) });

    await workerWith().fetch(put('backup-30'), envWith(memory.bucket));

    // Theirs is older than everything here, so a trim that ignored the prefix
    // would take somebody else's backup first.
    expect(memory.keys()).toContain('users/someone-else/backups/theirs.maxbak');
  });
});
