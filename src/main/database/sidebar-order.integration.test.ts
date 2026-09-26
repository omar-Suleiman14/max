import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { planMove, type TreeNode } from '../../shared/tree-order';
import { DatabaseService } from './database-service';

function open(path: string) {
  const db = new DatabaseService(path);
  db.initialize();
  return db;
}

const treeOf = (db: DatabaseService): TreeNode[] => db.workspace.getNavigation().pages.map((page) => ({ id: page.id, kind: 'page', parentNodeId: page.parentNodeId ?? null, positionKey: page.positionKey }));
const childrenOf = (db: DatabaseService, parent: string | null) => db.workspace.getNavigation().pages.filter((page) => (page.parentNodeId ?? null) === parent).map((page) => page.title);

describe('sidebar ordering survives a restart', () => {
  it('stores fractional moves and reads them back in the same order', () => {
    const directory = mkdtempSync(join(tmpdir(), 'max-sidebar-'));
    const path = join(directory, 'workspace.db');
    try {
      let db = open(path);
      const ids = Object.fromEntries(['One', 'Two', 'Three'].map((title, index) => [title, db.workspace.createNode({ contentJson: '{}', kind: 'page', positionKey: ['a0', 'aV', 'ak'][index], title }).id]));
      const apply = (moves: ReturnType<typeof planMove>) => { for (const move of moves) db.workspace.updateNode(move.id, { parentNodeId: move.parentNodeId, positionKey: move.positionKey }); };

      apply(planMove(treeOf(db), ids.Three!, ids.One!, 'before'));
      apply(planMove(treeOf(db), ids.One!, ids.Two!, 'inside'));
      db.close();

      db = open(path);
      expect(childrenOf(db, null)).toEqual(['Three', 'Two']);
      expect(childrenOf(db, ids.Two!)).toEqual(['One']);
      db.close();
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
