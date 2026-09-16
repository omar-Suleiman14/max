import { createWorker, type Env, type R2Bucket, type R2ObjectMetadata, type WorkerAuthenticator } from '../../../worker/src/index';

/**
 * Doubles for the two things the backup Worker talks to: R2 and Clerk.
 *
 * The point of these is that the whole Worker suite runs on an ordinary pull
 * request with no Cloudflare account, no Clerk keys and no network. They copy
 * the shapes the real services present rather than the ones that would be
 * convenient: R2 hands back an object whose body is a stream, its listing is
 * unordered, and a failing bucket throws rather than returning an error.
 */

export type BucketFault = 'delete' | 'get' | 'list' | 'put';

export type MemoryBucket = Readonly<{
  bucket: R2Bucket;
  /** Make one operation throw the way an R2 outage does. */
  fail: (operation: BucketFault) => void;
  keys: () => readonly string[];
  /** Put an object straight in, bypassing the Worker, to set a scene. */
  seed: (key: string, options?: { checksum?: string; trigger?: string; uploaded?: Date }) => void;
}>;

export function memoryBucket(): MemoryBucket {
  const objects = new Map<string, { bytes: Uint8Array; metadata: R2ObjectMetadata }>();
  const faults = new Set<BucketFault>();

  const guard = (operation: BucketFault) => {
    if (faults.has(operation)) throw new Error(`R2 ${operation} failed`);
  };

  const bucket: R2Bucket = {
    delete: (keys) => {
      guard('delete');
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
      return Promise.resolve();
    },
    get: (key) => {
      guard('get');
      const stored = objects.get(key);
      if (!stored) return Promise.resolve(null);
      return Promise.resolve({ ...stored.metadata, body: new Blob([stored.bytes]).stream() });
    },
    list: ({ prefix = '' } = {}) => {
      guard('list');
      return Promise.resolve({
        objects: [...objects.values()].map(({ metadata }) => metadata).filter(({ key }) => key.startsWith(prefix)),
        truncated: false,
      });
    },
    put: (key, value, options) => {
      guard('put');
      if (!(value instanceof ArrayBuffer) && !ArrayBuffer.isView(value)) throw new Error('Test bucket only accepts binary values.');
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      const metadata = { customMetadata: options?.customMetadata, key, size: bytes.byteLength, uploaded: new Date('2026-08-31T01:00:00.000Z') };
      objects.set(key, { bytes, metadata });
      return Promise.resolve(metadata);
    },
  };

  return {
    bucket,
    fail: (operation) => faults.add(operation),
    keys: () => [...objects.keys()],
    seed: (key, { checksum = 'a'.repeat(64), trigger = 'manual', uploaded = new Date('2026-08-31T01:00:00.000Z') } = {}) => {
      const bytes = new Uint8Array([1, 2, 3]);
      objects.set(key, { bytes, metadata: { customMetadata: { checksum, trigger }, key, size: bytes.byteLength, uploaded } });
    },
  };
}

/** Treats the Bearer token as the user id, so a test can be two people at once. */
export const tokenIsTheUser: WorkerAuthenticator = (request) => {
  const token = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
  return Promise.resolve(token
    ? { userId: token }
    : { error: new Response('{"error":"Unauthorized"}', { headers: { 'Content-Type': 'application/json' }, status: 401 }) });
};

/** Refuses everybody, the way Clerk does for an expired or forged token. */
export const nobodyIsAuthenticated: WorkerAuthenticator = () =>
  Promise.resolve({ error: new Response('{"error":"Authentication failed","reason":"token-rejected"}', { headers: { 'Content-Type': 'application/json' }, status: 401 }) });

export function workerWith(authenticate: WorkerAuthenticator = tokenIsTheUser) {
  return createWorker(authenticate);
}

export function envWith(bucket: R2Bucket): Env {
  return { BACKUPS_BUCKET: bucket, CLERK_PUBLISHABLE_KEY: 'pk_test', CLERK_SECRET_KEY: 'sk_test' };
}
