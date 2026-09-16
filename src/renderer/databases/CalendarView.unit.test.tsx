// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { DatabaseSchema } from '../../shared/database-contract';
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

function show(records: readonly WorkspaceRecord[]) {
  render(
    <CalendarView
      databaseId="db"
      datePropertyId={DUE}
      onCreateRecord={vi.fn()}
      onOpenRecord={vi.fn()}
      records={records}
      schema={schema}
    />,
  );
}

describe('CalendarView', () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('puts a record on the day its date property names', () => {
    vi.setSystemTime(new Date('2026-09-16T10:00:00.000Z'));
    // This is the shape the record repository returns for a date property. The
    // view used to test it with typeof value === 'string', so every record was
    // filtered out and the month stayed empty however the dates were filled in.
    show([record('Website redesign', { hasTime: false, start: '2026-09-16' })]);

    expect(screen.getByText('Website redesign')).toBeInTheDocument();
  });

  it('still places a record whose date was written as a plain day string', () => {
    vi.setSystemTime(new Date('2026-09-16T10:00:00.000Z'));
    show([record('Product launch', '2026-09-18')]);

    expect(screen.getByText('Product launch')).toBeInTheDocument();
  });

  it('leaves a record off the month when it has no date', () => {
    vi.setSystemTime(new Date('2026-09-16T10:00:00.000Z'));
    show([record('Customer research', null)]);

    expect(screen.queryByText('Customer research')).not.toBeInTheDocument();
  });
});
