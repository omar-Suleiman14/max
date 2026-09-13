// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceRecord } from '../../shared/property-contract';
import { AdditionalViews } from './AdditionalViews';

const schema = {
  database: { createdAt: '2026-09-01T00:00:00.000Z', id: 'db-1', title: 'Products', updatedAt: '2026-09-01T00:00:00.000Z', visibility: 'workspace' as const },
  properties: [
    { config: {}, createdAt: '2026-09-01T00:00:00.000Z', databaseId: 'db-1', id: 'prop-title', name: 'Name', positionKey: 'a0', type: 'title' as const, updatedAt: '2026-09-01T00:00:00.000Z' },
    {
      config: {}, createdAt: '2026-09-01T00:00:00.000Z', databaseId: 'db-1', id: 'prop-status', name: 'Status', positionKey: 'a1', type: 'select' as const, updatedAt: '2026-09-01T00:00:00.000Z',
      options: [{ id: 'opt-new', label: 'Brand New', positionKey: 'a0', propertyId: 'prop-status', style: {} }],
    },
    { config: {}, createdAt: '2026-09-01T00:00:00.000Z', databaseId: 'db-1', id: 'prop-price', name: 'Price', positionKey: 'a2', type: 'number' as const, updatedAt: '2026-09-01T00:00:00.000Z' },
    { config: {}, createdAt: '2026-09-01T00:00:00.000Z', databaseId: 'db-1', id: 'prop-due', name: 'Due', positionKey: 'a3', type: 'date' as const, updatedAt: '2026-09-01T00:00:00.000Z' },
  ],
  views: [],
} as unknown as DatabaseSchema;

const records: readonly WorkspaceRecord[] = [
  { archivedAt: null, contentJson: null, createdAt: '2026-09-01T00:00:00.000Z', databaseId: 'db-1', id: 'rec-1', positionKey: 'a0', properties: { 'prop-due': '2026-09-04', 'prop-price': 1650, 'prop-status': 'opt-new' }, revision: 1, sequence: 1, title: 'iPhone 15 Pro', updatedAt: '2026-09-02T00:00:00.000Z' },
  { archivedAt: null, contentJson: null, createdAt: '2026-09-01T00:00:00.000Z', databaseId: 'db-1', id: 'rec-2', positionKey: 'a1', properties: { 'prop-due': '2026-09-02', 'prop-price': 350, 'prop-status': null }, revision: 1, sequence: 2, title: 'Galaxy S24', updatedAt: '2026-09-03T00:00:00.000Z' },
];

function renderView(layout: 'chart' | 'dashboard' | 'timeline' | 'form', onCreateRecord = vi.fn()) {
  const onOpenRecord = vi.fn();
  render(<AdditionalViews layout={layout} locale="en" onCreateRecord={onCreateRecord} onOpenRecord={onOpenRecord} records={records} schema={schema} />);
  return { onCreateRecord, onOpenRecord };
}

describe('the chart, dashboard, timeline and form layouts', () => {
  afterEach(cleanup);

  it('totals every number property on the dashboard', () => {
    renderView('dashboard');

    expect(screen.getByText('Records')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('2,000')).toBeInTheDocument();
  });

  it('draws one bar per record and opens the record behind it', async () => {
    const { onOpenRecord } = renderView('chart');

    expect(screen.getByText('iPhone 15 Pro')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByText('Galaxy S24'));

    expect(onOpenRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec-2' }));
  });

  it('orders the timeline by its date property', () => {
    renderView('timeline');

    const dates = screen.getAllByText(/2026-09-0/).map((element) => element.textContent);
    expect(dates).toEqual(['2026-09-02', '2026-09-04']);
  });

  it('saves a record from the form and says so', async () => {
    const onCreateRecord = vi.fn().mockResolvedValue(records[0]);
    renderView('form', onCreateRecord);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name'), 'Pixel 9');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onCreateRecord).toHaveBeenCalledWith(expect.objectContaining({ databaseId: 'db-1', title: 'Pixel 9' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Record saved');
  });

  it('renders nothing until the schema has loaded', () => {
    const { container } = render(<AdditionalViews layout="chart" locale="en" onCreateRecord={vi.fn()} onOpenRecord={vi.fn()} records={records} schema={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
