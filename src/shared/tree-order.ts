import { generateInitialOrderKeys, generateOrderKey } from './order-key';

export type TreeNode = Readonly<{ id: string; kind: 'database' | 'page'; parentNodeId?: string | null; positionKey: string }>;
export type DropEdge = 'after' | 'before' | 'inside';
export type NodeMove = Readonly<{ id: string; parentNodeId: string | null; positionKey: string }>;

/** Byte order, the same order SQLite returns position keys in. */
export const byKey = (left: { positionKey: string }, right: { positionKey: string }) => (left.positionKey < right.positionKey ? -1 : left.positionKey > right.positionKey ? 1 : 0);

/** A key strictly between two neighbours, or undefined when they cannot take one. */
function keyBetween(previous?: string, next?: string): string | undefined {
  try {
    const key = generateOrderKey(previous, next);
    if ((previous && key <= previous) || (next && key >= next)) return undefined;
    return key;
  } catch {
    // Keys written by older versions can hold characters outside the order-key alphabet.
    return undefined;
  }
}

/** Fresh fractional keys for a whole sibling group, in order. */
export const spreadKeys = (count: number): string[] => generateInitialOrderKeys(count);

export function isDescendant(nodes: readonly TreeNode[], candidateId: string, ancestorId: string): boolean {
  const parentOf = new Map(nodes.map((node) => [node.id, node.parentNodeId ?? null] as const));
  const seen = new Set<string>();
  for (let current = parentOf.get(candidateId) ?? null; current; current = parentOf.get(current) ?? null) {
    if (current === ancestorId) return true;
    if (seen.has(current)) return false;
    seen.add(current);
  }
  return false;
}

/**
 * Plans a sidebar move with fractional ordering: normally one write for the
 * moved node. Only when its neighbours carry keys no key fits between (keys
 * written by older versions) is the destination sibling group re-keyed.
 * Returns no writes for a move that would put a node inside itself.
 */
export function planMove(nodes: readonly TreeNode[], movedId: string, targetId: string, edge: DropEdge): readonly NodeMove[] {
  const moved = nodes.find((node) => node.id === movedId);
  const target = nodes.find((node) => node.id === targetId);
  if (!moved || !target || movedId === targetId) return [];
  if (edge === 'inside' && target.kind !== 'page') return [];
  const parentNodeId = edge === 'inside' ? target.id : (target.parentNodeId ?? null);
  if (parentNodeId === movedId || (parentNodeId && isDescendant(nodes, parentNodeId, movedId))) return [];
  // A database is listed under the page that owns it, so it only moves among that page's children.
  if (moved.kind === 'database' && parentNodeId !== (moved.parentNodeId ?? null)) return [];

  const ids = new Set(nodes.map((node) => node.id));
  const siblings = nodes
    .filter((node) => node.id !== movedId && ((node.parentNodeId && ids.has(node.parentNodeId) ? node.parentNodeId : null) === parentNodeId))
    .sort(byKey);
  const insertAt = edge === 'inside' ? siblings.length : siblings.findIndex((node) => node.id === targetId) + (edge === 'after' ? 1 : 0);
  const key = keyBetween(siblings[insertAt - 1]?.positionKey, siblings[insertAt]?.positionKey);
  if (key) return [{ id: movedId, parentNodeId, positionKey: key }];

  const ordered = [...siblings.slice(0, insertAt), moved, ...siblings.slice(insertAt)];
  const keys = spreadKeys(ordered.length);
  return ordered.map((node, index) => ({ id: node.id, parentNodeId: node.id === movedId ? parentNodeId : (node.parentNodeId ?? null), positionKey: keys[index]! }));
}

/** Alt+Up / Alt+Down: swap places with the neighbouring sibling. */
export function planStep(nodes: readonly TreeNode[], movedId: string, direction: -1 | 1): readonly NodeMove[] {
  const moved = nodes.find((node) => node.id === movedId);
  if (!moved) return [];
  const ids = new Set(nodes.map((node) => node.id));
  const parent = moved.parentNodeId && ids.has(moved.parentNodeId) ? moved.parentNodeId : null;
  const siblings = nodes.filter((node) => (node.parentNodeId && ids.has(node.parentNodeId) ? node.parentNodeId : null) === parent).sort(byKey);
  const neighbour = siblings[siblings.findIndex((node) => node.id === movedId) + direction];
  return neighbour ? planMove(nodes, movedId, neighbour.id, direction < 0 ? 'before' : 'after') : [];
}

export type FavoriteEntry = Readonly<{ id: string; favoriteKey?: string }>;

/** Favourites with a key come first in key order; older ones keep page order after them. */
export function orderFavorites<T extends FavoriteEntry>(favorites: readonly T[]): T[] {
  const keyed = favorites.filter((entry) => entry.favoriteKey).sort((left, right) => (left.favoriteKey! < right.favoriteKey! ? -1 : 1));
  return [...keyed, ...favorites.filter((entry) => !entry.favoriteKey)];
}

/** The key a newly added favourite takes: after every existing one. */
export function nextFavoriteKey(favorites: readonly FavoriteEntry[]): string {
  const ordered = orderFavorites(favorites);
  const last = ordered.map((entry) => entry.favoriteKey).filter(Boolean).at(-1);
  return keyBetween(last, undefined) ?? spreadKeys(ordered.length + 1).at(-1)!;
}

/** Re-keys the favourites list in its new order. Every favourite gets a key, so later moves are one write. */
export function planFavoriteMove(favorites: readonly FavoriteEntry[], movedId: string, targetId: string, edge: 'after' | 'before'): ReadonlyMap<string, string> {
  const ordered = orderFavorites(favorites);
  const moved = ordered.find((entry) => entry.id === movedId);
  if (!moved || movedId === targetId) return new Map();
  const rest = ordered.filter((entry) => entry.id !== movedId);
  const at = rest.findIndex((entry) => entry.id === targetId);
  if (at < 0) return new Map();
  const insertAt = at + (edge === 'after' ? 1 : 0);
  if (rest.every((entry) => entry.favoriteKey)) {
    const key = keyBetween(rest[insertAt - 1]?.favoriteKey, rest[insertAt]?.favoriteKey);
    if (key) return new Map([[movedId, key]]);
  }
  const next = [...rest.slice(0, insertAt), moved, ...rest.slice(insertAt)];
  const keys = spreadKeys(next.length);
  return new Map(next.flatMap((entry, index) => (entry.favoriteKey === keys[index] ? [] : [[entry.id, keys[index]!] as const])));
}
