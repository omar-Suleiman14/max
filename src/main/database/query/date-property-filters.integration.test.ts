import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database-service';
import type { FilterNode } from '../../../shared/query-contract';
import { resolveRelativeDate } from './date-resolver';

/**
 * Date properties, unlike Created time and Last edited time, keep their value
 * in `workspace_property_values.date_start`. That column holds either a plain
 * calendar day with no zone, written by every date input in the application, or
 * a full instant, written by a blueprint import, a workflow, the v0.2.0
 * migration or any caller of the record contract that passes a time.
 *
 * The two shapes must be compared differently. A plain day is already the day
 * the person meant. An instant is a moment in UTC whose first ten characters
 * are the UTC day, which is a different day from the local one for part of
 * every twenty-four hours.
 *
 * These tests are written from the point of view of somebody in a timezone
 * offset from UTC in each direction. `Etc/GMT-2` is UTC+2 and `Etc/GMT+5` is
 * UTC-5; both are fixed offsets with no daylight saving, so a test that passes
 * in March still passes in October.
 */

const opened: DatabaseService[] = [];
const workspace = () => {
  const db = new DatabaseService(':memory:');
  db.initialize();
  opened.push(db);
  return db;
};
afterEach(() => opened.splice(0).forEach((db) => db.close()));

const originalTimezone = process.env.TZ;
afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

/** Point the whole process at one zone, so JavaScript and the compiler agree. */
function useTimezone(timezone: string): void {
  process.env.TZ = timezone;
}

/** The instant `minutes` after local midnight on the day a period starts. */
function instantAfterLocalMidnight(period: 'TODAY' | 'YESTERDAY' | 'TOMORROW', minutes: number): string {
  const { startInstant } = resolveRelativeDate(period);
  return new Date(Date.parse(startInstant) + minutes * 60_000).toISOString();
}

/** The instant `minutes` before the local midnight that ends a period. */
function instantBeforeLocalMidnight(period: 'TODAY' | 'YESTERDAY' | 'TOMORROW', minutes: number): string {
  const { endInstant } = resolveRelativeDate(period);
  return new Date(Date.parse(endInstant) - minutes * 60_000).toISOString();
}

function dated() {
  const db = workspace();
  const database = db.databases.createDatabase({ title: 'Deliveries' });
  const due = db.properties.createProperty({ databaseId: database.id, name: 'Due', type: 'date' });
  const titles = (filter: FilterNode) =>
    db.databaseQuery.query({ databaseId: database.id, filter }).records.map(({ title }) => title);
  const add = (title: string, value: unknown) =>
    db.records.createRecord({ databaseId: database.id, properties: { [due.id]: value }, title });
  return { add, database, db, due, titles };
}

