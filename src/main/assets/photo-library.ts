import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { PhotoResult } from '../../shared/cover-contract';

const API = 'https://api.unsplash.com';
const UTM = 'utm_source=Max&utm_medium=referral';

export class PhotoLibraryError extends Error {}

type UnsplashPhoto = Readonly<{
  id: string;
  links?: Readonly<{ download_location?: string }>;
  urls?: Readonly<{ full?: string; regular?: string; thumb?: string }>;
  user?: Readonly<{ links?: Readonly<{ html?: string }>; name?: string }>;
}>;

/**
 * Unsplash search, run from the main process.
 *
 * Two things stay true whichever way a photo is chosen: the window never talks
 * to Unsplash itself - even the result thumbnails arrive as bytes this class
 * fetched and hands over inline - and the chosen photo is downloaded into the
 * local asset store rather than linked. Unsplash also asks that applications
 * credit the photographer and report a download when a photo is actually used,
 * and both happen here.
 *
 * The access key is optional. Without one the picker still offers the gallery,
 * uploads and links; it simply says that Unsplash needs a free key, and takes
 * one when it is given.
 */
export class PhotoLibrary {
  private cachedKey?: string;

  constructor(
    private readonly keyFile: string,
    private readonly buildKey?: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async accessKey(): Promise<string | undefined> {
    if (this.cachedKey) return this.cachedKey;
    const saved = await readFile(this.keyFile, 'utf8').then(
      (text) => (JSON.parse(text) as { unsplashAccessKey?: unknown }).unsplashAccessKey,
      () => undefined,
    );
    const key = (typeof saved === 'string' && saved.trim()) || this.buildKey?.trim();
    this.cachedKey = key || undefined;
    return this.cachedKey;
  }

  async saveAccessKey(value: string): Promise<void> {
    const key = value.trim();
    await mkdir(dirname(this.keyFile), { recursive: true });
    await writeFile(this.keyFile, `${JSON.stringify({ unsplashAccessKey: key }, null, 2)}\n`, 'utf8');
    this.cachedKey = key || undefined;
  }

  private async call(path: string): Promise<unknown> {
    const key = await this.accessKey();
    if (!key) throw new PhotoLibraryError('unconfigured');
    const response = await this.fetchImpl(`${API}${path}`, {
      headers: { 'Accept-Version': 'v1', Authorization: `Client-ID ${key}` },
    }).catch(() => {
      throw new PhotoLibraryError('Could not reach Unsplash. Check the connection.');
    });
    if (response.status === 401) throw new PhotoLibraryError('Unsplash rejected the access key.');
    if (response.status === 403) throw new PhotoLibraryError('Unsplash is rate limiting this key. Try again shortly.');
    if (!response.ok) throw new PhotoLibraryError(`Unsplash answered ${response.status}.`);
    return response.json();
  }

  /** A thumbnail as bytes, inlined so the renderer paints it without a request. */
  private async thumbnail(url: string | undefined): Promise<string> {
    if (!url) return '';
    const response = await this.fetchImpl(url).catch(() => undefined);
    if (!response?.ok) return '';
    const type = response.headers.get('content-type') ?? 'image/jpeg';
    const bytes = Buffer.from(await response.arrayBuffer());
    // Thumbnails are a few kilobytes; anything larger is not a thumbnail.
    return bytes.byteLength > 512 * 1024 ? '' : `data:${type};base64,${bytes.toString('base64')}`;
  }

  async search(query: string, page = 1): Promise<readonly PhotoResult[]> {
    const safePage = Math.min(20, Math.max(1, Math.trunc(page)));
    const trimmed = query.trim().slice(0, 100);
    const body = await this.call(trimmed
      ? `/search/photos?per_page=18&orientation=landscape&page=${safePage}&query=${encodeURIComponent(trimmed)}`
      : `/photos?per_page=18&order_by=popular&page=${safePage}`);
    const photos = (Array.isArray(body) ? body : (body as { results?: unknown }).results) as UnsplashPhoto[] | undefined;
    if (!Array.isArray(photos)) return [];

    return Promise.all(photos.slice(0, 18).map(async (photo) => ({
      authorName: photo.user?.name ?? 'Unsplash',
      authorUrl: `${photo.user?.links?.html ?? 'https://unsplash.com'}?${UTM}`,
      downloadUrl: photo.links?.download_location ?? '',
      fullUrl: photo.urls?.regular ?? photo.urls?.full ?? '',
      id: photo.id,
      thumbnail: await this.thumbnail(photo.urls?.thumb),
    })));
  }

  /**
   * Tell Unsplash a photo was used. Their API terms ask for this, and it is the
   * photographer's only signal that the picture went somewhere; a failure here
   * must never stop the cover being set, so it is reported and dropped.
   */
  async reportDownload(downloadLocation: string): Promise<void> {
    if (!downloadLocation.startsWith(`${API}/`)) return;
    const key = await this.accessKey();
    if (!key) return;
    await this.fetchImpl(downloadLocation, {
      headers: { 'Accept-Version': 'v1', Authorization: `Client-ID ${key}` },
    }).catch(() => undefined);
  }
}
