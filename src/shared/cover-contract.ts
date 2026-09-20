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

export type CoverCategory = Readonly<{ id: string; label: string; labelAr: string; items: readonly CoverGradient[] }>;

/**
 * The gallery. Solid colours first, then gradients, in the order they appear.
 *
 * These are CSS, not files: they need no download, survive a workspace being
 * copied to another machine, and cannot go missing.
 */

// ─── Colour & gradient ─────────────────────────────────────────────────────
const COLORS_AND_GRADIENTS: readonly CoverGradient[] = [
  // Vibrant solid / near-solid colours (Notion-style row 1)
  { background: '#e8596e', id: 'coral', label: 'Coral' },
  { background: '#efb33e', id: 'saffron', label: 'Saffron' },
  { background: '#1fa0d6', id: 'cerulean', label: 'Cerulean' },
  { background: '#f5e6d8', id: 'cream', label: 'Cream' },
  // Vibrant gradients (Notion-style row 2)
  { background: 'linear-gradient(135deg,#6cd0d3,#8bd8c5)', id: 'seafoam', label: 'Seafoam' },
  { background: 'linear-gradient(135deg,#e84393,#fd79a8)', id: 'fuchsia', label: 'Fuchsia' },
  { background: 'linear-gradient(135deg,#e17055,#d63031)', id: 'vermilion', label: 'Vermilion' },
  { background: 'linear-gradient(135deg,#ffecd2,#fcb69f)', id: 'peach', label: 'Peach' },
  // Subtle gradients (Notion-style row 3)
  { background: 'linear-gradient(135deg,#c84b6b,#667eea)', id: 'twilight', label: 'Twilight' },
  { background: 'linear-gradient(135deg,#a18cd1,#fbc2eb)', id: 'lavender', label: 'Lavender' },
  { background: 'linear-gradient(135deg,#667db6,#0082c8,#6dd5ed)', id: 'marine', label: 'Marine' },
  // Extra solid colours
  { background: '#c8524b', id: 'clay', label: 'Clay' },
  { background: '#d8a13a', id: 'amber', label: 'Amber' },
  { background: '#3f7fae', id: 'harbour', label: 'Harbour' },
  { background: '#7f9a6e', id: 'olive', label: 'Olive' },
  { background: '#eee4d6', id: 'parchment', label: 'Parchment' },
  { background: '#3b4252', id: 'slate', label: 'Slate' },
];

// ─── Abstract & cosmic ─────────────────────────────────────────────────────
const COSMIC: readonly CoverGradient[] = [
  { background: 'radial-gradient(ellipse at 40% 50%,#2d1b69 0%,#0d0221 70%),radial-gradient(circle at 80% 20%,#6c3483aa 0%,transparent 40%)', id: 'nebula', label: 'Nebula' },
  { background: 'radial-gradient(ellipse at 30% 60%,#1a1a2e,#16213e),radial-gradient(circle at 75% 25%,#0f3460cc 0%,transparent 50%)', id: 'deep-space', label: 'Deep space' },
  { background: 'radial-gradient(circle at 50% 50%,#141e30,#243b55)', id: 'midnight', label: 'Midnight' },
  { background: 'radial-gradient(ellipse at 60% 40%,#1b0a3c,#4a1942 40%,#b5179e88 100%)', id: 'aurora', label: 'Aurora' },
  { background: 'linear-gradient(135deg,#0c0c1d,#1a1a3e 40%,#2d1b69 70%,#5b2c8c)', id: 'cosmos', label: 'Cosmos' },
  { background: 'radial-gradient(circle at 70% 40%,#1e3a5f,#0a192f),radial-gradient(circle at 30% 70%,#234e7088,transparent 50%)', id: 'abyss', label: 'Abyss' },
  { background: 'linear-gradient(160deg,#000428,#004e92)', id: 'starfield', label: 'Starfield' },
  { background: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)', id: 'galaxy', label: 'Galaxy' },
];

