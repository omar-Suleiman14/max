import { createHash } from 'node:crypto';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
    const target = join(this.directory, name);
    await mkdir(this.directory, { recursive: true });
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

    const response = await fetchImpl(address.toString(), { redirect: 'follow' }).catch(() => {
      throw new AssetError('Could not reach that address.');
    });
    if (!response.ok) throw new AssetError(`That address answered ${response.status}.`);

    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (declaredLength > MAX_ASSET_BYTES) {
      throw new AssetError(`Images must be under ${Math.round(MAX_ASSET_BYTES / 1024 / 1024)} MB.`);
    }

    return this.store(new Uint8Array(await response.arrayBuffer()));
  }

  /** Every stored file, for the size report in settings. */
  async usage(): Promise<{ byteLength: number; count: number }> {
    const names = await readdir(this.directory).catch(() => [] as string[]);
    const sizes = await Promise.all(names.map(async (name) => (await stat(join(this.directory, name)).catch(() => undefined))?.size ?? 0));
    return { byteLength: sizes.reduce((total, size) => total + size, 0), count: names.length };
  }
}
