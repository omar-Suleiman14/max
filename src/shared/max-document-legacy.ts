import { isMaxDocument, MAX_DOCUMENT_VERSION, type MaxBlock, type MaxDocument } from './max-document';

type LegacyBlock = Readonly<Record<string, unknown>>;
type PageEnvelope = Readonly<Record<string, unknown>>;

export type ParsedPageDocument = Readonly<{
  document: MaxDocument;
  /** Page-level fields are deliberately outside the editor document. */
  metadata: PageEnvelope;
  /** Unsupported or damaged content must never be replaced by an empty editor. */
  readOnlySource?: string;
}>;

const sourceBlock = Symbol('max-document-source');

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function idFor(block: LegacyBlock, index: number): string {
  return typeof block.id === 'string' && block.id ? block.id : `legacy-block-${index}`;
}

function toMaxBlock(value: unknown, index: number): MaxBlock {
  if (!isRecord(value)) return { data: { raw: value }, id: `legacy-block-${index}`, type: 'unknown' };
  const rawType = value.type;
  const original = (value as { [sourceBlock]?: MaxBlock })[sourceBlock];
  const data: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!['id', 'type'].includes(key)) data[key] = item;
  }
  return {
    ...original,
    ...(original?.children && (rawType === 'toggle' || rawType === 'columns') ? { children: undefined } : {}),
    data,
    id: idFor(value, index),
    type: typeof rawType === 'string' && rawType ? rawType : 'unknown',
  };
}

function toLegacyBlock(block: MaxBlock): LegacyBlock {
  // MaxBlock.data is copied untouched, including fields from future block
  // versions. This is the lossless unknown-block guarantee.
  const legacy: Record<string, unknown> & { [sourceBlock]?: MaxBlock } = { ...block.data, id: block.id, type: block.type };
  if (Object.keys(block).some((key) => !['id', 'type', 'data'].includes(key))) legacy[sourceBlock] = block;
  if (block.children?.length) {
    if (block.type === 'columns') {
      // The old adapter erased column boundaries. Do not invent new ones.
      legacy.children = block.children.map(toLegacyBlock);
    } else if (block.type === 'toggle') legacy.col1Blocks = block.children.map(toLegacyBlock);
  }
  return legacy;
}

export function isUnsupportedLegacyBlock(block: LegacyBlock): boolean {
  const original = (block as { [sourceBlock]?: MaxBlock })[sourceBlock];
  return original?.version !== undefined && original.version !== 1;
}

/** Reads both historic `{ blocks }` pages and versioned MaxDocument pages. */
export function parsePageDocument(contentJson: string): ParsedPageDocument {
  try {
    const parsed: unknown = JSON.parse(contentJson);
    if (Array.isArray(parsed)) return { document: { blocks: parsed.map(toMaxBlock), version: MAX_DOCUMENT_VERSION }, metadata: {} };
    if (!isRecord(parsed)) throw new Error('Invalid page');
    const { document, blocks, ...metadata } = parsed;
    if (document !== undefined) {
      if (!isMaxDocument(document)) throw new Error('Unsupported document');
      return { document, metadata,
        ...(document.blocks.some(ambiguousColumns) ? { readOnlySource: contentJson } : {}) };
    }
    if (blocks !== undefined && !Array.isArray(blocks)) throw new Error('Invalid blocks');
    return { document: { blocks: Array.isArray(blocks) ? blocks.map(toMaxBlock) : [], version: MAX_DOCUMENT_VERSION }, metadata };
  } catch {
    return { document: { blocks: [], version: MAX_DOCUMENT_VERSION }, metadata: {}, readOnlySource: contentJson };
  }
}

function ambiguousColumns(block: MaxBlock): boolean {
  return (block.type === 'columns' && !!block.children?.length && !Array.isArray(block.data.col1Blocks))
    || (block.children?.some(ambiguousColumns) ?? false);
}

/** Writes the canonical document alongside page-level metadata, never editor JSON. */
export function serializePageDocument({ document, metadata, readOnlySource }: ParsedPageDocument): string {
  return readOnlySource ?? JSON.stringify({ ...metadata, document });
}

/** Adapter boundary for the existing desktop editor during its migration. */
export function maxDocumentToLegacyBlocks(document: MaxDocument): readonly LegacyBlock[] {
  return document.blocks.map(toLegacyBlock);
}

export function legacyBlocksToMaxDocument(blocks: readonly unknown[]): MaxDocument {
  return { blocks: blocks.map(toMaxBlock), version: MAX_DOCUMENT_VERSION };
}