// ─── Nature landscapes ──────────────────────────────────────────────────────
const LANDSCAPES: readonly CoverGradient[] = [
  { background: 'radial-gradient(ellipse at 20% 100%,#406c58 0 35%,transparent 36%),radial-gradient(ellipse at 80% 100%,#749b74 0 45%,transparent 46%),linear-gradient(#b9dfeb,#f6ebce)', id: 'hills', label: 'Quiet hills' },
  { background: 'radial-gradient(circle at 70% 35%,#f6c576 0 12%,transparent 12.5%),linear-gradient(160deg,#7e657e,#e1a08e 70%,#f4d5ad)', id: 'sunset', label: 'Desert sunset' },
  { background: 'linear-gradient(120deg,#6f8f6a,#cfd8ae 60%,#e8d9a8)', id: 'meadow', label: 'Meadow' },
  { background: 'linear-gradient(180deg,#87ceeb 0%,#e0f0ff 40%,#a8d8a8 40%,#6b8e4e 100%)', id: 'valley', label: 'Green valley' },
  { background: 'linear-gradient(180deg,#ffb347 0%,#ff6b6b 30%,#4a3728 45%,#2d1f16 100%)', id: 'savanna', label: 'Savanna' },
  { background: 'linear-gradient(180deg,#1e3c72 0%,#2a5298 30%,#a8c0ff 50%,#d4e4f7 100%)', id: 'alpine', label: 'Alpine' },
  { background: 'linear-gradient(180deg,#ffc3a0 0%,#ffafbd 25%,#a0c4ff 75%,#6eb5ff 100%)', id: 'dawn', label: 'Dawn' },
  { background: 'linear-gradient(135deg,#2c5364,#203a43,#0f2027)', id: 'forest-night', label: 'Forest night' },
];

// ─── Patterns & textures ────────────────────────────────────────────────────
const PATTERNS: readonly CoverGradient[] = [
  { background: 'repeating-linear-gradient(0deg,#ffffff18 0 1px,transparent 1px 28px),repeating-linear-gradient(90deg,#ffffff18 0 1px,transparent 1px 28px),linear-gradient(125deg,#163d43,#388c88)', id: 'grid', label: 'Ocean grid' },
  { background: 'repeating-linear-gradient(135deg,#d5bdda 0 35px,#8c8fb6 35px 70px,#f0d6c0 70px 105px)', id: 'ribbons', label: 'Pastel ribbons' },
  { background: 'repeating-linear-gradient(45deg,#f5f5f5 0 10px,#e8e8e8 10px 20px)', id: 'pinstripe-light', label: 'Pinstripe' },
  { background: 'repeating-linear-gradient(90deg,#2d2d3a 0 4px,#3d3d4f 4px 8px),repeating-linear-gradient(0deg,#2d2d3a44 0 4px,transparent 4px 8px)', id: 'weave', label: 'Weave' },
  { background: 'radial-gradient(circle at 25% 25%,#e8d5b7 2px,transparent 2px),radial-gradient(circle at 75% 75%,#e8d5b7 2px,transparent 2px),#f5eee6', id: 'linen', label: 'Linen' },
  { background: 'repeating-linear-gradient(120deg,#264653 0 20px,#2a9d8f 20px 40px,#e9c46a 40px 60px,#f4a261 60px 80px,#e76f51 80px 100px)', id: 'spectrum', label: 'Spectrum' },
  { background: 'repeating-conic-gradient(#2d3436 0% 25%,#636e72 0% 50%) 0 0 / 40px 40px', id: 'checkers', label: 'Checkerboard' },
  { background: 'linear-gradient(135deg,#667eea44 25%,transparent 25%),linear-gradient(225deg,#667eea44 25%,transparent 25%),linear-gradient(315deg,#667eea44 25%,transparent 25%),linear-gradient(45deg,#667eea44 25%,transparent 25%),#f0f0ff', id: 'diamonds', label: 'Diamonds' },
];

