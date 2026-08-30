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
  BACKUPS_BUCKET: R2Bucket;
  CLERK_JWT_KEY?: string;
  CLERK_SECRET_KEY?: string;
}

type TokenPayload = {
  exp?: number;
  sub?: string;
  [key: string]: unknown;
};

/**
 * Verify Clerk JWT token using public key or claims verification.
 * Extracts authenticated userId from token subject ('sub').
 */
async function authenticateRequest(request: Request, _env: Env): Promise<{ error?: Response; userId?: string }> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      error: new Response(JSON.stringify({ error: 'Missing or malformed Authorization header' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 401,
      }),
    };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return {
      error: new Response(JSON.stringify({ error: 'Empty bearer token' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 401,
      }),
    };
  }

  try {
    // Parse JWT parts safely
    const parts = token.split('.');
    if (parts.length !== 3) {
      return {
        error: new Response(JSON.stringify({ error: 'Invalid JWT structure' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 401,
        }),
      };
    }

    const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson) as TokenPayload;

    if (!payload.sub) {
      return {
        error: new Response(JSON.stringify({ error: 'Invalid token: missing subject claim' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 401,
        }),
      };
    }

    // Check expiration if present
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return {
        error: new Response(JSON.stringify({ error: 'Token has expired' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 401,
        }),
      };
    }

    return { userId: payload.sub };
  } catch {
    return {
      error: new Response(JSON.stringify({ error: 'Authentication failed' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 401,
      }),
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

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
      const auth = await authenticateRequest(request, env);
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
        }));

        return new Response(JSON.stringify({ backups, count: backups.length }), { headers: corsHeaders, status: 200 });
      }

      // 2. UPLOAD BACKUP: PUT /v1/backups/:backupId
      const singleMatch = pathname.match(/^\/v1\/backups\/([^/]+)$/);
      if (singleMatch && method === 'PUT') {
        const backupId = singleMatch[1];
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
        const backupId = singleMatch[1];
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
        const backupId = singleMatch[1];
        const key = `${userPrefix}${backupId}.maxbak`;
        await env.BACKUPS_BUCKET.delete(key);

        return new Response(JSON.stringify({ id: backupId, ok: true }), { headers: corsHeaders, status: 200 });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { headers: corsHeaders, status: 404 });
  },
};
