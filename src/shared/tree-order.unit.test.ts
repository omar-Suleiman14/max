import { describe, expect, it } from 'vitest';

import { byKey, nextFavoriteKey, orderFavorites, planFavoriteMove, planMove, planStep, type NodeMove, type TreeNode } from './tree-order';

const page = (id: string, positionKey: string, parentNodeId: string | null = null): TreeNode => ({ id, kind: 'page', parentNodeId, positionKey });

/** Applies moves and lists each parent's children in stored order. */
function layout(nodes: readonly TreeNode[], moves: readonly NodeMove[]): Record<string, string[]> {
  const applied = nodes.map((node) => { const move = moves.find((candidate) => candidate.id === node.id); return move ? { ...node, ...move } : node; });
  const result: Record<string, string[]> = {};
  for (const node of [...applied].sort(byKey)) (result[node.parentNodeId ?? 'root'] ??= []).push(node.id);
  return result;
}

const tree = [page('a', 'a0'), page('b', 'aV'), page('c', 'ak'), page('a1', 'a0', 'a'), page('a2', 'aV', 'a')];

describe('planning sidebar moves', () => {
  it('reorders with one write using a fractional key', () => {
    const moves = planMove(tree, 'c', 'a', 'before');
    expect(moves).toHaveLength(1);
    expect(layout(tree, moves).root).toEqual(['c', 'a', 'b']);
    expect(layout(tree, planMove(tree, 'a', 'c', 'after')).root).toEqual(['b', 'c', 'a']);
  });

  it('moves a row into a different parent, before, after or inside', () => {
    expect(layout(tree, planMove(tree, 'c', 'a2', 'before')).a).toEqual(['a1', 'c', 'a2']);
    expect(layout(tree, planMove(tree, 'a1', 'b', 'after')).root).toEqual(['a', 'b', 'a1', 'c']);
    const inside = planMove(tree, 'b', 'a', 'inside');
    expect(inside).toEqual([expect.objectContaining({ id: 'b', parentNodeId: 'a' })]);
    expect(layout(tree, inside).a).toEqual(['a1', 'a2', 'b']);
  });

  it('refuses to put a page inside itself or its own descendant', () => {
    expect(planMove(tree, 'a', 'a', 'inside')).toEqual([]);
    expect(planMove(tree, 'a', 'a1', 'inside')).toEqual([]);
    expect(planMove(tree, 'a', 'a2', 'before')).toEqual([]);
  });

  it('never nests inside a database, and keeps a database under its owning page', () => {
    const withDatabase = [...tree, { id: 'db', kind: 'database' as const, parentNodeId: 'a', positionKey: 'az' }];
    expect(planMove(withDatabase, 'b', 'db', 'inside')).toEqual([]);
    expect(planMove(withDatabase, 'db', 'b', 'after')).toEqual([]);
    expect(layout(withDatabase, planMove(withDatabase, 'db', 'a1', 'before')).a).toEqual(['db', 'a1', 'a2']);
  });

  it('re-keys only the destination siblings when older keys leave no room', () => {
    const legacy = [page('x', 'k-1'), page('y', 'k.1'), page('z', 'a0')];
    const moves = planMove(legacy, 'z', 'y', 'before');
    expect(moves.length).toBeGreaterThan(1);
    expect(layout(legacy, moves).root).toEqual(['x', 'z', 'y']);
  });

  it('steps a row past its sibling with Alt+Arrow and stops at the ends', () => {
    expect(layout(tree, planStep(tree, 'b', -1)).root).toEqual(['b', 'a', 'c']);
    expect(layout(tree, planStep(tree, 'b', 1)).root).toEqual(['a', 'c', 'b']);
    expect(planStep(tree, 'a', -1)).toEqual([]);
  });

  it('sorts keys in byte order like SQLite, not locale order', () => {
    expect([page('l', 'a'), page('u', 'B')].sort(byKey).map((node) => node.id)).toEqual(['u', 'l']);
  });
});

describe('ordering favourites', () => {
  const favorites = [{ id: 'one' }, { favoriteKey: 'aV', id: 'two' }, { favoriteKey: 'a0', id: 'three' }];

  it('puts keyed favourites first in key order and older ones after, in page order', () => {
    expect(orderFavorites(favorites).map((entry) => entry.id)).toEqual(['three', 'two', 'one']);
  });

  it('adds a new favourite at the end', () => {
    const key = nextFavoriteKey(favorites);
    expect(key > 'aV').toBe(true);
  });

  it('reorders favourites and gives every favourite a key the first time', () => {
    const keys = planFavoriteMove(favorites, 'one', 'three', 'before');
    const reordered = orderFavorites(favorites.map((entry) => ({ ...entry, favoriteKey: keys.get(entry.id) ?? entry.favoriteKey })));
    expect(reordered.map((entry) => entry.id)).toEqual(['one', 'three', 'two']);
    const keyed = reordered.map((entry, index) => ({ ...entry, favoriteKey: ['a0', 'aV', 'ak'][index] }));
    expect(planFavoriteMove(keyed, 'two', 'one', 'before').size).toBe(1);
  });
});
