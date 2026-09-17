// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceRecord } from '../../shared/property-contract';
import { ListView } from './ListView';

const schema = {
  database: { id: 'db', title: 'Tasks' },
  properties: [
    { databaseId: 'db', id: 'title', name: 'Name', positionKey: 'a0', type: 'title' },
    { databaseId: 'db', id: 'priority', name: 'Priority', positionKey: 'a1', type: 'text' },
  ],
} as unknown as DatabaseSchema;

afterEach(cleanup);

describe('ListView', () => {
  it('shows its useful empty state and opens a newly created record', async () => {
    const created = { databaseId: 'db', id: 'new', properties: {}, sequence: 1, title: 'First task' } as unknown as WorkspaceRecord;
    const onCreateRecord = vi.fn().mockResolvedValue(created);
    const onOpenRecord = vi.fn();
    render(<ListView databaseId="db" onArchiveRecord={vi.fn()} onCreateRecord={onCreateRecord} onOpenRecord={onOpenRecord} records={[]} schema={schema} />);

    expect(screen.getByText('No records yet. Create the first record below.')).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('+ New record (press Enter)...'), 'First task{enter}');

    expect(onCreateRecord).toHaveBeenCalledWith({ databaseId: 'db', properties: {}, title: 'First task' });
    expect(onOpenRecord).toHaveBeenCalledWith(created);
  });

  it('only renders properties present in the supplied visible schema', () => {
    const record = { databaseId: 'db', id: 'one', properties: { priority: 'High', secret: 'Hidden' }, sequence: 1, title: 'Task' } as unknown as WorkspaceRecord;
    render(<ListView databaseId="db" onArchiveRecord={vi.fn()} onCreateRecord={vi.fn()} onOpenRecord={vi.fn()} records={[record]} schema={schema} />);

    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });
});
