import { createHash } from 'node:crypto';
import { mkdir, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assetFolder, storedAssetPath } from './asset-path';

/** Covers are decoration, not archives: a few megabytes is already generous. */
export const MAX_ASSET_BYTES = 12 * 1024 * 1024;

const SIGNATURES: readonly Readonly<{ bytes: readonly number[]; extension: string; offset?: number }>[] = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], extension: 'png' },
  { bytes: [0xff, 0xd8, 0xff], extension: 'jpg' },
  { bytes: [0x47, 0x49, 0x46, 0x38], extension: 'gif' },
  { bytes: [0x52, 0x49, 0x46, 0x46], extension: 'webp' },
];

/**
 * The image format, read from the file's own first bytes.
 *
 * A caller-supplied name or Content-Type says whatever the caller wants it to;
 * what Max writes into its own directory and later serves back to the renderer
 * is decided here, from the content.
 */
export function imageExtension(bytes: Uint8Array): string | undefined {
  const match = SIGNATURES.find((signature) =>
    signature.bytes.every((byte, index) => bytes[(signature.offset ?? 0) + index] === byte));
  if (!match) return undefined;
  // RIFF containers hold more than images; only WEBP is one.
  if (match.extension === 'webp') {
    const tag = String.fromCharCode(...bytes.slice(8, 12));
    return tag === 'WEBP' ? 'webp' : undefined;
  }
  return match.extension;
}

export class AssetError extends Error {}

/**
 * Images a workspace owns, kept as files beside its database.
 *
 * Names are the content's own SHA-256, so importing the same picture twice
 * writes it once, and nothing a caller supplies reaches the filesystem as a
 * path. A cover therefore keeps working with no network, and a page that was
 * given a link is not left pointing at someone else's server.
 */
export class AssetStore {
  constructor(private readonly directory: string, private readonly baseUrl = 'max://asset/') {}

  async organize(): Promise<void> {
    for (const folder of ['images', 'documents', 'audio', 'videos', 'archives']) await mkdir(join(this.directory, folder), { recursive: true });
    for (const name of await readdir(this.directory)) {
      const folder = assetFolder(name);
      if (!folder) continue;
      const target = join(this.directory, folder, name);
      // Validated hash filenames and fixed folder names cannot escape this store.
      if (!(await stat(target).catch(() => undefined))) await rename(join(this.directory, name), target);
    }
  }

  imagePath(url: string): string {
    const name = this.fileNameFor(url);
    if (!name) throw new AssetError('Invalid image.');
    return storedAssetPath(this.directory, name)!;
  }

  attachmentPath(url: string): string {
    const name = url.startsWith('max://attachment/') ? url.slice(17) : '';
    if (!/^[0-9a-f]{64}\.[a-z0-9]{1,10}$/.test(name)) throw new AssetError('Invalid attachment.');
    const target = storedAssetPath(this.directory, name);
    if (!target) throw new AssetError('Invalid attachment.');
    return target;
  }

  async storeAttachment(bytes: Uint8Array, fileName: string): Promise<{ byteLength: number; url: string }> {
    if (!bytes.byteLength || bytes.byteLength > 25 * 1024 * 1024) throw new AssetError('Files must be between 1 byte and 25 MB.');
    const extension = fileName.split('.').at(-1)?.toLowerCase();
    const allowed = new Set(['pdf','txt','csv','json','md','doc','docx','xls','xlsx','ppt','pptx','zip','mp3','mp4','wav','ogg','webm']);
    if (!extension || !allowed.has(extension)) throw new AssetError('Use a document, archive, audio or video file.');
    const name = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`;
    const folder = join(this.directory, assetFolder(name)!);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, name), bytes, { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error; });
    return { byteLength: bytes.byteLength, url: `max://attachment/${name}` };
  }

  /** The URL a stored file is served at, or undefined for anything else. */
  fileNameFor(url: string): string | undefined {
    if (!url.startsWith(this.baseUrl)) return undefined;
    const name = url.slice(this.baseUrl.length);
    return /^[0-9a-f]{64}\.(png|jpg|gif|webp)$/.test(name) ? name : undefined;
  }

  async store(bytes: Uint8Array): Promise<{ byteLength: number; url: string }> {
    if (!bytes.byteLength) throw new AssetError('The image is empty.');
    if (bytes.byteLength > MAX_ASSET_BYTES) {
      throw new AssetError(`Images must be under ${Math.round(MAX_ASSET_BYTES / 1024 / 1024)} MB.`);
    }
    const extension = imageExtension(bytes);
    if (!extension) throw new AssetError('That file is not a PNG, JPEG, GIF or WebP image.');

    const name = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`;
    const target = join(this.directory, 'images', name);
    await mkdir(join(this.directory, 'images'), { recursive: true });
    // Content-addressed: an identical file is already the file we would write.
    const existing = await stat(target).catch(() => undefined);
    if (!existing) {
      // Two imports of the same picture can race; the loser has already written
      // exactly these bytes, so losing is the same as winning.
      await writeFile(target, bytes, { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
      });
    }

    return { byteLength: bytes.byteLength, url: `${this.baseUrl}${name}` };
  }

  /**
   * Fetch a remote image and keep it.
   *
   * The download happens here rather than in the renderer so that the window
   * never loads a third-party URL, and so what ends up on the page is a local
   * file rather than a link that can rot.
   */
  async download(url: string, fetchImpl: typeof fetch = fetch): Promise<{ byteLength: number; url: string }> {
    let address: URL;
    try {
      address = new URL(url);
    } catch {
      throw new AssetError('That is not a valid image address.');
    }
    if (address.protocol !== 'https:' && address.protocol !== 'http:') {
      throw new AssetError('Image links must start with http:// or https://.');
    }

    const response = await fetchImpl(address.toString(), { redirect: 'follow', signal: AbortSignal.timeout(30_000) }).catch(() => {
      throw new AssetError('Could not reach that address.');
    });
    if (!response.ok) throw new AssetError(`That address answered ${response.status}.`);

    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (declaredLength > MAX_ASSET_BYTES) {
      throw new AssetError(`Images must be under ${Math.round(MAX_ASSET_BYTES / 1024 / 1024)} MB.`);
    }

    if (!response.body) throw new AssetError('The image is empty.');
    const reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > MAX_ASSET_BYTES) { await reader.cancel(); throw new AssetError('Images must be under 12 MB.'); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    return this.store(Buffer.concat(chunks));
  }

  /** Every stored file, for the size report in settings. */
  async usage(): Promise<{ byteLength: number; count: number }> {
    const files = new Map<string, number>();
    for (const folder of ['', 'images', 'documents', 'audio', 'videos', 'archives']) {
      const names = await readdir(join(this.directory, folder)).catch(() => [] as string[]);
      for (const name of names) {
        if (!assetFolder(name)) continue;
        const entry = await stat(join(this.directory, folder, name)).catch(() => undefined);
        if (entry?.isFile()) files.set(name, entry.size);
      }
    }
    return { byteLength: [...files.values()].reduce((total, size) => total + size, 0), count: files.size };
  }
}
