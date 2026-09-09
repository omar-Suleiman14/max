import { createClerkClient } from '@clerk/backend';

export interface R2ObjectMetadata {
  customMetadata?: Record<string, string>;
  key: string;
  size: number;
  uploaded: Date;
}

export interface R2ObjectsList {
  objects: R2ObjectMetadata[];
  truncated: boolean;
}

export interface R2ObjectBody extends R2ObjectMetadata {
  body: ReadableStream;
}

export interface R2Bucket {
  delete(key: string | string[]): Promise<void>;
  get(key: string): Promise<R2ObjectBody | null>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<R2ObjectsList>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string | null,
    options?: {
      customMetadata?: Record<string, string>;
      httpMetadata?: { contentType?: string; [key: string]: unknown };
    },
  ): Promise<R2ObjectMetadata>;
}

export interface Env {
  RELEASES_BUCKET?: R2Bucket;
  BACKUPS_BUCKET: R2Bucket;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_SECRET_KEY: string;
}

/**
 * Verify Clerk JWT token using public key or claims verification.
 * Extracts authenticated userId from token subject ('sub').
 */
async function authenticateRequest(request: Request, env: Env): Promise<{ error?: Response; userId?: string }> {
  try {
    if (!env.CLERK_SECRET_KEY || !env.CLERK_PUBLISHABLE_KEY) throw new Error('Clerk is not configured.');
    const state = await createClerkClient({
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
      secretKey: env.CLERK_SECRET_KEY,
    }).authenticateRequest(request);
    if (!state.isAuthenticated) throw new Error('Unauthenticated.');
    const userId = state.toAuth().userId;
    if (!userId) throw new Error('Missing Clerk user.');
    return { userId };
  } catch {
    return {
      error: new Response(JSON.stringify({ error: 'Authentication failed' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 401,
      }),
    };
  }
}

export type WorkerAuthenticator = (request: Request, env: Env) => Promise<{ error?: Response; userId?: string }>;

export function createWorker(authenticate: WorkerAuthenticator = authenticateRequest) {
  return {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    // Public, read-only release feed. Backups remain in their private bucket.
    if (pathname.startsWith('/v1/releases/')) {
      if (method !== 'GET' && method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
      const match = /^\/v1\/releases\/windows\/(x64|arm64)\/(RELEASES|Max-[0-9]+\.[0-9]+\.[0-9]+-(?:full|delta)\.nupkg)$/.exec(pathname);
      if (!match) return new Response(null, { status: 404 });
      if (!env.RELEASES_BUCKET) return new Response('Release feed is not configured.', { status: 503 });
      const object = await env.RELEASES_BUCKET.get(`windows/${match[1]}/${match[2]}`);
      if (!object) return new Response(null, { status: 404 });
      return new Response(method === 'HEAD' ? null : object.body, { headers: {
        'Content-Type': match[2] === 'RELEASES' ? 'text/plain' : 'application/octet-stream',
        'Content-Length': String(object.size),
        'Cache-Control': match[2] === 'RELEASES' ? 'no-store' : 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      } });
    }

    // CORS preflight handling
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Backup-Checksum, X-Backup-Trigger',
          'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Origin': '*',
        },
        status: 204,
      });
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    };

    // Public health check
    if (pathname === '/health' && method === 'GET') {
      return new Response(
        JSON.stringify({
          service: 'max-backup-worker',
          status: 'ok',
          timestamp: new Date().toISOString(),
          version: '0.1.0',
        }),
        { headers: corsHeaders, status: 200 },
      );
    }

    // All /v1/backups endpoints require Clerk authentication
    if (pathname.startsWith('/v1/backups')) {
      const auth = await authenticate(request, env);
      if (auth.error || !auth.userId) {
        return auth.error ?? new Response(JSON.stringify({ error: 'Unauthorized' }), { headers: corsHeaders, status: 401 });
      }

      const userId = auth.userId;
      const userPrefix = `users/${userId}/backups/`;

      // 1. LIST BACKUPS: GET /v1/backups
      if (pathname === '/v1/backups' && method === 'GET') {
        const objects = await env.BACKUPS_BUCKET.list({ prefix: userPrefix });
        const backups = objects.objects.map((obj: R2ObjectMetadata) => ({
          checksum: obj.customMetadata?.checksum ?? '',
          createdAt: obj.uploaded.toISOString(),
          id: obj.key.replace(userPrefix, '').replace('.maxbak', ''),
          sizeBytes: obj.size,
          trigger: obj.customMetadata?.trigger ?? 'manual',
        })).sort((left, right) => right.createdAt.localeCompare(left.createdAt));

        return new Response(JSON.stringify({ backups, count: backups.length }), { headers: corsHeaders, status: 200 });
      }

      // 2. UPLOAD BACKUP: PUT /v1/backups/:backupId
      const singleMatch = pathname.match(/^\/v1\/backups\/([^/]+)$/);
      if (singleMatch && method === 'PUT') {
        const backupId = singleMatch[1] ?? '';
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(backupId)) {
          return new Response(JSON.stringify({ error: 'Invalid backup identifier' }), { headers: corsHeaders, status: 400 });
        }
        const key = `${userPrefix}${backupId}.maxbak`;
        const checksum = request.headers.get('X-Backup-Checksum') ?? '';
        const trigger = request.headers.get('X-Backup-Trigger') ?? 'manual';

        const body = await request.arrayBuffer();
        if (body.byteLength === 0) {
          return new Response(JSON.stringify({ error: 'Empty backup payload' }), { headers: corsHeaders, status: 400 });
        }

        await env.BACKUPS_BUCKET.put(key, body, {
          customMetadata: {
            checksum,
            trigger,
            uploadedAt: new Date().toISOString(),
          },
          httpMetadata: {
            contentType: 'application/octet-stream',
          },
        });

        const retained = await env.BACKUPS_BUCKET.list({ prefix: userPrefix });
        const expired = retained.objects.sort((left, right) => right.uploaded.getTime() - left.uploaded.getTime()).slice(30);
        if (expired.length > 0) await env.BACKUPS_BUCKET.delete(expired.map(({ key: expiredKey }) => expiredKey));

        return new Response(
          JSON.stringify({
            checksum,
            id: backupId,
            ok: true,
            sizeBytes: body.byteLength,
            storedAt: new Date().toISOString(),
          }),
          { headers: corsHeaders, status: 200 },
        );
      }

      // 3. DOWNLOAD BACKUP: GET /v1/backups/:backupId
      if (singleMatch && method === 'GET') {
        const backupId = singleMatch[1] ?? '';
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(backupId)) {
          return new Response(JSON.stringify({ error: 'Invalid backup identifier' }), { headers: corsHeaders, status: 400 });
        }
        const key = `${userPrefix}${backupId}.maxbak`;
        const object = await env.BACKUPS_BUCKET.get(key);

        if (!object) {
          return new Response(JSON.stringify({ error: 'Backup not found' }), { headers: corsHeaders, status: 404 });
        }

        const headers = new Headers();
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Content-Type', 'application/octet-stream');
        headers.set('Content-Disposition', `attachment; filename="${backupId}.maxbak"`);
        if (object.customMetadata?.checksum) {
          headers.set('X-Backup-Checksum', object.customMetadata.checksum);
        }

        return new Response(object.body, { headers, status: 200 });
      }

      // 4. DELETE BACKUP: DELETE /v1/backups/:backupId
      if (singleMatch && method === 'DELETE') {
        const backupId = singleMatch[1] ?? '';
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(backupId)) {
          return new Response(JSON.stringify({ error: 'Invalid backup identifier' }), { headers: corsHeaders, status: 400 });
        }
        const key = `${userPrefix}${backupId}.maxbak`;
        await env.BACKUPS_BUCKET.delete(key);

        return new Response(JSON.stringify({ id: backupId, ok: true }), { headers: corsHeaders, status: 200 });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { headers: corsHeaders, status: 404 });
  },
  };
}

export default createWorker();
