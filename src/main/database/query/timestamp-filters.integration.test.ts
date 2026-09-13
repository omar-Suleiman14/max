import { afterEach, describe, expect, it } from 'vitest';

import { DatabaseService } from '../database-service';
import { resolveRelativeDate } from './date-resolver';
import { SortCompiler } from './sort-compiler';

const opened: DatabaseService[] = [];
const workspace = () => {
  const db = new DatabaseService(':memory:');
  db.initialize();
  opened.push(db);
  return db;
};
afterEach(() => opened.splice(0).forEach((db) => db.close()));

describe('filtering on the timestamps a record keeps for itself', () => {
  function sales() {
    const db = workspace();
    const database = db.databases.createDatabase({ title: 'Sales' });
    const created = db.properties.createProperty({ databaseId: database.id, name: 'Created', type: 'created_time' });
    const edited = db.properties.createProperty({ databaseId: database.id, name: 'Edited', type: 'last_edited_time' });
    const record = db.records.createRecord({ databaseId: database.id, properties: {}, title: 'A sale' });
    return { created, database, db, edited, record };
  }

  it.each(['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'THIS_YEAR'] as const)('finds a record made just now with %s', (relativePeriod) => {
    const { created, database, db } = sales();

    // The record's own creation time is on the record row, not in the property
    // value table every other filter reads, so all four of these found nothing.
    const result = db.databaseQuery.query({
      databaseId: database.id,
      filter: { kind: 'property', operator: 'relative_date', propertyId: created.id, relativePeriod },
    });

    expect(result.records.map(({ title }) => title)).toEqual(['A sale']);
  });

  it('excludes a record from a period it does not belong to', () => {
    const { created, database, db } = sales();

    const result = db.databaseQuery.query({
      databaseId: database.id,
      filter: { kind: 'property', operator: 'relative_date', propertyId: created.id, relativePeriod: 'YESTERDAY' },
    });

    expect(result.records).toEqual([]);
  });

  it('answers is_not_empty for a timestamp that always exists, and before/after around today', () => {
    const { created, database, db } = sales();
    const query = (filter: Parameters<typeof db.databaseQuery.query>[0]['filter']) => db.databaseQuery.query({ databaseId: database.id, filter }).records.length;
    const today = resolveRelativeDate('TODAY').startDate;

    expect(query({ kind: 'property', operator: 'is_not_empty', propertyId: created.id })).toBe(1);
    expect(query({ kind: 'property', operator: 'is_empty', propertyId: created.id })).toBe(0);
    // "Before today" excludes today itself; "after today" starts tomorrow.
    expect(query({ kind: 'property', operator: 'before_date', propertyId: created.id, value: today })).toBe(0);
    expect(query({ kind: 'property', operator: 'after_date', propertyId: created.id, value: today })).toBe(0);
    expect(query({ kind: 'property', operator: 'between_dates', propertyId: created.id, value: today, valueTo: today })).toBe(1);
  });

  it('sorts by auto id, and reads the record row for the timestamps', () => {
    const db = workspace();
    const database = db.databases.createDatabase({ title: 'Sales' });
    const created = db.properties.createProperty({ databaseId: database.id, name: 'Created', type: 'created_time' });
    const edited = db.properties.createProperty({ databaseId: database.id, name: 'Edited', type: 'last_edited_time' });
    const autoId = db.properties.createProperty({ databaseId: database.id, name: 'No.', type: 'auto_id' });
    db.records.createRecord({ databaseId: database.id, properties: {}, title: 'First' });
    db.records.createRecord({ databaseId: database.id, properties: {}, title: 'Second' });

    const bySequence = db.databaseQuery.query({ databaseId: database.id, sorts: [{ direction: 'desc', propertyId: autoId.id }] });
    expect(bySequence.records.map(({ title }) => title)).toEqual(['Second', 'First']);

    // Two records made in the same millisecond share a creation time, so the
    // ordering is asserted on the clause rather than on a coin toss: what was
    // wrong was reading an always-empty property value instead of the column.
    const schema = db.databases.getSchema(database.id);
    const clause = new SortCompiler(schema.properties).compile([{ direction: 'desc', propertyId: created.id }, { direction: 'asc', propertyId: edited.id }]);
    expect(clause).toBe('r.created_at DESC, r.updated_at ASC, r.position_key ASC');
  });

  it('keeps a dated record inside its period even when the date carries a time', () => {
    const db = workspace();
    const database = db.databases.createDatabase({ title: 'Sales' });
    const when = db.properties.createProperty({ databaseId: database.id, name: 'When', type: 'date' });
    const { endDate } = resolveRelativeDate('THIS_MONTH');
    db.records.createRecord({ databaseId: database.id, properties: { [when.id]: { hasTime: true, start: `${endDate}T18:30:00.000Z` } }, title: 'Evening of the last day' });

    const result = db.databaseQuery.query({
      databaseId: database.id,
      filter: { kind: 'property', operator: 'relative_date', propertyId: when.id, relativePeriod: 'THIS_MONTH' },
    });

    expect(result.records.map(({ title }) => title)).toEqual(['Evening of the last day']);
  });
});

describe('resolving a relative period', () => {
  it('uses the calendar the machine is on, not UTC', () => {
    // 00:30 on the 13th locally can be the 12th in UTC. Today has to mean the
    // day the person is living in, or a night shift files under yesterday.
    const justAfterMidnight = new Date(2026, 8, 13, 0, 30);
    const today = resolveRelativeDate('TODAY', 0, justAfterMidnight);

    expect(today.startDate).toBe('2026-09-13');
    expect(today.endDate).toBe('2026-09-13');
    expect(new Date(today.startInstant).getDate()).toBe(13);
    // The top of the range is the next midnight, so it is exclusive.
    expect(new Date(today.endInstant).getTime() - new Date(today.startInstant).getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('covers the whole week, month and year around its base date', () => {
    const base = new Date(2026, 8, 13, 12);

    expect(resolveRelativeDate('THIS_WEEK', 0, base)).toMatchObject({ endDate: '2026-09-19', startDate: '2026-09-13' });
    expect(resolveRelativeDate('THIS_MONTH', 0, base)).toMatchObject({ endDate: '2026-09-30', startDate: '2026-09-01' });
    expect(resolveRelativeDate('THIS_YEAR', 0, base)).toMatchObject({ endDate: '2026-12-31', startDate: '2026-01-01' });
  });
});
