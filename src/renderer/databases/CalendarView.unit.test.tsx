// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { Locale } from '../app/i18n';
import type { WorkspaceRecord } from '../../shared/property-contract';
import { CalendarView } from './CalendarView';

const DUE = '11111111-1111-4111-8111-111111111111';

const schema = {
  database: { archivedAt: null, createdAt: '', icon: null, id: 'db', parentNodeId: null, positionKey: 'a0', title: 'Projects', updatedAt: '' },
  properties: [
    { config: {}, databaseId: 'db', id: 'title', isRequired: false, name: 'Name', options: [], positionKey: 'a0', type: 'title' },
    { config: {}, databaseId: 'db', id: DUE, isRequired: false, name: 'Due', options: [], positionKey: 'a1', type: 'date' },
  ],
} as unknown as DatabaseSchema;

/** A record due on the given day, in the shape the repository returns. */
function record(title: string, value: unknown): WorkspaceRecord {
  return {
    archivedAt: null,
    createdAt: '2026-09-01T09:00:00.000Z',
    databaseId: 'db',
    icon: null,
    id: title,
    positionKey: 'a0',
    properties: { [DUE]: value },
    sequence: 1,
    title,
    updatedAt: '2026-09-01T09:00:00.000Z',
  } as unknown as WorkspaceRecord;
}

function show(
  records: readonly WorkspaceRecord[] = [],
  locale: Locale = 'en',
  overrides: Partial<Parameters<typeof CalendarView>[0]> = {},
) {
  vi.setSystemTime(new Date('2026-09-16T10:00:00.000Z'));
  return render(
    <CalendarView
      databaseId="db"
      datePropertyId={DUE}
      locale={locale}
      onCreateRecord={vi.fn()}
      onOpenRecord={vi.fn()}
      records={records}
      schema={schema}
      {...overrides}
    />,
  );
}

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('CalendarView', () => {
  it('puts a record on the day its date property names', () => {
    // This is the shape the record repository returns for a date property. The
    // view used to test it with typeof value === 'string', so every record was
    // filtered out and the month stayed empty however the dates were filled in.
    show([record('Website redesign', { hasTime: false, start: '2026-09-16' })]);

    expect(screen.getByText('Website redesign')).toBeInTheDocument();
  });

  it('still places a record whose date was written as a plain day string', () => {
    show([record('Product launch', '2026-09-18')]);

    expect(screen.getByText('Product launch')).toBeInTheDocument();
  });

  it('leaves a record off the month when it has no date', () => {
    show([record('Customer research', null)]);

    expect(screen.queryByText('Customer research')).not.toBeInTheDocument();
  });

  it('names the month, the weekdays and its controls in English', () => {
    show();

    expect(screen.getByRole('heading')).toHaveTextContent('September 2026');
    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Date by' })).toBeInTheDocument();
  });

  it('names them in Arabic in an Arabic workspace', () => {
    show([], 'ar');

    // The month and weekday names come from the language rather than from a
    // hardcoded English list, while the year stays in Latin digits to match the
    // day numbers in the cells.
    const expected = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' }).format(new Date(2026, 8, 16));
    expect(screen.getByRole('heading')).toHaveTextContent(expected);
    expect(screen.getByRole('heading')).toHaveTextContent('2026');
    expect(screen.queryByText('September 2026')).not.toBeInTheDocument();
    expect(screen.queryByText('Sun')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'اليوم' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'الشهر السابق' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'التاريخ حسب' })).toBeInTheDocument();
  });

  it('labels the day the person is living in as today', () => {
    const { container } = show([], 'ar');

    expect(container.querySelector('.calendar-cell--today')).not.toBeNull();
  });

  it('offers creation in its empty state and opens the record it creates', async () => {
    const created = record('Untitled', '2026-09-16');
    const onCreateRecord = vi.fn().mockResolvedValue(created);
    const onOpenRecord = vi.fn();
    show([], 'en', { onCreateRecord, onOpenRecord });

    expect(screen.getByText('No records yet.')).toBeInTheDocument();
    await (await import('@testing-library/user-event')).default.click(screen.getByRole('button', { name: 'Create a record today' }));

    expect(onCreateRecord).toHaveBeenCalledWith(expect.objectContaining({
      databaseId: 'db',
      properties: { [DUE]: '2026-09-16' },
    }));
    expect(onOpenRecord).toHaveBeenCalledWith(created);
  });

  it('keeps a configured date property selected after render', () => {
    show([], 'en', { datePropertyId: DUE });

    expect(screen.getByRole('combobox', { name: 'Date by' })).toHaveTextContent('Due');
  });
});
