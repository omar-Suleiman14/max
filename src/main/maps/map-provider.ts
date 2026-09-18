import type { MapPoint, MapProviderStatus, MapRenderResult } from '../../shared/map-contract';

const DEFAULT_ENDPOINT = 'https://staticmap.openstreetmap.de/staticmap.php';
const MAX_POINTS = 100;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export class MapProviderError extends Error {}

function validPoint(point: MapPoint): boolean {
  return Number.isFinite(point.latitude)
    && Number.isFinite(point.longitude)
    && point.latitude >= -90
    && point.latitude <= 90
    && point.longitude >= -180
    && point.longitude <= 180;
}

export class StaticMapProvider {
  constructor(
    private readonly endpoint = DEFAULT_ENDPOINT,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  status(): MapProviderStatus {
    return {
      configured: Boolean(this.endpoint),
      disclosure: 'Max sends only the latitude and longitude of visible records to OpenStreetMap Static Map so it can draw the map background. Record names, ids, and other workspace content stay on this device.',
      providerName: 'OpenStreetMap Static Map',
    };
  }

  async render(points: readonly MapPoint[]): Promise<MapRenderResult> {
    if (!this.endpoint) throw new MapProviderError('Map provider is not configured.');
    const safePoints = points.filter(validPoint).slice(0, MAX_POINTS);
    if (safePoints.length === 0) throw new MapProviderError('No valid coordinates are available to map.');

    const latitude = safePoints.reduce((sum, point) => sum + point.latitude, 0) / safePoints.length;
    const longitude = safePoints.reduce((sum, point) => sum + point.longitude, 0) / safePoints.length;
    const query = new URLSearchParams({ center: `${latitude},${longitude}`, maptype: 'mapnik', size: '900x480', zoom: '11' });
    for (const point of safePoints) query.append('markers', `${point.latitude},${point.longitude},lightblue1`);

    const response = await this.fetchImpl(`${this.endpoint}?${query.toString()}`).catch(() => {
      throw new MapProviderError('Could not reach the map provider.');
    });
    if (!response.ok) throw new MapProviderError(`Map provider answered ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) throw new MapProviderError('Map provider returned an invalid image.');
    const contentType = response.headers.get('content-type') ?? 'image/png';
    if (!contentType.startsWith('image/')) throw new MapProviderError('Map provider returned an invalid image.');
    return { imageDataUrl: `data:${contentType};base64,${bytes.toString('base64')}`, providerName: this.status().providerName };
  }
}
