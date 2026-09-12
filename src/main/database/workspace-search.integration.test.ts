import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';

function workspace(): DatabaseService {
  const db = new DatabaseService(':memory:');
  db.initialize();
  return db;
}

function page(db: DatabaseService, title: string, blocks: readonly unknown[]) {
  return db.workspace.createNode({ contentJson: JSON.stringify(blocks), kind: 'page', title });
}

const titles = (results: readonly { displayTitle: string }[]) => results.map((result) => result.displayTitle);

describe('searching the whole workspace', () => {
  it('finds a page by a word written inside it, not only by its title', () => {
    const db = workspace();
    const note = page(db, 'Monday handover', [
      { content: 'The blue charger cable went back to the supplier.', id: 'b1', type: 'text' },
      { cells: [['Invoice', 'SN-4471']], id: 'b2', type: 'simple-table' },
    ]);

    expect(db.workspaceSearch.search('supplier', 10)[0]?.entityId).toBe(note.id);
    expect(db.workspaceSearch.search('SN-4471', 10)[0]?.entityId).toBe(note.id);
  });

  it('reads through nested column blocks and their captions', () => {
    const db = workspace();
    const note = page(db, 'Shelf layout', [{
      col1Blocks: [{ content: 'Left shelf holds the returned handsets.', id: 'c1', type: 'text' }],
      col2Blocks: [{ caption: 'Warranty paperwork', id: 'c2', type: 'image', url: 'max://photo.png' }],
      content: '',
      id: 'b1',
      type: 'columns',
    }]);

    expect(db.workspaceSearch.search('handsets', 10)[0]?.entityId).toBe(note.id);
    expect(db.workspaceSearch.search('warranty', 10)[0]?.entityId).toBe(note.id);
  });

  it('matches an Arabic word however it was spelled', () => {
    const db = workspace();
    // Written with a hamza and a ta marbuta; searched without either.
    const note = page(db, 'فاتورة المشتريات', [{ content: 'تم تسليم الأجهزة إلى المخزن.', id: 'b1', type: 'text' }]);

    expect(db.workspaceSearch.search('فاتوره', 10)[0]?.entityId).toBe(note.id);
    expect(db.workspaceSearch.search('الاجهزة', 10)[0]?.entityId).toBe(note.id);
    expect(db.workspaceSearch.search('المخزن', 10)[0]?.entityId).toBe(note.id);
  });

  it('finds an Arabic word that is written with its article attached', () => {
    const db = workspace();
    const accounts = page(db, 'الحسابات', [{ content: 'كشف بالعملاء المتأخرين.', id: 'b1', type: 'text' }]);

    // Nobody types the article to search for the word.
    expect(db.workspaceSearch.search('حساب', 10)[0]?.entityId).toBe(accounts.id);
    expect(db.workspaceSearch.search('عملاء', 10)[0]?.entityId).toBe(accounts.id);
    // The full spelling still works, so neither way of typing it comes up empty.
    expect(db.workspaceSearch.search('الحسابات', 10)[0]?.entityId).toBe(accounts.id);
  });

  it('narrows as letters are typed, and puts a title match first', () => {
    const db = workspace();
    page(db, 'Repairs', [{ content: 'Screen replacement notes for the counter staff.', id: 'b1', type: 'text' }]);
    const screens = page(db, 'Screen stock', [{ content: 'Nothing else here.', id: 'b2', type: 'text' }]);

    expect(titles(db.workspaceSearch.search('scr', 10))).toContain('Screen stock');
    expect(db.workspaceSearch.search('screen', 10)[0]?.entityId).toBe(screens.id);
  });

  it('finds a record by any of its property values', () => {
    const db = workspace();
    const created = db.databases.createDatabase({ title: 'Inventory' });
    const serial = db.properties.createProperty({ databaseId: created.id, name: 'Serial', type: 'text' });
    const record = db.records.createRecord({
      databaseId: created.id,
      properties: { [serial.id]: 'IMEI-908321' },
      title: 'Handset',
    });

    expect(db.workspaceSearch.search('IMEI-908321', 10)[0]?.entityId).toBe(record.id);
    expect(db.workspaceSearch.search('Inventory', 10).map((result) => result.entityId)).toContain(record.id);
  });

  it('forgets an entity once it is gone', () => {
    const db = workspace();
    const note = page(db, 'Temporary note', [{ content: 'Delete me', id: 'b1', type: 'text' }]);

    db.workspaceSearch.removeIndex(note.id);
    expect(db.workspaceSearch.search('Temporary', 10)).toEqual([]);
  });

  it('answers from a large workspace fast enough to type against', () => {
    const db = workspace();
    const created = db.databases.createDatabase({ title: 'Inventory' });
    const serial = db.properties.createProperty({ databaseId: created.id, name: 'Serial', type: 'text' });
    db.unitOfWork.run(() => {
      for (let index = 0; index < 1_500; index += 1) {
        db.records.createRecord({
          databaseId: created.id,
          properties: { [serial.id]: `SN-${String(index).padStart(5, '0')}` },
          title: `Handset ${index}`,
        });
      }
    });

    // Fastest of a few runs: a real regression slows every run, while a
    // descheduled sample only inflates the slowest one.
    let durationMs = Number.POSITIVE_INFINITY;
    let results: readonly { entityId: string }[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const started = performance.now();
      results = db.workspaceSearch.search('SN-01234', 20);
      durationMs = Math.min(durationMs, performance.now() - started);
    }

    expect(results).toHaveLength(1);
    // Well inside a keystroke, so the popup can query on every letter.
    expect(durationMs).toBeLessThan(25);
  });

  it('rebuilds itself when the index is empty but the workspace is not', () => {
    const db = workspace();
    const note = page(db, 'Stocktake', [{ content: 'Counted every tray on the back wall.', id: 'b1', type: 'text' }]);
    const created = db.databases.createDatabase({ title: 'Inventory' });
    const record = db.records.createRecord({ databaseId: created.id, properties: {}, title: 'Tray liner' });

    // A migration that changes the index shape empties it; the next start fills
    // it back in from the workspace itself.
    db.workspaceSearch.removeIndex(note.id);
    db.workspaceSearch.removeIndex(record.id);
    db.workspaceSearch.removeIndex(created.id);
    expect(db.workspaceSearch.isEmpty()).toBe(true);

    db.rebuildSearchIndex();

    expect(db.workspaceSearch.search('tray', 10).map((result) => result.entityId)).toEqual(
      expect.arrayContaining([note.id, record.id]),
    );
  });
});
