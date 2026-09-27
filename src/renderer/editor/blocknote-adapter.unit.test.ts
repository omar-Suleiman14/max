import { describe, expect, it } from 'vitest';

import { legacyBlocksToMaxDocument, maxDocumentToLegacyBlocks } from '../../shared/max-document-legacy';
import type { MaxBlock } from '../../shared/max-document';
import { EDITABLE_MAX_BLOCK_TYPES, fromBlockNote, indexBlocks, inlineFromBlockNote, inlineToBlockNote, toBlockNote, toMaxDocument, type BnBlock } from './blocknote-adapter';

/** Every block kind the desktop editor has ever stored, in its stored shape. */
const legacy = [
  { id: 't', type: 'text', content: 'Hello **world** and [Plans](max-page:p1)', color: 'blue', backgroundColor: 'yellow_bg' },
  { id: 'h1', type: 'h1', content: 'Title' },
  { id: 'h2', type: 'h2', content: 'Sub' },
  { id: 'h3', type: 'h3', content: 'Small' },
  { id: 'b', type: 'bullet', content: 'point' },
  { id: 'n', type: 'number', content: 'step' },
  { id: 'td', type: 'todo', content: 'task', checked: true },
  { id: 'q', type: 'quote', content: 'said' },
  { id: 'c', type: 'code', content: 'const a = 1;\n  return *a*;' },
  { id: 'tg', type: 'toggle', content: 'More', checked: false, col1Blocks: [{ id: 'tg1', type: 'text', content: 'inside' }] },
  { id: 'co', type: 'callout', content: 'Note', calloutIcon: 'lucide:Star' },
  { id: 'd', type: 'divider', content: '' },
  { id: 'i', type: 'image', content: '', url: 'max://asset/' + 'a'.repeat(64) + '.png', caption: 'cat.png', width: 320 },
  { id: 'v', type: 'video', content: '', url: 'https://example.com/v.mp4', caption: 'clip' },
  { id: 'a', type: 'audio', content: '', url: 'https://example.com/a.mp3', caption: '' },
  { id: 'f', type: 'file', content: '', url: 'max://attachment/' + 'b'.repeat(64) + '.pdf', caption: 'report.pdf' },
  { id: 'st', type: 'simple-table', content: '', cells: [['a', '**b**'], ['c', '']] },
  { id: 'cols', type: 'columns', content: '', col1Blocks: [{ id: 'l', type: 'text', content: 'left' }], col2Blocks: [] },
  { id: 'db', type: 'database-view', content: '', databaseId: 'db1', viewId: 'v1' },
  { id: 'dbl', type: 'database-view', content: 'items', databaseKind: 'items' },
  { id: 'pl', type: 'page-link', content: '', pageId: 'p2' },
  { id: 'e', type: 'embed', content: '', url: 'https://example.com', caption: 'site' },
  { id: 'bm', type: 'bookmark', content: '', url: 'https://example.com/b', caption: '' },
  { id: 'toc', type: 'table-of-contents', content: '' },
  { id: 'future', type: 'kanban-3d', content: 'x', extra: { deep: [1, 2] } },
];

function roundTrip(blocks: readonly MaxBlock[]) {
  const index = indexBlocks(blocks);
  return toMaxDocument(toBlockNote({ blocks, version: 1 }), (id) => index.get(id)).blocks;
}

describe('MaxDocument ↔ BlockNote adapter', () => {
  it('covers every editable Max block kind in the fixtures', () => {
    const kinds = new Set(legacy.map((block) => block.type));
    for (const type of EDITABLE_MAX_BLOCK_TYPES) expect(kinds).toContain(type);
  });

  it('round-trips every stored block kind without semantic loss', () => {
    const document = legacyBlocksToMaxDocument(legacy);
    const back = roundTrip(document.blocks);
    const normalize = (blocks: readonly MaxBlock[]) => maxDocumentToLegacyBlocks({ blocks, version: 1 }).map((block) => JSON.parse(JSON.stringify(block)) as Record<string, unknown>);
    const expected = normalize(document.blocks).map((block) => {
      // Void blocks do not own text; an empty legacy `content` is not meaning.
      if (block.content === '' && !['text', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'quote', 'code', 'toggle', 'callout'].includes(String(block.type))) delete block.content;
      return block;
    });
    const actual = normalize(back).map((block) => { if (block.content === '' && !['text', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'quote', 'code', 'toggle', 'callout'].includes(String(block.type))) delete block.content; return block; });
    expect(actual).toEqual(expected);
  });

  it('keeps Max ids on every block, including nested toggle children', () => {
    const bn = toBlockNote(legacyBlocksToMaxDocument(legacy));
    expect(bn.map((block) => block.id)).toEqual(legacy.map((block) => block.id));
    expect(bn.find((block) => block.id === 'tg')!.children[0]!.id).toBe('tg1');
  });

  it('preserves an unknown block kind byte-for-byte', () => {
    const [future] = roundTrip(legacyBlocksToMaxDocument([legacy.at(-1)]).blocks);
    expect(future).toEqual(legacyBlocksToMaxDocument([legacy.at(-1)]).blocks[0]);
  });

  it('preserves a future version of a known block', () => {
    const block: MaxBlock = { data: { content: 'v2', newField: true }, id: 'x', type: 'text', version: 2 };
    expect(roundTrip([block])).toEqual([block]);
    expect(toBlockNote({ blocks: [block], version: 1 })[0]!.type).toBe('unsupported');
  });

  it('keeps fields the editor cannot see and block-level extensions', () => {
    const block = { data: { content: 'a', reviewedBy: 'sam' }, id: 'x', type: 'text', syncStamp: 7 } as unknown as MaxBlock;
    expect(roundTrip([block])).toEqual([block]);
  });

  it('drops the old kind\'s fields when a block is turned into another kind', () => {
    const original: MaxBlock = { data: { checked: true, content: 'task', note: 'keep' }, id: 'x', type: 'todo' };
    const edited: BnBlock = { children: [], content: [{ styles: {}, text: 'task', type: 'text' }], id: 'x', props: { level: 2 }, type: 'heading' };
    expect(fromBlockNote(edited, () => original)).toEqual({ data: { content: 'task', note: 'keep' }, id: 'x', type: 'h2' });
  });

  it('stores nesting created in the editor as Max children', () => {
    const edited: BnBlock = { children: [{ children: [], content: [], id: 'c', props: {}, type: 'paragraph' }], content: [], id: 'p', props: {}, type: 'paragraph' };
    expect(fromBlockNote(edited)).toEqual({ children: [{ data: { content: '' }, id: 'c', type: 'text' }], data: { content: '' }, id: 'p', type: 'text' });
  });

  it('keeps page links as Max page ids with their label formatting', () => {
    const inline = inlineToBlockNote('see [**Plans**](max-page:p1) and [site](https://a.b/)');
    expect(inline).toContainEqual({ props: { label: '**Plans**', pageId: 'p1' }, type: 'pageMention' });
    expect(inlineFromBlockNote(inline)).toBe('see [**Plans**](max-page:p1) and [site](https://a.b/)');
  });

  it('gives an unsupported copy its own id when pasted', () => {
    const source: MaxBlock = { data: { a: 1 }, id: 'orig', type: 'mystery' };
    const pasted: BnBlock = { children: [], id: 'copy', props: { source: JSON.stringify(source) }, type: 'unsupported' };
    expect(fromBlockNote(pasted).id).toBe('copy');
  });
});
