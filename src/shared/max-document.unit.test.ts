import { describe, expect, it } from 'vitest';

import { legacyBlocksToMaxDocument, maxDocumentToLegacyBlocks, parsePageDocument, serializePageDocument } from './max-document-legacy';

describe('MaxDocument legacy boundary', () => {
  it.each(['text', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'quote', 'code', 'toggle', 'callout', 'columns', 'database-view', 'divider', 'page-link', 'embed', 'bookmark', 'image', 'video', 'audio', 'file', 'simple-table', 'table-of-contents'])('preserves all fields of legacy %s blocks', (type) => {
    const blocks = [{ id: 'block', type, content: '**مرحبا** [link](max-page:page-1)', checked: false, pageId: 'page-1', data: { custom: true }, cells: [['A', 'B']], col1Blocks: [{ id: 'nested', type: 'toggle', content: 'More', col1Blocks: [{ id: 'empty', type: 'text', content: '' }] }], col2Blocks: [] }];
    const document = parsePageDocument(serializePageDocument({ document: legacyBlocksToMaxDocument(blocks), metadata: {} })).document;
    expect(maxDocumentToLegacyBlocks(document)).toEqual(blocks);
  });

  it.each(['{', 'null', '{"blocks":42}', '{"document":{"version":2,"blocks":[]}}', '{"document":{"version":1,"blocks":[null]}}'])('preserves unreadable source without overwriting it: %s', (source) => {
    const parsed = parsePageDocument(source);
    expect(parsed.readOnlySource).toBe(source);
    expect(serializePageDocument(parsed)).toBe(source);
  });

  it('retains unknown canonical block versions and extension fields after a renderer edit', () => {
    const source = { document: { version: 1, blocks: [{ id: 'future', type: 'future-widget', version: 9, extra: { retained: true }, data: { content: 'Original' } }] }, customMetadata: { retained: true } };
    const parsed = parsePageDocument(JSON.stringify(source));
    const edited = maxDocumentToLegacyBlocks(parsed.document).map(block => ({ ...block, content: 'Edited' }));
    const saved = JSON.parse(serializePageDocument({ ...parsed, document: legacyBlocksToMaxDocument(edited) })) as typeof source;
    expect(saved.document.blocks[0]).toEqual({ ...source.document.blocks[0], data: { content: 'Edited' } });
    expect(saved.customMetadata).toEqual(source.customMetadata);
  });

  it('does not guess lost column boundaries from the earlier adapter', () => {
    const source = JSON.stringify({ document: { version: 1, blocks: [{ id: 'cols', type: 'columns', data: {}, children: [{ id: 'child', type: 'text', data: { content: 'Kept' } }] }] } });
    expect(serializePageDocument(parsePageDocument(source))).toBe(source);
    expect(parsePageDocument(source).readOnlySource).toBe(source);
  });
  it('migrates legacy pages to the versioned document envelope without changing blocks', () => {
    const parsed = parsePageDocument(JSON.stringify({ blocks: [{ content: 'Hello', id: 'text-1', type: 'text' }], cover: { kind: 'gradient', value: 'blue' } }));

    expect(parsed.document).toEqual({ blocks: [{ data: { content: 'Hello' }, id: 'text-1', type: 'text' }], version: 1 });
    expect(JSON.parse(serializePageDocument(parsed))).toEqual({
      cover: { kind: 'gradient', value: 'blue' },
      document: { blocks: [{ data: { content: 'Hello' }, id: 'text-1', type: 'text' }], version: 1 },
    });
  });

  it('preserves a block type and fields unknown to this build through a round trip', () => {
    const document = legacyBlocksToMaxDocument([{ id: 'future-1', type: 'future-widget', widgetVersion: 9, payload: { value: 'kept' } }]);

    expect(maxDocumentToLegacyBlocks(document)).toEqual([{ id: 'future-1', payload: { value: 'kept' }, type: 'future-widget', widgetVersion: 9 }]);
    expect(parsePageDocument(serializePageDocument({ document, metadata: {} })).document).toEqual(document);
  });

  it('preserves nested blocks', () => {
    const document = legacyBlocksToMaxDocument([{ id: 'toggle', type: 'toggle', content: 'More', children: [{ id: 'child', type: 'text', content: 'Kept' }] }]);

    expect(maxDocumentToLegacyBlocks(document)).toEqual([{ children: [{ content: 'Kept', id: 'child', type: 'text' }], content: 'More', id: 'toggle', type: 'toggle' }]);
  });
});
