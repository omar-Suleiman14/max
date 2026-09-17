// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceRecord } from '../../shared/property-contract';
import { BoardView } from './BoardView';

const STATUS = 'status';
const OWNER = 'owner';
const PRIORITY = 'priority';

const schema = {
  database: { id: 'db', title: 'Tasks' },
  properties: [
    { databaseId: 'db', id: 'title', name: 'Name', positionKey: 'a0', type: 'title' },
    { databaseId: 'db', id: STATUS, name: 'Status', options: [{ id: 'todo', label: 'Todo', positionKey: 'a0', propertyId: STATUS, style: {} }], positionKey: 'a1', type: 'status' },
    { databaseId: 'db', id: OWNER, name: 'Owner', positionKey: 'a2', type: 'text' },
    { databaseId: 'db', id: PRIORITY, name: 'Priority', positionKey: 'a3', type: 'text' },
  ],
} as unknown as DatabaseSchema;

const visibleSchema = { ...schema, properties: [schema.properties[0]!, schema.properties[1]!, schema.properties[3]!] } as DatabaseSchema;

const existing = {
  databaseId: 'db', id: 'record-1', positionKey: 'a0', properties: { [OWNER]: 'Sam', [PRIORITY]: 'High', [STATUS]: 'todo' }, sequence: 1, title: 'Ship Max',
} as unknown as WorkspaceRecord;

afterEach(cleanup);

describe('BoardView', () => {
  it('renders visible card properties in view order and leaves hidden ones out', () => {
    render(<BoardView databaseId="db" groupPropertyId={STATUS} onCreateRecord={vi.fn()} onOpenRecord={vi.fn()} onUpdateRecord={vi.fn()} records={[existing]} schema={schema} visibleSchema={visibleSchema} />);

    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.queryByText('Owner')).not.toBeInTheDocument();
    expect(screen.queryByText('Sam')).not.toBeInTheDocument();
  });

  it('creates a card in its column and opens the created record', async () => {
    const created = { ...existing, id: 'created', title: 'New task' } as WorkspaceRecord;
    const onCreateRecord = vi.fn().mockResolvedValue(created);
    const onOpenRecord = vi.fn();
    render(<BoardView databaseId="db" groupPropertyId={STATUS} onCreateRecord={onCreateRecord} onOpenRecord={onOpenRecord} onUpdateRecord={vi.fn()} records={[]} schema={schema} visibleSchema={visibleSchema} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Add card' })[0]!);
    await userEvent.type(screen.getByPlaceholderText('Card title...'), 'New task');
    const submit = screen.getAllByRole('button', { name: 'Add card' })
      .find((button) => button.classList.contains('btn-primary'));
    expect(submit).toBeDefined();
    await userEvent.click(submit!);

    expect(onCreateRecord).toHaveBeenCalledWith(expect.objectContaining({ properties: { [STATUS]: 'todo' }, title: 'New task' }));
    expect(onOpenRecord).toHaveBeenCalledWith(created);
  });

  it('explains an empty board and offers property setup when grouping cannot apply', async () => {
    const onManageProperties = vi.fn();
    const noGroup = { ...schema, properties: schema.properties.filter(({ id }) => id !== STATUS) } as DatabaseSchema;
    render(<BoardView databaseId="db" onCreateRecord={vi.fn()} onManageProperties={onManageProperties} onOpenRecord={vi.fn()} onUpdateRecord={vi.fn()} records={[]} schema={noGroup} />);

    expect(screen.getByText(/Board needs a Select or Status/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Manage properties' }));
    expect(onManageProperties).toHaveBeenCalledOnce();
  });
});