// ─── Warm tones ─────────────────────────────────────────────────────────────
const WARM: readonly CoverGradient[] = [
  { background: 'linear-gradient(120deg,#f6d365,#fda085)', id: 'honey', label: 'Honey' },
  { background: 'linear-gradient(135deg,#ee9ca7,#ffdde1)', id: 'blush', label: 'Blush' },
  { background: 'linear-gradient(135deg,#f093fb,#f5576c)', id: 'flamingo', label: 'Flamingo' },
  { background: 'linear-gradient(135deg,#fa709a,#fee140)', id: 'sunrise', label: 'Sunrise' },
  { background: 'linear-gradient(120deg,#e0713f,#cf3b30)', id: 'ember', label: 'Ember' },
  { background: 'linear-gradient(120deg,#d8566f,#a8437f)', id: 'plum', label: 'Plum' },
  { background: 'linear-gradient(135deg,#c471f5,#fa71cd)', id: 'orchid', label: 'Orchid' },
  { background: 'linear-gradient(135deg,#f7971e,#ffd200)', id: 'marigold', label: 'Marigold' },
];

// ─── Cool tones ─────────────────────────────────────────────────────────────
const COOL: readonly CoverGradient[] = [
  { background: 'linear-gradient(120deg,#8ec5d6,#dfe8ea 55%,#c8b6cf)', id: 'morning', label: 'Morning' },
  { background: 'linear-gradient(120deg,#4a6fa5,#8fb3c9 50%,#e3cdb6)', id: 'shoreline', label: 'Shoreline' },
  { background: 'linear-gradient(120deg,#5b7fa8,#2f3d55)', id: 'dusk', label: 'Dusk' },
  { background: 'linear-gradient(135deg,#43e97b,#38f9d7)', id: 'mint', label: 'Mint' },
  { background: 'linear-gradient(135deg,#4facfe,#00f2fe)', id: 'cyan', label: 'Cyan' },
  { background: 'linear-gradient(135deg,#a1c4fd,#c2e9fb)', id: 'sky', label: 'Sky' },
  { background: 'linear-gradient(135deg,#48c6ef,#6f86d6)', id: 'sapphire', label: 'Sapphire' },
  { background: 'linear-gradient(135deg,#89f7fe,#66a6ff)', id: 'arctic', label: 'Arctic' },
];

// ─── Japanese art (CSS recreations) ─────────────────────────────────────────
const JAPANESE_ART: readonly CoverGradient[] = [
  { background: 'linear-gradient(180deg,#c9b99a 0%,#a89070 30%,#5c8a8a 45%,#2b6777 60%,#1a4a5e 100%)', id: 'ukiyo-wave', label: 'Great Wave' },
  { background: 'linear-gradient(180deg,#f5e6d0 0%,#e8d5b8 20%,#d4a574 50%,#8b5e3c 100%)', id: 'washi', label: 'Washi paper' },
  { background: 'linear-gradient(135deg,#2c1810,#5c3a2e 40%,#8b5e3c 70%,#c49a6c)', id: 'urushi', label: 'Urushi lacquer' },
  { background: 'radial-gradient(circle at 50% 100%,#d4545e 0 15%,transparent 16%),linear-gradient(180deg,#e8ddd0,#c9b99a)', id: 'hinomaru', label: 'Hinomaru' },
  { background: 'linear-gradient(180deg,#1a1a2e 0%,#2d4059 30%,#ea5455 50%,#f07b3f 70%,#ffd460 100%)', id: 'fuji-sunset', label: 'Fuji sunset' },
  { background: 'linear-gradient(135deg,#1d3557,#457b9d 40%,#a8dadc 70%,#f1faee)', id: 'sumi-e', label: 'Sumi-e ink' },
  { background: 'repeating-linear-gradient(0deg,#e8d5b844 0 2px,transparent 2px 12px),linear-gradient(180deg,#c49a6c,#8b5e3c)', id: 'bamboo', label: 'Bamboo' },
  { background: 'radial-gradient(circle at 30% 60%,#f8b5c0 8%,transparent 9%),radial-gradient(circle at 60% 30%,#f8b5c0 6%,transparent 7%),radial-gradient(circle at 80% 70%,#f8b5c0 5%,transparent 6%),linear-gradient(180deg,#f5e6d0,#e8d5b8)', id: 'sakura', label: 'Sakura' },
];

