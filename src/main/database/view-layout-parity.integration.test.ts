import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ViewLayout } from '../../shared/view-contract';
import { DatabaseService } from './database-service';

const temporaryDirectories: string[] = [];

function fileWorkspace() {
  const directory = mkdtempSync(join(tmpdir(), 'max-view-parity-'));
  temporaryDirectories.push(directory);
  const filename = join(directory, 'max.sqlite');
  const database = new DatabaseService(filename);
  database.initialize();
  return { database, filename };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

describe('saved database view parity', () => {
  it('round trips settings for every shipped layout across a close and reopen', () => {
    const { database, filename } = fileWorkspace();
    const tasks = database.databases.createDatabase({ title: 'Tasks' });
    const status = database.properties.createProperty({ databaseId: tasks.id, name: 'Status', options: [{ label: 'Todo' }], type: 'status' });
    const priority = database.properties.createProperty({ databaseId: tasks.id, name: 'Priority', type: 'number' });
    const due = database.properties.createProperty({ databaseId: tasks.id, name: 'Due', type: 'date' });
    const image = database.properties.createProperty({ databaseId: tasks.id, name: 'Image', type: 'file' });
    const template = database.recordTemplates.create({ databaseId: tasks.id, defaults: { [priority.id]: 1 }, name: 'Default task' });
    const todo = status.options![0]!.id;
    const layouts: readonly ViewLayout[] = ['table', 'list', 'board', 'calendar', 'gallery'];

    for (const layout of layouts) {
      database.views.createView({
        databaseId: tasks.id,
        filterAst: { kind: 'property', operator: 'equals', propertyId: status.id, value: todo },
        group: { propertyId: status.id },
        layout,
        layoutConfig: { defaultTemplateId: template.id, density: 'compact' },
        name: layout,
        propertyState: {
          columns: [{ propertyId: priority.id }, { hidden: true, propertyId: image.id }],
          coverPropertyId: layout === 'gallery' ? image.id : null,
          datePropertyId: layout === 'calendar' ? due.id : null,
          groupPropertyId: layout === 'board' ? status.id : null,
        },
        sorts: [{ direction: 'desc', propertyId: priority.id }],
      });
    }
    database.close();

    const reopened = new DatabaseService(filename);
    reopened.initialize();
    try {
      const saved = reopened.views.listViews(tasks.id).filter((view) => layouts.includes(view.name as ViewLayout));
      expect(saved).toHaveLength(layouts.length);
      for (const layout of layouts) {
        const view = saved.find((candidate) => candidate.name === layout)!;
        expect(view.layout).toBe(layout);
        expect(view.layoutConfig).toEqual({ defaultTemplateId: template.id, density: 'compact' });
        expect(view.filterAst).toEqual({ kind: 'property', operator: 'equals', propertyId: status.id, value: todo });
        expect(view.group).toEqual({ propertyId: status.id });
        expect(view.sorts).toEqual([{ direction: 'desc', propertyId: priority.id }]);
        expect(view.propertyState.columns).toEqual([{ propertyId: priority.id }, { hidden: true, propertyId: image.id }]);
        expect(view.propertyState.coverPropertyId).toBe(layout === 'gallery' ? image.id : null);
        expect(view.propertyState.datePropertyId).toBe(layout === 'calendar' ? due.id : null);
        expect(view.propertyState.groupPropertyId).toBe(layout === 'board' ? status.id : null);
      }
    } finally {
      reopened.close();
    }
  });

  it('still loads an older saved view that only stored a columns array', () => {
    const { database, filename } = fileWorkspace();
    const notes = database.databases.createDatabase({ title: 'Notes' });
    database.views.createView({ databaseId: notes.id, layout: 'list', name: 'Old list', propertyState: { columns: [] } });
    database.close();

    const reopened = new DatabaseService(filename);
    reopened.initialize();
    try {
      const view = reopened.views.listViews(notes.id).find((candidate) => candidate.name === 'Old list');
      expect(view?.layout).toBe('list');
      expect(view?.propertyState).toEqual({ columns: [] });
      expect(view?.layoutConfig).toEqual({});
    } finally {
      reopened.close();
    }
  });

  it('round trips Timeline date-range configuration across a close and reopen', () => {
    const { database, filename } = fileWorkspace();
    const tasks = database.databases.createDatabase({ title: 'Tasks' });
    const start = database.properties.createProperty({ databaseId: tasks.id, name: 'Start', type: 'date' });
    const due = database.properties.createProperty({ databaseId: tasks.id, name: 'Due', type: 'date' });
    database.views.createView({
      databaseId: tasks.id,
      layout: 'timeline',
      layoutConfig: {
        density: 'compact',
        timeline: { endPropertyId: due.id, startPropertyId: start.id },
      },
      name: 'Schedule',
    });
    database.close();

    const reopened = new DatabaseService(filename);
    reopened.initialize();
    try {
      const view = reopened.views.listViews(tasks.id).find((candidate) => candidate.name === 'Schedule');
      expect(view?.layout).toBe('timeline');
      expect(view?.layoutConfig).toEqual({
        density: 'compact',
        timeline: { endPropertyId: due.id, startPropertyId: start.id },
      });
    } finally {
      reopened.close();
    }
  });

  it('round trips Chart query and presentation configuration across a close and reopen', () => {
    const { database, filename } = fileWorkspace();
    const sales = database.databases.createDatabase({ title: 'Sales' });
    const amount = database.properties.createProperty({ databaseId: sales.id, name: 'Amount', type: 'number' });
    database.views.createView({
      databaseId: sales.id,
      layout: 'chart',
      layoutConfig: {
        calculations: [{ calculation: 'sum', propertyId: amount.id }],
        chart: { calculation: 'sum', propertyId: amount.id, type: 'line' },
        density: 'compact',
      },
      name: 'Revenue chart',
    });
    database.close();

    const reopened = new DatabaseService(filename);
    reopened.initialize();
    try {
      const view = reopened.views.listViews(sales.id).find((candidate) => candidate.name === 'Revenue chart');
      expect(view?.layout).toBe('chart');
      expect(view?.layoutConfig).toEqual({
        calculations: [{ calculation: 'sum', propertyId: amount.id }],
        chart: { calculation: 'sum', propertyId: amount.id, type: 'line' },
        density: 'compact',
      });
    } finally {
      reopened.close();
    }
  });
});
