// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceRecord } from '../../shared/property-contract';
import { TableView } from './TableView';

const mockSchema = {
  database: {
    createdAt: '2026-09-01T00:00:00.000Z',
    id: 'db-1',
    title: 'Products',
    updatedAt: '2026-09-01T00:00:00.000Z',
    visibility: 'workspace' as const,
  },
  properties: [
    {
      config: {},
      createdAt: '2026-09-01T00:00:00.000Z',
      databaseId: 'db-1',
      id: 'prop-title',
      name: 'Name',
      positionKey: 'a0',
      type: 'title' as const,
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    {
      config: {},
      createdAt: '2026-09-01T00:00:00.000Z',
      databaseId: 'db-1',
      id: 'prop-status',
      name: 'Status',
      options: [
        { id: 'opt-new', label: 'Brand New', positionKey: 'a0', propertyId: 'prop-status', style: {} },
        { id: 'opt-used', label: 'Used - Good', positionKey: 'a1', propertyId: 'prop-status', style: {} },
      ],
      positionKey: 'a1',
      type: 'select' as const,
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    {
      config: {},
      createdAt: '2026-09-01T00:00:00.000Z',
      databaseId: 'db-1',
      id: 'prop-price',
      name: 'Price',
      positionKey: 'a2',
      type: 'number' as const,
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    {
      config: {},
      createdAt: '2026-09-01T00:00:00.000Z',
      databaseId: 'db-1',
      id: 'prop-active',
      name: 'Active',
      positionKey: 'a3',
      type: 'checkbox' as const,
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
  ],
  views: [],
} as unknown as DatabaseSchema;

const mockRecords: readonly WorkspaceRecord[] = [
  {
    archivedAt: null,
    contentJson: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    databaseId: 'db-1',
    id: 'rec-1',
    positionKey: 'a0',
    properties: {
      'prop-active': true,
      'prop-price': 1650,
      'prop-status': 'Brand New',
    },
    revision: 1,
    sequence: 16,
    title: 'iPhone 15 Pro',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    archivedAt: null,
    contentJson: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    databaseId: 'db-1',
    id: 'rec-2',
    positionKey: 'a1',
    properties: {
      'prop-active': false,
      'prop-price': null,
      'prop-status': null,
    },
    revision: 1,
    sequence: 17,
    title: 'Galaxy S24',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
];

describe('TableView', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders Notion-style column headers with type badges and property names', () => {
    render(
      <TableView
        calculations={[]}
        databaseId="db-1"
        onCreateRecord={vi.fn()}
        onOpenRecord={vi.fn()}
        onUpdateRecord={vi.fn()}
        records={mockRecords}
        schema={mockSchema}
      />,
    );

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Price')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders select properties as pills and empty select as a dash, not (Empty)', () => {
    render(
      <TableView
        calculations={[]}
        databaseId="db-1"
        onCreateRecord={vi.fn()}
        onOpenRecord={vi.fn()}
        onUpdateRecord={vi.fn()}
        records={mockRecords}
        schema={mockSchema}
      />,
    );

    // Record 1 has 'Brand New' pill
    const pill = screen.getByText('Brand New');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveClass('database-cell-pill');

    // Should NOT have any raw (Empty) text
    expect(screen.queryByText('(Empty)')).not.toBeInTheDocument();

    // Does not render ugly sequence badge like #16 or #17
    expect(screen.queryByText('#16')).not.toBeInTheDocument();
  });

  it('opens popover on clicking a select cell and selects a new option', async () => {
    const user = userEvent.setup();
    const handleUpdateRecord = vi.fn();

    render(
      <TableView
        calculations={[]}
        databaseId="db-1"
        onCreateRecord={vi.fn()}
        onOpenRecord={vi.fn()}
        onUpdateRecord={handleUpdateRecord}
        records={mockRecords}
        schema={mockSchema}
      />,
    );

    const pillBtn = screen.getByText('Brand New');
    await user.click(pillBtn);

    // Popover opens showing options
    const option = await screen.findByRole('option', { name: 'Used - Good' });
    expect(option).toBeInTheDocument();

    await user.click(option);
    expect(handleUpdateRecord).toHaveBeenCalledWith('rec-1', {
      properties: {
        'prop-status': 'opt-used',
      },
    });
  });

  it('toggles checkbox property on click', async () => {
    const user = userEvent.setup();
    const handleUpdateRecord = vi.fn();

    render(
      <TableView
        calculations={[]}
        databaseId="db-1"
        onCreateRecord={vi.fn()}
        onOpenRecord={vi.fn()}
        onUpdateRecord={handleUpdateRecord}
        records={mockRecords}
        schema={mockSchema}
      />,
    );

    const checkboxBtns = screen.getAllByRole('button', { name: 'Active' }).filter((button) => button.classList.contains('database-cell-check'));
    expect(checkboxBtns).toHaveLength(2);

    // Click active checkbox on first record to uncheck
    await user.click(checkboxBtns[0]!);
    expect(handleUpdateRecord).toHaveBeenCalledWith('rec-1', {
      properties: {
        'prop-active': false,
      },
    });
  });
});
