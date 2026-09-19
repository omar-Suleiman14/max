import { describe, expect, it } from 'vitest';

import { legacyBlocksToMaxDocument, maxDocumentToLegacyBlocks, parsePageDocument, serializePageDocument } from './max-document-legacy';

describe('MaxDocument legacy boundary', () => {
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
