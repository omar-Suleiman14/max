// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { Locale } from '../app/i18n';
import { CalendarView } from './CalendarView';

const DUE = '11111111-1111-4111-8111-111111111111';

const schema = {
  database: { archivedAt: null, createdAt: '', icon: null, id: 'db', parentNodeId: null, positionKey: 'a0', title: 'Projects', updatedAt: '' },
  properties: [
    { config: {}, databaseId: 'db', id: 'title', isRequired: false, name: 'Name', options: [], positionKey: 'a0', type: 'title' },
    { config: {}, databaseId: 'db', id: DUE, isRequired: false, name: 'Due', options: [], positionKey: 'a1', type: 'date' },
  ],
} as unknown as DatabaseSchema;

function show(locale: Locale) {
  vi.setSystemTime(new Date('2026-09-16T10:00:00.000Z'));
  return render(
    <CalendarView
      databaseId="db"
      datePropertyId={DUE}
      locale={locale}
      onCreateRecord={vi.fn()}
      onOpenRecord={vi.fn()}
      records={[]}
      schema={schema}
    />,
  );
}

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('CalendarView', () => {
  it('names the month, the weekdays and its controls in English', () => {
    show('en');

    expect(screen.getByRole('heading')).toHaveTextContent('September 2026');
    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Date by' })).toBeInTheDocument();
  });

  it('names them in Arabic in an Arabic workspace', () => {
    show('ar');

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
    const { container } = show('ar');

    expect(container.querySelector('.calendar-cell--today')).not.toBeNull();
  });
});
