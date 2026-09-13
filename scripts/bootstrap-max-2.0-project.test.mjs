import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectItems } from './bootstrap-max-2.0-project.mjs';

test('reads all 138 items and excludes other repositories and non-issues', () => {
  const nodes = Array.from({ length: 138 }, (_, i) => ({
    id: `item-${i + 1}`,
    content: { number: i + 1, repository: { nameWithOwner: 'omar-Suleiman14/max' } },
  }));
  const cursors = [];
  const items = projectItems('project', (query, variables) => {
    assert.match(query, /after:\$cursor/);
    cursors.push(variables.cursor);
    return { node: { items: variables.cursor ? {
      nodes: [...nodes.slice(100), null, { content: null },
        { id: 'foreign', content: { number: 138, repository: { nameWithOwner: 'other/repo' } } }],
      pageInfo: { hasNextPage: false, endCursor: null },
    } : {
      nodes: nodes.slice(0, 100), pageInfo: { hasNextPage: true, endCursor: 'next-page' },
    } } };
  });
  assert.deepEqual(cursors, [undefined, 'next-page']);
  assert.equal(items.size, 138);
  assert.equal(items.get(138), 'item-138');
});

test('fails instead of silently truncating when a continuation cursor is missing', () => {
  assert.throws(() => projectItems('project', () => ({ node: { items: {
    nodes: [], pageInfo: { hasNextPage: true, endCursor: null },
  } } })), /no cursor/);
});
