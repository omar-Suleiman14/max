/**
 * The renderer's view of a page block: a MaxBlock with its data fields laid
 * flat, as `maxDocumentToLegacyBlocks` produces it. Page state, templates and
 * record notes pass blocks around in this shape; the editor converts them to
 * and from MaxDocument at its boundary.
 */
export type BlockType =
  | 'page-link' | 'embed' | 'bookmark' | 'image' | 'video' | 'audio' | 'file' | 'simple-table' | 'table-of-contents'
  | 'quote' | 'code' | 'toggle' | 'bullet' | 'callout'
  | 'columns' // legacy: preserve each column independently
  | 'database-view' | 'divider' | 'h1' | 'h2' | 'h3' | 'number' | 'text' | 'todo';

export type NotionBlock = {
  pageId?: string;
  url?: string;
  /** Rendered width in pixels for an image the person resized. */
  width?: number;
  caption?: string;
  cells?: readonly (readonly string[])[];
  calloutIcon?: string;
  checked?: boolean;
  col1Blocks?: readonly NotionBlock[];
  col2Blocks?: readonly NotionBlock[];
  color?: string;
  backgroundColor?: string;
  content: string;
  databaseId?: string;
  databaseKind?: 'accounts' | 'items' | 'people' | 'reconciliation' | 'transactions';
  id: string;
  type: BlockType;
  viewId?: string;
};
