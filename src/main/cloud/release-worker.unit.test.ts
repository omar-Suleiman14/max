import { describe, expect, it, vi } from 'vitest';
import { createWorker, type Env } from '../../../worker/src/index';

describe('public release feed', () => {
  it('streams only release objects, keeps the index fresh, and supports HEAD', async () => {
    const auth = vi.fn(); const get = vi.fn(() => Promise.resolve({ body: new Blob(['feed']).stream(), size: 4, uploaded: new Date(), key: 'test' }));
    const env = { RELEASES_BUCKET: { get } } as unknown as Env;
    const worker = createWorker(auth);
    const index = await worker.fetch(new Request('https://example.com/v1/releases/windows/x64/RELEASES'), env);
    expect(await index.text()).toBe('feed'); expect(index.headers.get('Cache-Control')).toBe('no-store');
    const pkg = await worker.fetch(new Request('https://example.com/v1/releases/windows/x64/Max-0.3.0-full.nupkg', { method: 'HEAD' }), env);
    expect(await pkg.text()).toBe(''); expect(pkg.headers.get('Content-Length')).toBe('4');
    expect(auth).not.toHaveBeenCalled(); expect(get).toHaveBeenLastCalledWith('windows/x64/Max-0.3.0-full.nupkg');
    expect((await worker.fetch(new Request('https://example.com/v1/releases/windows/x64/private.maxbak'), env)).status).toBe(404);
    expect((await worker.fetch(new Request('https://example.com/v1/releases/windows/x64/RELEASES', { method: 'PUT' }), env)).status).toBe(405);
  });
  it('reports an unavailable feed without exposing backups', async () => {
    const worker = createWorker();
    expect((await worker.fetch(new Request('https://example.com/v1/releases/windows/x64/RELEASES'), {} as Env)).status).toBe(503);
    expect((await worker.fetch(new Request('https://example.com/v1/releases/windows/x64/RELEASES'), { RELEASES_BUCKET: { get: () => Promise.resolve(null) } } as unknown as Env)).status).toBe(404);
  });
});
