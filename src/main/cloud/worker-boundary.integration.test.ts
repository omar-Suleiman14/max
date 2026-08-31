import { describe, expect, it } from 'vitest';

import { createWorker, type Env, type R2Bucket, type R2ObjectMetadata } from '../../../worker/src/index';

function memoryBucket() {
  const objects = new Map<string, { bytes: Uint8Array; metadata: R2ObjectMetadata }>();
  const bucket: R2Bucket = {
    delete: (keys) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
      return Promise.resolve();
    },
    get: (key) => {
      const stored = objects.get(key);
      if (!stored) return Promise.resolve(null);
      return Promise.resolve({ ...stored.metadata, body: new Blob([stored.bytes]).stream() });
    },
    list: ({ prefix = '' } = {}) => Promise.resolve({ objects: [...objects.values()].map(({ metadata }) => metadata).filter(({ key }) => key.startsWith(prefix)), truncated: false }),
    put: (key, value, options) => {
      if (!(value instanceof ArrayBuffer) && !ArrayBuffer.isView(value)) throw new Error('Test bucket only accepts binary values.');
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      const metadata = { customMetadata: options?.customMetadata, key, size: bytes.byteLength, uploaded: new Date('2026-08-31T01:00:00.000Z') };
      objects.set(key, { bytes, metadata });
      return Promise.resolve(metadata);
    },
  };
  return { bucket, objects };
}

describe('cloud backup Worker ownership boundary', () => {
  it('rejects unauthenticated requests and derives every R2 key from the verified Clerk user', async () => {
    const { bucket, objects } = memoryBucket();
    const env: Env = { BACKUPS_BUCKET: bucket, CLERK_PUBLISHABLE_KEY: 'pk_test', CLERK_SECRET_KEY: 'sk_test' };
    const worker = createWorker((request) => {
      const token = request.headers.get('Authorization')?.replace('Bearer ', '');
      return Promise.resolve(token ? { userId: token } : { error: new Response('{"error":"Unauthorized"}', { status: 401 }) });
    });

    const unauthorized = await worker.fetch(new Request('https://worker.test/v1/backups'), env);
    expect(unauthorized.status).toBe(401);

    const upload = await worker.fetch(new Request('https://worker.test/v1/backups/safe-id', {
      body: new Uint8Array([1, 2, 3]),
      headers: { Authorization: 'Bearer user-a', 'X-Backup-Checksum': 'a'.repeat(64), 'X-Backup-Trigger': 'manual' },
      method: 'PUT',
    }), env);
    expect(upload.status).toBe(200);
    expect([...objects.keys()]).toEqual(['users/user-a/backups/safe-id.maxbak']);

    const otherUserList = await worker.fetch(new Request('https://worker.test/v1/backups', { headers: { Authorization: 'Bearer user-b' } }), env);
    expect((await otherUserList.json() as { count: number }).count).toBe(0);
    const otherUserDownload = await worker.fetch(new Request('https://worker.test/v1/backups/safe-id', { headers: { Authorization: 'Bearer user-b' } }), env);
    expect(otherUserDownload.status).toBe(404);
  });
});