describe.each(['Etc/GMT-2', 'Etc/GMT+5'])('date property filters in %s', (timezone) => {
  beforeEach(() => useTimezone(timezone));

  it('finds a date-only value with Today, Yesterday, This week and This month', () => {
    const { add, due, titles } = dated();
    add('Today', resolveRelativeDate('TODAY').startDate);
    add('Yesterday', resolveRelativeDate('YESTERDAY').startDate);

    const relative = (relativePeriod: Parameters<typeof resolveRelativeDate>[0]): FilterNode =>
      ({ kind: 'property', operator: 'relative_date', propertyId: due.id, relativePeriod });

    expect(titles(relative('TODAY'))).toEqual(['Today']);
    expect(titles(relative('YESTERDAY'))).toEqual(['Yesterday']);
    // Both fall inside this month unless today is the first, in which case
    // yesterday belongs to last month. Assert on membership, not on a count.
    expect(titles(relative('THIS_MONTH'))).toContain('Today');
    expect(titles(relative('THIS_WEEK'))).toContain('Today');
  });

  it('puts a value just after local midnight in Today and not in Yesterday', () => {
    const { add, due, titles } = dated();
    // Half an hour into today, local time. In UTC+2 this stores as yesterday's
    // UTC day, which is exactly the case a stored-day comparison gets wrong.
    add('Just after midnight', { hasTime: true, start: instantAfterLocalMidnight('TODAY', 30) });

    expect(titles({ kind: 'property', operator: 'relative_date', propertyId: due.id, relativePeriod: 'TODAY' }))
      .toEqual(['Just after midnight']);
    expect(titles({ kind: 'property', operator: 'relative_date', propertyId: due.id, relativePeriod: 'YESTERDAY' }))
      .toEqual([]);
  });

  it('puts a value just before local midnight in Today and not in Tomorrow', () => {
    const { add, due, titles } = dated();
    // Half an hour before today ends. In UTC-5 this stores as tomorrow's UTC day.
    add('Just before midnight', { hasTime: true, start: instantBeforeLocalMidnight('TODAY', 30) });

    expect(titles({ kind: 'property', operator: 'relative_date', propertyId: due.id, relativePeriod: 'TODAY' }))
      .toEqual(['Just before midnight']);
    expect(titles({ kind: 'property', operator: 'relative_date', propertyId: due.id, relativePeriod: 'TOMORROW' }))
      .toEqual([]);
  });

  it('puts a record within an hour of midnight in exactly one of Today and Yesterday', () => {
    const { add, due, titles } = dated();
    add('An hour before midnight', { hasTime: true, start: instantAfterLocalMidnight('TODAY', -60) });
    add('An hour after midnight', { hasTime: true, start: instantAfterLocalMidnight('TODAY', 60) });

    const today = titles({ kind: 'property', operator: 'relative_date', propertyId: due.id, relativePeriod: 'TODAY' });
    const yesterday = titles({ kind: 'property', operator: 'relative_date', propertyId: due.id, relativePeriod: 'YESTERDAY' });

    expect(today).toEqual(['An hour after midnight']);
    expect(yesterday).toEqual(['An hour before midnight']);
  });

  it('answers Exact date for a date-only value and for a value carrying a time', () => {
    const { add, due, titles } = dated();
    const today = resolveRelativeDate('TODAY').startDate;
    add('Plain day', today);
    add('Timed', { hasTime: true, start: instantAfterLocalMidnight('TODAY', 30) });
    add('Yesterday', resolveRelativeDate('YESTERDAY').startDate);

    // "Exact date" is the second operator the filter builder offers on a date
    // property. It compared the always-empty text column, so it found nothing.
    expect(titles({ kind: 'property', operator: 'equals', propertyId: due.id, value: today }).sort())
      .toEqual(['Plain day', 'Timed']);
    expect(titles({ kind: 'property', operator: 'not_equals', propertyId: due.id, value: today }))
      .toEqual(['Yesterday']);
  });

  it('answers Before date and After date on the local day, not the stored day', () => {
    const { add, due, titles } = dated();
    const today = resolveRelativeDate('TODAY').startDate;
    add('Late yesterday', { hasTime: true, start: instantBeforeLocalMidnight('YESTERDAY', 30) });
    add('Early today', { hasTime: true, start: instantAfterLocalMidnight('TODAY', 30) });
    add('Early tomorrow', { hasTime: true, start: instantAfterLocalMidnight('TOMORROW', 30) });

    expect(titles({ kind: 'property', operator: 'before_date', propertyId: due.id, value: today }))
      .toEqual(['Late yesterday']);
    expect(titles({ kind: 'property', operator: 'after_date', propertyId: due.id, value: today }))
      .toEqual(['Early tomorrow']);
  });

  it('answers a custom range inclusively at both ends', () => {
    const { add, due, titles } = dated();
    const yesterday = resolveRelativeDate('YESTERDAY').startDate;
    const today = resolveRelativeDate('TODAY').startDate;
    add('Late the day before', { hasTime: true, start: instantBeforeLocalMidnight('YESTERDAY', 30) });
    add('Early today', { hasTime: true, start: instantAfterLocalMidnight('TODAY', 30) });
    add('Tomorrow', { hasTime: true, start: instantAfterLocalMidnight('TOMORROW', 30) });

    expect(titles({ kind: 'property', operator: 'between_dates', propertyId: due.id, value: yesterday, valueTo: today }).sort())
      .toEqual(['Early today', 'Late the day before']);
  });

  it('mixes plain days and timed values in one period without losing either', () => {
    const { add, due, titles } = dated();
    add('Plain day', resolveRelativeDate('TODAY').startDate);
    add('Timed', { hasTime: true, start: instantAfterLocalMidnight('TODAY', 30) });

    expect(titles({ kind: 'property', operator: 'relative_date', propertyId: due.id, relativePeriod: 'TODAY' }).sort())
      .toEqual(['Plain day', 'Timed']);
  });

  it('still answers is_empty and is_not_empty for a date property', () => {
    const { add, due, titles } = dated();
    add('Dated', resolveRelativeDate('TODAY').startDate);
    add('Undated', null);

    expect(titles({ kind: 'property', operator: 'is_not_empty', propertyId: due.id })).toEqual(['Dated']);
    expect(titles({ kind: 'property', operator: 'is_empty', propertyId: due.id })).toEqual(['Undated']);
  });
});

