import { describe, expect, it } from 'vitest';

import { ChaosClient, type ChaosApiError } from './chaos-client';

const options = {
  apiOrigin: 'https://chaos.example.test',
  token: `chaos_${'a'.repeat(64)}`,
};

describe('ChaosClient response limits', () => {
  it('times out when a server sends headers but stalls while sending the body', async () => {
    const fetchImpl: typeof fetch = (_input, init) => Promise.resolve(new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true });
      },
    }), { status: 200 }));
    const client = new ChaosClient({ ...options, fetchImpl, timeoutMs: 20 });
    await expect(client.getCapabilities()).rejects.toMatchObject({ code: 'TIMEOUT' } satisfies Partial<ChaosApiError>);
  });

  it('rejects an oversized response as its bytes arrive', async () => {
    const fetchImpl: typeof fetch = () => Promise.resolve(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
      },
    }), { status: 200 }));
    const client = new ChaosClient({ ...options, fetchImpl });
    await expect(client.getCapabilities()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' } satisfies Partial<ChaosApiError>);
  });
});