// ─── Classical art inspired ─────────────────────────────────────────────────
const CLASSICAL_ART: readonly CoverGradient[] = [
  { background: 'linear-gradient(180deg,#b8860b22,#daa520 20%,#8b6914 50%,#654321 80%,#3e2723)', id: 'renaissance', label: 'Renaissance gold' },
  { background: 'linear-gradient(135deg,#1a1a2e,#2d2d4e 30%,#4a3f6b 60%,#7b6ba0)', id: 'baroque', label: 'Baroque night' },
  { background: 'linear-gradient(180deg,#e8ddd0 0%,#c4b69a 30%,#8f7a5e 60%,#5c4a3a 100%)', id: 'old-master', label: 'Old master' },
  { background: 'linear-gradient(135deg,#2c5f2d,#97bc62)', id: 'pastoral', label: 'Pastoral green' },
  { background: 'radial-gradient(ellipse at 50% 0%,#f6c576 0 20%,transparent 21%),linear-gradient(180deg,#5d7ca8,#8fa4b8 50%,#4a6741 55%,#3d5535 100%)', id: 'hudson', label: 'Hudson River' },
  { background: 'linear-gradient(180deg,#d4b896,#c4a67d 40%,#a88b6e 60%,#8b7355)', id: 'parchment-aged', label: 'Aged parchment' },
  { background: 'linear-gradient(135deg,#0d1b2a,#1b2838 30%,#354f52 60%,#52796f 80%,#84a98c)', id: 'impressionist', label: 'Impressionist' },
  { background: 'linear-gradient(180deg,#f0e4d4,#e8d5b8 30%,#c9a96e 60%,#a07850)', id: 'fresco', label: 'Fresco' },
];

/**
 * Artwork from the Metropolitan Museum of Art's Open Access collection.
 *
 * Every one of these is in the public domain, and every one of them ships
 * inside the app. Nothing here is fetched when a cover is chosen: the picture
 * is copied straight from the bundle into the workspace's asset store, so the
 * gallery works with no connection and the window never loads a remote
 * address. `objectUrl` is the museum's page for the work, used for credit.
 *
 * Regenerate the images with `node scripts/build-met-covers.mjs`.
 */
export type CoverArtwork = Readonly<{
  artist: string;
  date: string;
  /** Matches the file name in `src/renderer/assets/covers`. */
  id: string;
  objectUrl: string;
  title: string;
}>;

export const MET_JAPANESE_PRINTS: readonly CoverArtwork[] = [
  { artist: 'Katsushika Hokusai', date: 'ca. 1830–32', id: 'met-45434', objectUrl: 'https://www.metmuseum.org/art/collection/search/45434', title: 'Under the Wave off Kanagawa' },
  { artist: 'Katsushika Hokusai', date: 'ca. 1830–32', id: 'met-36493', objectUrl: 'https://www.metmuseum.org/art/collection/search/36493', title: 'Ejiri in Suruga Province' },
  { artist: 'Katsushika Hokusai', date: 'ca. 1830–32', id: 'met-36497', objectUrl: 'https://www.metmuseum.org/art/collection/search/36497', title: 'Tama River in Musashi Province' },
  { artist: 'Katsushika Hokusai', date: 'ca. 1830–32', id: 'met-56242', objectUrl: 'https://www.metmuseum.org/art/collection/search/56242', title: 'The Waterwheel at Onden' },
  { artist: 'Katsushika Hokusai', date: 'ca. 1830–32', id: 'met-56395', objectUrl: 'https://www.metmuseum.org/art/collection/search/56395', title: 'Surugadai in Edo' },
  { artist: 'Katsushika Hokusai', date: 'ca. 1830–32', id: 'met-57003', objectUrl: 'https://www.metmuseum.org/art/collection/search/57003', title: 'Hodogaya on the Tōkaidō' },
  { artist: 'Katsushika Hokusai', date: 'ca. 1830–32', id: 'met-39800', objectUrl: 'https://www.metmuseum.org/art/collection/search/39800', title: 'Kajikazawa in Kai Province' },
  { artist: 'Katsushika Hokusai', date: 'ca. 1830–32', id: 'met-39798', objectUrl: 'https://www.metmuseum.org/art/collection/search/39798', title: 'Lake Suwa in Shinano Province' },
  { artist: 'Katsushika Hokusai', date: 'ca. 1830–32', id: 'met-54868', objectUrl: 'https://www.metmuseum.org/art/collection/search/54868', title: 'Reflection in Lake at Misaka' },
  { artist: 'Katsushika Hokusai', date: 'ca. 1830–32', id: 'met-36504', objectUrl: 'https://www.metmuseum.org/art/collection/search/36504', title: 'Tsukudajima in Musashi Province' },
  { artist: 'Utagawa Hiroshige', date: 'ca. 1834', id: 'met-55049', objectUrl: 'https://www.metmuseum.org/art/collection/search/55049', title: 'Hiratsuka, Nawate Do' },
  { artist: 'Utagawa Hiroshige', date: 'ca. 1834', id: 'met-36965', objectUrl: 'https://www.metmuseum.org/art/collection/search/36965', title: 'Yokkaichi, Sanchokawa' },
];