describe('a date filter does not depend on the display locale', () => {
  it('returns the same records in Arabic and in English', () => {
    useTimezone('Etc/GMT-2');
    const { add, database, db, due } = dated();
    add('Plain day', resolveRelativeDate('TODAY').startDate);
    add('Timed', { hasTime: true, start: instantAfterLocalMidnight('TODAY', 30) });

    const filter: FilterNode = { kind: 'property', operator: 'relative_date', propertyId: due.id, relativePeriod: 'TODAY' };
    const run = () => db.databaseQuery.query({ databaseId: database.id, filter }).records.map(({ id }) => id).sort();

    // The query layer never reads a locale. Asserting it twice around a locale
    // change is the cheapest proof that display language cannot change results.
    const inEnglish = run();
    db.shopMetadata.updateMetadata({ locale: 'ar' });
    const inArabic = run();

    expect(inArabic).toEqual(inEnglish);
    expect(inArabic).toHaveLength(2);
  });
});

describe('a saved view holding a relative period', () => {
  afterEach(() => vi.useRealTimers());

  it('resolves against the day it is reopened, not the day it was saved', () => {
    useTimezone('Etc/GMT-2');
    const { add, database, db, due } = dated();

    const dayOne = resolveRelativeDate('TODAY').startDate;
    add('Saved on day one', dayOne);

    const view = db.views.createView({
      databaseId: database.id,
      filterAst: { kind: 'property', operator: 'relative_date', propertyId: due.id, relativePeriod: 'TODAY' },
      name: 'Due today',
    });

    const runSavedView = () => {
      const reopened = db.views.getView(view.id);
      return db.databaseQuery
        .query({ databaseId: database.id, filter: reopened?.filterAst ?? null })
        .records.map(({ title }) => title);
    };

    expect(runSavedView()).toEqual(['Saved on day one']);

    // Move the machine's clock on by a day and add a record dated that day. A
    // view that had resolved TODAY into a literal date when it was saved would
    // still be answering with day one.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.parse(resolveRelativeDate('TOMORROW').startInstant) + 12 * 60 * 60 * 1_000));
    const dayTwo = resolveRelativeDate('TODAY').startDate;
    expect(dayTwo).not.toBe(dayOne);
    add('Added on day two', dayTwo);

    expect(runSavedView()).toEqual(['Added on day two']);

    // The stored filter is still the relative period, never a resolved date.
    expect(db.views.getView(view.id)?.filterAst).toMatchObject({ operator: 'relative_date', relativePeriod: 'TODAY' });
    expect(JSON.stringify(db.views.getView(view.id)?.filterAst)).not.toContain(dayOne);
  });
});
