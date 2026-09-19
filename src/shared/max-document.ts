/**
 * Max's editor-neutral page representation.
 *
 * Editors exchange their own view models with adapters at their boundary. This
 * contract is the only block format that belongs in a Max page payload.
 */
export const MAX_DOCUMENT_VERSION = 1 as const;

export type MaxBlockData = Readonly<Record<string, unknown>>;

export type MaxBlock = Readonly<{
  /** Stable Max-owned identity. It never comes from an editor implementation. */
  id: string;
  /** A Max block kind. Unknown kinds are deliberately valid for lossless sync. */
  type: string;
  /** Block-specific fields, independent of an editor's node schema. */
  data: MaxBlockData;
  /** Nested Max blocks, used by toggles and columns. */
  children?: readonly MaxBlock[];
}>;

export type MaxDocument = Readonly<{
  blocks: readonly MaxBlock[];
  version: typeof MAX_DOCUMENT_VERSION;
}>;

export function isMaxDocument(value: unknown): value is MaxDocument {
  if (!value || typeof value !== 'object') return false;
  const document = value as Record<string, unknown>;
  return document.version === MAX_DOCUMENT_VERSION && Array.isArray(document.blocks);
}

export function emptyMaxDocument(): MaxDocument {
  return { blocks: [], version: MAX_DOCUMENT_VERSION };
}
