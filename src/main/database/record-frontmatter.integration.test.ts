import { afterEach, describe, expect, it } from 'vitest';

import {
  planRecordFrontmatterEntries,
  propertyDraftFromFrontmatter,
  resolveRecordFrontmatterValue,
} from '../../shared/record-frontmatter';
import type { RecordFrontmatterOperation } from '../../shared/record-frontmatter';
import { DatabaseService } from './database-service';

const opened: DatabaseService[] = [];

function workspace(): DatabaseService {
  const db = new DatabaseService(':memory:');
  db.initialize();
  opened.push(db);
  return db;
}

afterEach(() => opened.splice(0).forEach((db) => db.close()));

function applyOperation(db: DatabaseService, recordId: string, operation: RecordFrontmatterOperation) {
  if (operation.target === 'title') {
    return db.records.updateRecord(recordId, { title: operation.value.trim() || 'Untitled' });
  }
  return db.records.updateRecord(recordId, { properties: { [operation.property.id]: operation.value } });
}

describe('record YAML frontmatter integration', () => {
  it('maps known names to their actual schema properties and stores the schema type', () => {
    const db = workspace();
    const database = db.databases.createDatabase({ title: 'Tasks' });
    const count = db.properties.createProperty({ databaseId: database.id, name: 'Count', type: 'number' });
    const record = db.records.createRecord({ databaseId: database.id, title: 'One' });

    const plan = planRecordFrontmatterEntries(db.properties.listProperties(database.id), [['Count', 42]]);
    expect(plan.issues).toEqual([]);
    expect(plan.operations[0]?.property.id).toBe(count.id);
    applyOperation(db, record.id, plan.operations[0]!);
    expect(db.records.getRecord(record.id)?.properties[count.id]).toBe(42);
  });

  it('rejects a schema type mismatch while still applying valid sibling keys', () => {
    const db = workspace();
    const database = db.databases.createDatabase({ title: 'Tasks' });
    const count = db.properties.createProperty({ databaseId: database.id, name: 'Count', type: 'number' });
    const done = db.properties.createProperty({ databaseId: database.id, name: 'Done', type: 'checkbox' });
    const record = db.records.createRecord({ databaseId: database.id, title: 'One', properties: { [count.id]: 1, [done.id]: false } });

    const plan = planRecordFrontmatterEntries(db.properties.listProperties(database.id), [['Count', 'wrong'], ['Done', true]]);
    expect(plan.issues).toEqual([expect.objectContaining({ key: 'Count', kind: 'invalid' })]);
    expect(plan.operations).toHaveLength(1);
    applyOperation(db, record.id, plan.operations[0]!);

    const saved = db.records.getRecord(record.id)!;
    expect(saved.properties[count.id]).toBe(1);
    expect(saved.properties[done.id]).toBe(true);
  });

  it('keeps an unknown name schema-neutral until explicit typed creation is accepted', () => {
    const db = workspace();
    const database = db.databases.createDatabase({ title: 'Tasks' });
    const record = db.records.createRecord({ databaseId: database.id, title: 'One' });
    const before = db.properties.listProperties(database.id);

    const plan = planRecordFrontmatterEntries(before, [['Priority', 'High']]);
    expect(plan.issues).toEqual([expect.objectContaining({
      key: 'Priority',
      kind: 'unknown',
      message: 'Create "Priority" as a property',
    })]);
    expect(db.properties.listProperties(database.id)).toHaveLength(before.length);

    const prepared = propertyDraftFromFrontmatter(database.id, 'Priority', 'select', 'High');
    expect(prepared.error).toBeNull();
    const created = db.properties.createProperty(prepared.draft!);
    const resolved = resolveRecordFrontmatterValue(created, 'High');
    expect(resolved.error).toBeNull();
    db.records.updateRecord(record.id, { properties: { [created.id]: resolved.value } });

    expect(db.properties.listProperties(database.id).some((candidate) => candidate.id === created.id)).toBe(true);
    expect(db.records.getRecord(record.id)?.properties[created.id]).toBe(created.options?.[0]?.id);
  });

  it.each(['formula', 'rollup', 'relation', 'auto_id', 'created_time', 'created_by', 'last_edited_time', 'last_edited_by'] as const)(
    'does not expose a raw YAML write for %s properties',
    (type) => {
      const db = workspace();
      const database = db.databases.createDatabase({ title: 'Tasks' });
      const managed = db.properties.createProperty({ databaseId: database.id, name: 'Managed', type });
      const plan = planRecordFrontmatterEntries([managed], [['Managed', 'raw']]);
      expect(plan.operations).toEqual([]);
      expect(plan.issues).toEqual([expect.objectContaining({ kind: 'forbidden' })]);
    },
  );

  it('matches normal record editing for required fields and unique values', () => {
    const db = workspace();
    const database = db.databases.createDatabase({ title: 'Inventory' });
    const required = db.properties.createProperty({ databaseId: database.id, name: 'Required note', required: true, type: 'text' });
    const serial = db.properties.createProperty({ databaseId: database.id, name: 'Serial', type: 'text', uniqueValue: true });
    const first = db.records.createRecord({ databaseId: database.id, title: 'One', properties: { [serial.id]: 'A' } });
    const second = db.records.createRecord({ databaseId: database.id, title: 'Two', properties: { [required.id]: 'filled', [serial.id]: 'B' } });

    // Required values are deliberately mark-don't-gate in the record drawer.
    expect(db.records.updateRecord(second.id, { properties: { [required.id]: '' } }).properties[required.id]).toBeFalsy();
    db.records.updateRecord(second.id, { properties: { [required.id]: 'filled' } });
    const requiredPlan = planRecordFrontmatterEntries([required], [['Required note', null]]);
    applyOperation(db, second.id, requiredPlan.operations[0]!);
    expect(db.records.getRecord(second.id)?.properties[required.id]).toBeFalsy();

    expect(() => db.records.updateRecord(second.id, { properties: { [serial.id]: 'A' } })).toThrow('Serial must be unique');
    const uniquePlan = planRecordFrontmatterEntries([serial], [['Serial', 'A']]);
    expect(() => applyOperation(db, second.id, uniquePlan.operations[0]!)).toThrow('Serial must be unique');
    expect(db.records.getRecord(first.id)?.properties[serial.id]).toBe('A');
    expect(db.records.getRecord(second.id)?.properties[serial.id]).toBe('B');
  });
});
