import type { NotionBlock } from './notion-block-editor';

const supported = new Set(['text', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'quote', 'code']);

export function canUseBlockNote(blocks: readonly NotionBlock[]): boolean {
  return blocks.every((block) => supported.has(block.type));
}
