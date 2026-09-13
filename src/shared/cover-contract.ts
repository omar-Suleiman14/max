/**
 * Page covers.
 *
 * A cover is either one of the gallery's own gradients, which cost nothing to
 * store and always render, or an image that Max has downloaded into the local
 * asset store. Max never renders a remote URL directly: a workspace that only
 * looked right while the machine was online would not be an offline-first one.
 */
export type PageCover = Readonly<{
  /** Attribution for an image that came from a photo library. */
  credit?: Readonly<{ name: string; url: string }>;
  kind: 'gradient' | 'image';
  /**
   * Which part of a tall image the strip shows, as a percentage from its top.
   * 50 centres it, which is where a freshly chosen cover starts.
   */
  position?: number;
  /** A gallery gradient id, or the `max://asset/…` URL of a stored image. */
  value: string;
}>;

export type CoverGradient = Readonly<{ background: string; id: string; label: string }>;

/**
 * The gallery. Solid colours first, then gradients, in the order they appear.
 *
 * These are CSS, not files: they need no download, survive a workspace being
 * copied to another machine, and cannot go missing.
 */
export const COVER_GRADIENTS: readonly CoverGradient[] = [
  { background: 'radial-gradient(ellipse at 20% 100%,#406c58 0 35%,transparent 36%),radial-gradient(ellipse at 80% 100%,#749b74 0 45%,transparent 46%),linear-gradient(#b9dfeb,#f6ebce)', id: 'hills', label: 'Quiet hills' },
  { background: 'repeating-linear-gradient(0deg,#ffffff18 0 1px,transparent 1px 28px),repeating-linear-gradient(90deg,#ffffff18 0 1px,transparent 1px 28px),linear-gradient(125deg,#163d43,#388c88)', id: 'grid', label: 'Ocean grid' },
  { background: 'radial-gradient(circle at 70% 35%,#f6c576 0 12%,transparent 12.5%),linear-gradient(160deg,#7e657e,#e1a08e 70%,#f4d5ad)', id: 'sunset', label: 'Desert sunset' },
  { background: 'repeating-linear-gradient(135deg,#d5bdda 0 35px,#8c8fb6 35px 70px,#f0d6c0 70px 105px)', id: 'ribbons', label: 'Pastel ribbons' },
  { background: '#c8524b', id: 'clay', label: 'Clay' },
  { background: '#d8a13a', id: 'amber', label: 'Amber' },
  { background: '#3f7fae', id: 'harbour', label: 'Harbour' },
  { background: '#7f9a6e', id: 'olive', label: 'Olive' },
  { background: '#eee4d6', id: 'parchment', label: 'Parchment' },
  { background: '#3b4252', id: 'slate', label: 'Slate' },
  { background: 'linear-gradient(120deg,#8ec5d6,#dfe8ea 55%,#c8b6cf)', id: 'morning', label: 'Morning' },
  { background: 'linear-gradient(120deg,#d8566f,#a8437f)', id: 'plum', label: 'Plum' },
  { background: 'linear-gradient(120deg,#e0713f,#cf3b30)', id: 'ember', label: 'Ember' },
  { background: 'linear-gradient(120deg,#4a6fa5,#8fb3c9 50%,#e3cdb6)', id: 'shoreline', label: 'Shoreline' },
  { background: 'linear-gradient(120deg,#5b7fa8,#2f3d55)', id: 'dusk', label: 'Dusk' },
  { background: 'linear-gradient(120deg,#6f8f6a,#cfd8ae 60%,#e8d9a8)', id: 'meadow', label: 'Meadow' },
];

export function coverGradient(id: string): CoverGradient | undefined {
  return COVER_GRADIENTS.find((gradient) => gradient.id === id);
}

/** The CSS background a cover paints, or undefined when it is an image. */
export function coverBackground(cover: PageCover | undefined): string | undefined {
  return cover?.kind === 'gradient' ? coverGradient(cover.value)?.background ?? COVER_GRADIENTS[0]?.background : undefined;
}

export function clampCoverPosition(value: unknown): number {
  const position = typeof value === 'number' && Number.isFinite(value) ? value : 50;
  return Math.min(100, Math.max(0, Math.round(position)));
}

/** A stored cover, or undefined when the value is not one Max wrote. */
export function parseCover(value: unknown): PageCover | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== 'gradient' && candidate.kind !== 'image') return undefined;
  if (typeof candidate.value !== 'string' || !candidate.value) return undefined;
  if (candidate.kind === 'image' && !candidate.value.startsWith('max://asset/')) return undefined;
  const credit = candidate.credit as Record<string, unknown> | undefined;
  return {
    credit: credit && typeof credit.name === 'string' && typeof credit.url === 'string'
      ? { name: credit.name, url: credit.url }
      : undefined,
    kind: candidate.kind,
    position: clampCoverPosition(candidate.position),
    value: candidate.value,
  };
}

export type StoredAsset = Readonly<{ byteLength: number; url: string }>;

export type PhotoResult = Readonly<{
  /** A small preview, already downloaded, as a data URL the grid can paint. */
  thumbnail: string;
  authorName: string;
  authorUrl: string;
  /** Passed back to the download call so attribution stays attached. */
  downloadUrl: string;
  id: string;
  fullUrl: string;
}>;
