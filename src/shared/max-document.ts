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
  /** Omitted by early v1 writers; omission means block version 1. */
  version?: number;
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
  return document.version === MAX_DOCUMENT_VERSION && Array.isArray(document.blocks) && document.blocks.every(isMaxBlock);
}

export function isMaxBlock(value: unknown): value is MaxBlock {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const block = value as Record<string, unknown>;
  return typeof block.id === 'string' && !!block.id && typeof block.type === 'string' && !!block.type
    && !!block.data && typeof block.data === 'object' && !Array.isArray(block.data)
    && (block.version === undefined || (typeof block.version === 'number' && Number.isInteger(block.version) && block.version > 0))
    && (block.children === undefined || (Array.isArray(block.children) && block.children.every(isMaxBlock)));
}

export function emptyMaxDocument(): MaxDocument {
  return { blocks: [], version: MAX_DOCUMENT_VERSION };
}
