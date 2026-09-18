import { describe, expect, it, vi } from 'vitest';

import { MapProviderError, StaticMapProvider } from './map-provider';

describe('StaticMapProvider', () => {
  it('reports configured status and renders a data URL from valid points', async () => {
    const fetchImpl = vi.fn((url: string | URL | Request) => {
      const requestUrl = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
      expect(requestUrl.origin + requestUrl.pathname).toBe('https://maps.example.test/static');
      expect(requestUrl.searchParams.get('center')).toBe('30.05,31.25');
      expect(requestUrl.searchParams.getAll('markers')).toEqual([
        '30,31,lightblue1',
        '30.1,31.5,lightblue1',
      ]);
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/png' },
        status: 200,
      }));
    }) as unknown as typeof fetch;
    const provider = new StaticMapProvider('https://maps.example.test/static', fetchImpl);

    expect(provider.status()).toMatchObject({ configured: true, providerName: 'OpenStreetMap Static Map' });
    await expect(provider.render([
      { latitude: 30, longitude: 31 },
      { latitude: 30.1, longitude: 31.5 },
    ])).resolves.toEqual({
      imageDataUrl: 'data:image/png;base64,AQID',
      providerName: 'OpenStreetMap Static Map',
    });
  });

  it('reports an unconfigured provider and refuses to render', async () => {
    const fetchImpl = vi.fn() as typeof fetch;
    const provider = new StaticMapProvider('', fetchImpl);

    expect(provider.status().configured).toBe(false);
    await expect(provider.render([{ latitude: 30, longitude: 31 }])).rejects.toThrow(MapProviderError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('turns network failures into a stable provider error', async () => {
    const provider = new StaticMapProvider(
      'https://maps.example.test/static',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );

    await expect(provider.render([{ latitude: 30, longitude: 31 }])).rejects.toThrow('Could not reach the map provider.');
  });
});
