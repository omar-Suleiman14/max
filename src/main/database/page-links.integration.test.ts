import { describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';

function workspace(): DatabaseService {
  const db = new DatabaseService(':memory:');
  db.initialize();
  return db;
}

const linkTo = (id: string, label: string) => JSON.stringify({ document: { blocks: [{ content: `see [${label}](max-page:${id})`, id: 'b', type: 'text' }], version: 1 } });

describe('page links in the page graph', () => {
  it('keeps incoming links after a rename and reads the new title', () => {
    const db = workspace();
    const target = db.workspace.createNode({ contentJson: '{}', kind: 'page', title: 'Plans' });
    const source = db.workspace.createNode({ contentJson: linkTo(target.id, 'Plans'), kind: 'page', title: 'Notes' });
    db.workspace.updateNode(target.id, { title: 'Roadmap' });
    const graph = db.workspace.getPageGraph();
    expect(graph.links).toContainEqual({ sourceId: source.id, targetId: target.id });
    expect(graph.pages.find((page) => page.id === target.id)?.title).toBe('Roadmap');
    db.close();
  });

  it('reports a link to an archived page as in Trash, and as a link again after restore', () => {
    const db = workspace();
    const target = db.workspace.createNode({ contentJson: '{}', kind: 'page', title: 'Old plan' });
    const source = db.workspace.createNode({ contentJson: linkTo(target.id, 'Old plan'), kind: 'page', title: 'Notes' });
    db.workspace.archiveNode(target.id);
    let graph = db.workspace.getPageGraph();
    expect(graph.links).toEqual([]);
    expect(graph.brokenLinks).toEqual([{ sourceId: source.id, state: 'archived', targetId: target.id, title: 'Old plan' }]);
    db.workspace.restoreNode(target.id);
    graph = db.workspace.getPageGraph();
    expect(graph.links).toContainEqual({ sourceId: source.id, targetId: target.id });
    expect(graph.brokenLinks).toEqual([]);
    db.close();
  });

  it('reports a link to a page that no longer exists as deleted', () => {
    const db = workspace();
    const source = db.workspace.createNode({ contentJson: linkTo('missing-id', 'Gone'), kind: 'page', title: 'Notes' });
    expect(db.workspace.getPageGraph().brokenLinks).toEqual([{ sourceId: source.id, state: 'deleted', targetId: 'missing-id' }]);
    db.close();
  });

  it('does not report links from pages that are themselves in Trash', () => {
    const db = workspace();
    const source = db.workspace.createNode({ contentJson: linkTo('missing-id', 'Gone'), kind: 'page', title: 'Notes' });
    db.workspace.archiveNode(source.id);
    expect(db.workspace.getPageGraph().brokenLinks).toEqual([]);
    db.close();
  });
});