export const MET_STILL_LIFES: readonly CoverArtwork[] = [
  { artist: 'Vincent van Gogh', date: '1890', id: 'met-436534', objectUrl: 'https://www.metmuseum.org/art/collection/search/436534', title: 'Roses' },
  { artist: 'Vincent van Gogh', date: '1890', id: 'met-436528', objectUrl: 'https://www.metmuseum.org/art/collection/search/436528', title: 'Irises' },
];

export const MET_PORTRAITS: readonly CoverArtwork[] = [
  { artist: 'Rembrandt (Rembrandt van Rijn)', date: '1660', id: 'met-437397', objectUrl: 'https://www.metmuseum.org/art/collection/search/437397', title: 'Self-Portrait' },
  { artist: 'Vincent van Gogh', date: '1887', id: 'met-436532', objectUrl: 'https://www.metmuseum.org/art/collection/search/436532', title: 'Self-Portrait with a Straw Hat' },
];

export const MET_LANDSCAPES: readonly CoverArtwork[] = [
  { artist: 'Vincent van Gogh', date: '1889', id: 'met-436535', objectUrl: 'https://www.metmuseum.org/art/collection/search/436535', title: 'Wheat Field with Cypresses' },
  { artist: 'Thomas Cole', date: '1836', id: 'met-10497', objectUrl: 'https://www.metmuseum.org/art/collection/search/10497', title: 'The Oxbow' },
  { artist: 'Asher Brown Durand', date: '1845', id: 'met-10786', objectUrl: 'https://www.metmuseum.org/art/collection/search/10786', title: 'The Beeches' },
  { artist: 'Joseph Mallord William Turner', date: 'ca. 1835', id: 'met-437853', objectUrl: 'https://www.metmuseum.org/art/collection/search/437853', title: 'Venice, from the Porch of Madonna della Salute' },
];

/**
 * The gallery, as the picker draws it: colours and gradients, then the prints.
 *
 * The invented "cosmos", "landscape" and "classical art" gradient sets that
 * used to sit between them are gone. They were CSS pretending to be pictures,
 * and one honest section of real artwork reads better than seven of those.
 */
export const COVER_GALLERY: readonly CoverCategory[] = [
  { id: 'colors', label: 'Colour & gradient', labelAr: 'ألوان وتدرجات', items: COLORS_AND_GRADIENTS },
];

/**
 * Gradients Max no longer offers, kept so a page that already wears one still
 * paints it. Nothing lists these; only `coverGradient` looks them up.
 */
const RETIRED_GRADIENTS: readonly CoverGradient[] = [
  ...COSMIC, ...LANDSCAPES, ...PATTERNS, ...WARM, ...COOL, ...JAPANESE_ART, ...CLASSICAL_ART,
];

/** Flat list of all gradients across all categories. Kept for backward-compat. */
export const COVER_GRADIENTS: readonly CoverGradient[] = [
  ...COVER_GALLERY.flatMap((category) => category.items),
  ...RETIRED_GRADIENTS,
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
