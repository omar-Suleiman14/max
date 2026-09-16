import { describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';

/**
 * The reverification pass for issue #28.
 *
 * `docs/product/database-workspace-rebuild.md` said the final additions had not
 * been verified. This checks the claims that are checkable from the main
 * process: pagination, archive and restore, reciprocal relations, rollups and
 * formulas recomputing, grouping, templates and linked databases. The five view
 * components are checked separately, in the renderer, where they live.
 *
 * Each test is written to fail loudly rather than pass quietly, because the
 * point of the pass is to find out what is actually true.
 */

function workspace(): DatabaseService {
  const database = new DatabaseService(':memory:');
  database.initialize();
  return database;
}

describe('pagination', () => {
  it('reports the total a filter matches, not the size of the page returned', () => {
    const database = workspace();
    const tasks = database.databases.createDatabase({ title: 'Tasks' });
    const done = database.properties.createProperty({ databaseId: tasks.id, name: 'Done', type: 'checkbox' });
    for (let index = 0; index < 25; index += 1) {
      database.records.createRecord({
        databaseId: tasks.id,
        properties: { [done.id]: index % 5 === 0 },
        title: `Task ${index}`,
      });
    }

    const page = database.databaseQuery.query({
      databaseId: tasks.id,
      filter: { kind: 'property', operator: 'is_not_checked', propertyId: done.id, value: null },
      limit: 4,
    });

    // Twenty of the twenty-five are unchecked. A count that reported four would
    // make every "1-4 of 4" in the interface a lie.
    expect(page.totalCount).toBe(20);
    expect(page.records).toHaveLength(4);
    expect(page.hasMore).toBe(true);
    database.close();
  });

  it('walks the whole result through its cursor without repeating or losing a record', () => {
    const database = workspace();
    const notes = database.databases.createDatabase({ title: 'Notes' });
    for (let index = 0; index < 11; index += 1) {
      database.records.createRecord({ databaseId: notes.id, properties: {}, title: `Note ${String(index).padStart(2, '0')}` });
    }

    const seen: string[] = [];
    let cursor: string | null | undefined;
    let guard = 0;
    do {
      const page = database.databaseQuery.query({ cursor, databaseId: notes.id, limit: 4 });
      seen.push(...page.records.map(({ id }) => id));
      cursor = page.hasMore ? page.nextCursor : null;
      guard += 1;
    } while (cursor && guard < 10);

    expect(seen).toHaveLength(11);
    expect(new Set(seen).size).toBe(11);
    database.close();
  });
});

describe('archive and restore', () => {
  it('puts a record back with every property value it had', () => {
    const database = workspace();
    const people = database.databases.createDatabase({ title: 'People' });
    const role = database.properties.createProperty({ databaseId: people.id, name: 'Role', type: 'text' });
    const record = database.records.createRecord({ databaseId: people.id, properties: { [role.id]: 'Engineer' }, title: 'Sam' });

    database.records.archiveRecord(record.id);
    expect(database.databaseQuery.query({ databaseId: people.id }).totalCount).toBe(0);

    database.records.restoreRecord(record.id);

    const restored = database.databaseQuery.query({ databaseId: people.id }).records;
    expect(restored.map(({ title }) => title)).toEqual(['Sam']);
    // Archiving must hide a record, not empty it.
    expect(restored[0]?.properties[role.id]).toBe('Engineer');
    database.close();
  });

  it('puts a page back with its writing', () => {
    const database = workspace();
    const page = database.workspace.createNode({ contentJson: JSON.stringify([{ content: 'Kept', id: 'a', type: 'text' }]), kind: 'page', title: 'Field notes' });

    database.workspace.archiveNode(page.id);
    database.workspace.restoreNode(page.id);

    const restored = database.workspace.getNode(page.id);
    expect(restored?.title).toBe('Field notes');
    expect(restored?.contentJson).toContain('Kept');
    expect(restored?.archivedAt).toBeFalsy();
    database.close();
  });

  it('puts a database back with its properties and its records', () => {
    const database = workspace();
    const stock = database.databases.createDatabase({ title: 'Stock' });
    const count = database.properties.createProperty({ databaseId: stock.id, name: 'Count', type: 'number' });
    database.records.createRecord({ databaseId: stock.id, properties: { [count.id]: 7 }, title: 'Widget' });

    database.workspace.archiveNode(stock.id);
    database.workspace.restoreNode(stock.id);

    expect(database.properties.listProperties(stock.id).map(({ name }) => name)).toContain('Count');
    const records = database.databaseQuery.query({ databaseId: stock.id }).records;
    expect(records.map(({ title }) => title)).toEqual(['Widget']);
    expect(records[0]?.properties[count.id]).toBe(7);
    database.close();
  });
});

describe('relations that point both ways', () => {
  /** Projects and Tasks, joined by one relation with its inverse. */
  function related() {
    const database = workspace();
    const projects = database.databases.createDatabase({ title: 'Projects' });
    const tasks = database.databases.createDatabase({ title: 'Tasks' });
    const tasksOf = database.properties.createProperty({ databaseId: projects.id, name: 'Tasks', type: 'relation' });
    const relation = database.relations.createRelation({
      inversePropertyName: 'Project',
      sourceCardinality: 'one',
      sourceDatabaseId: projects.id,
      sourcePropertyId: tasksOf.id,
      targetCardinality: 'many',
      targetDatabaseId: tasks.id,
    });
    const project = database.records.createRecord({ databaseId: projects.id, properties: {}, title: 'Rewire the shop' });
    const task = database.records.createRecord({ databaseId: tasks.id, properties: {}, title: 'Order cable' });
    return { database, project, projects, relation, task, tasks, tasksOf };
  }

  it('shows the same link from either side', () => {
    const { database, project, relation, task, tasks } = related();

    database.relations.connect(relation.id, project.id, task.id);

    // A relation cell reads through getRelatedRecords, the same call the table
    // and the record page make, so this is what a person actually sees.
    expect(database.relations.getRelatedRecords(project.id, relation.id).map(({ id }) => id)).toEqual([task.id]);
    const inverse = database.properties.listProperties(tasks.id).find(({ name }) => name === 'Project');
    expect(inverse).toBeDefined();
    expect(database.relations.getRelatedRecords(task.id, relation.id).map(({ id }) => id)).toEqual([project.id]);
    database.close();
  });

  it('drops the link on both sides when it is removed from one', () => {
    const { database, project, relation, task } = related();
    database.relations.connect(relation.id, project.id, task.id);

    database.relations.disconnect(relation.id, project.id, task.id);

    expect(database.relations.getRelatedRecords(project.id, relation.id)).toEqual([]);
    expect(database.relations.getRelatedRecords(task.id, relation.id)).toEqual([]);
    database.close();
  });

  it('stops showing a link to a record that has been archived, and shows it again on restore', () => {
    const { database, project, relation, task } = related();
    database.relations.connect(relation.id, project.id, task.id);

    database.records.archiveRecord(task.id);

    // A relation that still listed an archived record would send somebody to a
    // page that is not there any more.
    expect(database.relations.getRelatedRecords(project.id, relation.id)).toEqual([]);

    database.records.restoreRecord(task.id);
    expect(database.relations.getRelatedRecords(project.id, relation.id).map(({ id }) => id)).toEqual([task.id]);
    database.close();
  });
});

describe('values that are worked out rather than typed', () => {
  it('recomputes a formula when the number it reads changes', () => {
    const database = workspace();
    const sales = database.databases.createDatabase({ title: 'Sales' });
    const amount = database.properties.createProperty({ databaseId: sales.id, name: 'Amount', type: 'number' });
    const withTax = database.properties.createProperty({
      config: { formula: `[${amount.id}] * 1.15` },
      databaseId: sales.id,
      name: 'With tax',
      type: 'formula',
    });
    const record = database.records.createRecord({ databaseId: sales.id, properties: { [amount.id]: 100 }, title: 'Sale' });
    const read = () => database.databaseQuery.query({ databaseId: sales.id }).records[0]?.properties[withTax.id] as number;

    expect(read()).toBeCloseTo(115);

    database.records.updateRecord(record.id, { properties: { [amount.id]: 200 } });

    expect(read()).toBeCloseTo(230);
    database.close();
  });

  it('recomputes a rollup when a related record changes, is added, and is archived', () => {
    const database = workspace();
    const orders = database.databases.createDatabase({ title: 'Orders' });
    const lines = database.databases.createDatabase({ title: 'Lines' });
    const linesOf = database.properties.createProperty({ databaseId: orders.id, name: 'Lines', type: 'relation' });
    const relation = database.relations.createRelation({
      inversePropertyName: 'Order',
      sourceCardinality: 'one',
      sourceDatabaseId: orders.id,
      sourcePropertyId: linesOf.id,
      targetCardinality: 'many',
      targetDatabaseId: lines.id,
    });
    const price = database.properties.createProperty({ databaseId: lines.id, name: 'Price', type: 'number' });
    const total = database.properties.createProperty({
      config: { rollup: { aggregation: 'sum', relationPropertyId: linesOf.id, targetPropertyId: price.id } },
      databaseId: orders.id,
      name: 'Total',
      type: 'rollup',
    });

    const order = database.records.createRecord({ databaseId: orders.id, properties: {}, title: 'Order 1' });
    const first = database.records.createRecord({ databaseId: lines.id, properties: { [price.id]: 10 }, title: 'Line 1' });
    const second = database.records.createRecord({ databaseId: lines.id, properties: { [price.id]: 15 }, title: 'Line 2' });
    database.relations.connect(relation.id, order.id, first.id);
    const readTotal = () => database.databaseQuery.query({ databaseId: orders.id }).records[0]?.properties[total.id];

    expect(readTotal()).toBe(10);

    database.relations.connect(relation.id, order.id, second.id);
    expect(readTotal()).toBe(25);

    database.records.updateRecord(first.id, { properties: { [price.id]: 30 } });
    expect(readTotal()).toBe(45);

    database.records.archiveRecord(second.id);
    // An archived line is not part of the order any more, so the total must say so.
    expect(readTotal()).toBe(30);
    database.close();
  });
});

describe('grouping, templates and linked databases', () => {
  it('groups by a select property and counts each group', () => {
    const database = workspace();
    const tasks = database.databases.createDatabase({ title: 'Tasks' });
    const status = database.properties.createProperty({
      databaseId: tasks.id,
      name: 'Status',
      options: [{ label: 'Todo' }, { label: 'Done' }],
      type: 'select',
    });
    const [todo, done] = status.options!;
    for (const [title, option] of [['A', todo], ['B', todo], ['C', done]] as const) {
      database.records.createRecord({ databaseId: tasks.id, properties: { [status.id]: option!.id }, title });
    }

    const grouped = database.databaseQuery.query({
      databaseId: tasks.id,
      group: { propertyId: status.id },
    });

    const counts = Object.fromEntries((grouped.groups ?? []).map((group) => [group.label, group.totalCount]));
    expect(counts.Todo).toBe(2);
    expect(counts.Done).toBe(1);
    database.close();
  });

  it('creates a record from a template with the template values already filled in', () => {
    const database = workspace();
    const tasks = database.databases.createDatabase({ title: 'Tasks' });
    const owner = database.properties.createProperty({ databaseId: tasks.id, name: 'Owner', type: 'text' });
    const template = database.recordTemplates.create({
      databaseId: tasks.id,
      defaults: { [owner.id]: 'Sam' },
      name: 'Weekly review',
    });

    const created = database.records.createRecord({ databaseId: tasks.id, properties: {}, templateId: template.id, title: 'Weekly review' });

    expect(created.templateId).toBe(template.id);
    expect(database.databaseQuery.query({ databaseId: tasks.id }).records[0]?.properties[owner.id]).toBe('Sam');
    database.close();
  });

  it('keeps a linked view of another database reading from the one set of records', () => {
    const database = workspace();
    const source = database.databases.createDatabase({ title: 'Inventory' });
    const count = database.properties.createProperty({ databaseId: source.id, name: 'Count', type: 'number' });
    database.records.createRecord({ databaseId: source.id, properties: { [count.id]: 3 }, title: 'Widget' });

    // A linked database is a second view onto the same records rather than a
    // copy of them, so a change has to show through it.
    const linked = database.views.createView({ databaseId: source.id, name: 'Low stock', ownerId: 'a-block-on-a-page', ownerType: 'block' });
    expect(linked.databaseId).toBe(source.id);

    database.records.createRecord({ databaseId: source.id, properties: { [count.id]: 1 }, title: 'Bolt' });

    expect(database.databaseQuery.query({ databaseId: linked.databaseId }).records.map(({ title }) => title).sort())
      .toEqual(['Bolt', 'Widget']);
    database.close();
  });
});
