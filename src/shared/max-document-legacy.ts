import { MAX_DOCUMENT_VERSION, type MaxBlock, type MaxDocument } from './max-document';

type LegacyBlock = Readonly<Record<string, unknown>>;
type PageEnvelope = Readonly<Record<string, unknown>>;

export type ParsedPageDocument = Readonly<{
  document: MaxDocument;
  /** Page-level fields are deliberately outside the editor document. */
  metadata: PageEnvelope;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function idFor(block: LegacyBlock, index: number): string {
  return typeof block.id === 'string' && block.id ? block.id : `legacy-block-${index}`;
}

function toMaxBlock(value: unknown, index: number): MaxBlock {
  if (!isRecord(value)) return { data: { raw: value }, id: `legacy-block-${index}`, type: 'unknown' };
  // Already canonical. Keep its data and child blocks byte-for-byte in shape
  // rather than treating `data` as a legacy field named "data".
  if (typeof value.id === 'string' && typeof value.type === 'string' && isRecord(value.data)) {
    return {
      children: Array.isArray(value.children) ? value.children.map(toMaxBlock) : undefined,
      data: value.data,
      id: value.id,
      type: value.type,
    };
  }
  const col1Blocks = value.col1Blocks;
  const col2Blocks = value.col2Blocks;
  const rawType = value.type;
  const data: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!['col1Blocks', 'col2Blocks', 'id', 'type'].includes(key)) data[key] = item;
  }
  const left: readonly unknown[] = Array.isArray(col1Blocks) ? col1Blocks : [];
  const right: readonly unknown[] = Array.isArray(col2Blocks) ? col2Blocks : [];
  const children = [
    ...left,
    ...right,
  ].map(toMaxBlock);
  return {
    children: children.length ? children : undefined,
    data,
    id: idFor(value, index),
    type: typeof rawType === 'string' && rawType ? rawType : 'unknown',
  };
}

function toLegacyBlock(block: MaxBlock): LegacyBlock {
  // MaxBlock.data is copied untouched, including fields from future block
  // versions. This is the lossless unknown-block guarantee.
  const legacy: Record<string, unknown> = { ...block.data, id: block.id, type: block.type };
  if (block.children?.length) {
    if (block.type === 'columns') {
      const middle = Math.ceil(block.children.length / 2);
      legacy.col1Blocks = block.children.slice(0, middle).map(toLegacyBlock);
      legacy.col2Blocks = block.children.slice(middle).map(toLegacyBlock);
    } else legacy.children = block.children.map(toLegacyBlock);
  }
  return legacy;
}

/** Reads both historic `{ blocks }` pages and versioned MaxDocument pages. */
export function parsePageDocument(contentJson: string): ParsedPageDocument {
  try {
    const parsed: unknown = JSON.parse(contentJson);
    if (Array.isArray(parsed)) return { document: { blocks: parsed.map(toMaxBlock), version: MAX_DOCUMENT_VERSION }, metadata: {} };
    if (!isRecord(parsed)) return { document: { blocks: [], version: MAX_DOCUMENT_VERSION }, metadata: {} };
    const { document, blocks, ...metadata } = parsed;
    if (isRecord(document) && document.version === MAX_DOCUMENT_VERSION && Array.isArray(document.blocks)) {
      return { document: { blocks: document.blocks.map(toMaxBlock), version: MAX_DOCUMENT_VERSION }, metadata };
    }
    return { document: { blocks: Array.isArray(blocks) ? blocks.map(toMaxBlock) : [], version: MAX_DOCUMENT_VERSION }, metadata };
  } catch {
    return { document: { blocks: [], version: MAX_DOCUMENT_VERSION }, metadata: {} };
  }
}

/** Writes the canonical document alongside page-level metadata, never editor JSON. */
export function serializePageDocument({ document, metadata }: ParsedPageDocument): string {
  return JSON.stringify({ ...metadata, document });
}

/** Adapter boundary for the existing desktop editor during its migration. */
export function maxDocumentToLegacyBlocks(document: MaxDocument): readonly LegacyBlock[] {
  return document.blocks.map(toLegacyBlock);
}

export function legacyBlocksToMaxDocument(blocks: readonly unknown[]): MaxDocument {
  return { blocks: blocks.map(toMaxBlock), version: MAX_DOCUMENT_VERSION };
}
