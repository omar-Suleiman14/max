import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { AssetError, AssetStore, imageExtension } from './asset-store';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function store() {
  const directory = mkdtempSync(join(tmpdir(), 'max-assets-'));
  return { directory, assets: new AssetStore(directory) };
}

describe('the workspace image store', () => {
  it('reads the format from the file rather than from its name', () => {
    expect(imageExtension(PNG)).toBe('png');
    expect(imageExtension(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    // A RIFF container that is not a WEBP is not an image Max will serve.
    expect(imageExtension(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20]))).toBeUndefined();
    expect(imageExtension(new TextEncoder().encode('<script>'))).toBeUndefined();
  });

  it('names a file after its own content, so the same image is kept once', async () => {
    const { assets, directory } = store();
    const first = await assets.store(PNG);
    const second = await assets.store(PNG);

    expect(first.url).toBe(second.url);
    expect(first.url).toMatch(/^max:\/\/asset\/[0-9a-f]{64}\.png$/);
    expect(readdirSync(directory)).toHaveLength(1);
    expect(readFileSync(join(directory, first.url.slice('max://asset/'.length)))).toEqual(Buffer.from(PNG));
  });

  it('refuses anything that is not an image it can serve', async () => {
    const { assets } = store();
    await expect(assets.store(new TextEncoder().encode('not an image'))).rejects.toBeInstanceOf(AssetError);
    await expect(assets.store(new Uint8Array())).rejects.toBeInstanceOf(AssetError);
  });

  it('downloads a linked image into the store instead of leaving the page pointing at it', async () => {
    const { assets } = store();
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(PNG, { headers: { 'content-type': 'image/png' } })));

    const stored = await assets.download('https://example.test/photo.png', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(stored.url.startsWith('max://asset/')).toBe(true);
    expect((await assets.usage()).count).toBe(1);
  });

  it('accepts only http and https links', async () => {
    const { assets } = store();
    await expect(assets.download('file:///etc/passwd')).rejects.toBeInstanceOf(AssetError);
    await expect(assets.download('not a url')).rejects.toBeInstanceOf(AssetError);
  });
});
