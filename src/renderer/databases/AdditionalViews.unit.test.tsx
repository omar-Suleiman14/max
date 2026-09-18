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
    { config: {}, createdAt: '2026-09-01T00:00:00.000Z', databaseId: 'db-1', id: 'prop-start', name: 'Start', positionKey: 'a3', type: 'date' as const, updatedAt: '2026-09-01T00:00:00.000Z' },
    { config: {}, createdAt: '2026-09-01T00:00:00.000Z', databaseId: 'db-1', id: 'prop-due', name: 'Due', positionKey: 'a4', type: 'date' as const, updatedAt: '2026-09-01T00:00:00.000Z' },
  ],
  views: [],
} as unknown as DatabaseSchema;

const records: readonly WorkspaceRecord[] = [
  { archivedAt: null, contentJson: null, createdAt: '2026-09-01T00:00:00.000Z', databaseId: 'db-1', id: 'rec-1', positionKey: 'a0', properties: { 'prop-due': '2026-09-04', 'prop-price': 1650, 'prop-start': '2026-09-03', 'prop-status': 'opt-new' }, revision: 1, sequence: 1, title: 'iPhone 15 Pro', updatedAt: '2026-09-02T00:00:00.000Z' },
  { archivedAt: null, contentJson: null, createdAt: '2026-09-01T00:00:00.000Z', databaseId: 'db-1', id: 'rec-2', positionKey: 'a1', properties: { 'prop-due': '2026-09-02', 'prop-price': 350, 'prop-start': '2026-09-01', 'prop-status': null }, revision: 1, sequence: 2, title: 'Galaxy S24', updatedAt: '2026-09-03T00:00:00.000Z' },
];

function renderView(layout: 'chart' | 'timeline' | 'form', onCreateRecord = vi.fn()) {
  const onOpenRecord = vi.fn();
  render(<AdditionalViews layout={layout} locale="en" onCreateRecord={onCreateRecord} onOpenRecord={onOpenRecord} records={records} schema={schema} />);
  return { onCreateRecord, onOpenRecord };
}

describe('the chart, timeline and form layouts', () => {
  afterEach(cleanup);

  it('draws one bar per record and opens the record behind it', async () => {
    const { onOpenRecord } = renderView('chart');

    expect(screen.getByText('iPhone 15 Pro')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByText('Galaxy S24'));

    expect(onOpenRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec-2' }));
  });

  it('uses the saved single-date property, orders chronologically, and persists config changes', async () => {
    const onLayoutConfigChange = vi.fn();
    render(<AdditionalViews
      layout="timeline"
      layoutConfig={{ density: 'compact', timeline: { endPropertyId: null, startPropertyId: 'prop-due' } }}
      locale="en"
      onCreateRecord={vi.fn()}
      onLayoutConfigChange={onLayoutConfigChange}
      onOpenRecord={vi.fn()}
      records={records}
      schema={schema}
    />);

    expect(screen.getByLabelText('Start date')).toHaveValue('prop-due');
    const dates = screen.getAllByText(/2026-09-0/).map((element) => element.textContent);
    expect(dates).toEqual(['2026-09-02', '2026-09-04']);

    await userEvent.setup().selectOptions(screen.getByLabelText('Start date'), 'prop-start');
    expect(onLayoutConfigChange).toHaveBeenCalledWith({
      density: 'compact',
      timeline: { endPropertyId: null, startPropertyId: 'prop-start' },
    });
  });

  it('renders start/end ranges and opens the selected record', async () => {
    const onOpenRecord = vi.fn();
    render(<AdditionalViews
      layout="timeline"
      layoutConfig={{ timeline: { endPropertyId: 'prop-due', startPropertyId: 'prop-start' } }}
      locale="en"
      onCreateRecord={vi.fn()}
      onOpenRecord={onOpenRecord}
      records={records}
      schema={schema}
    />);

    expect(screen.getByText('2026-09-01 → 2026-09-02')).toBeInTheDocument();
    expect(screen.getByText('2026-09-03 → 2026-09-04')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByText('Galaxy S24'));
    expect(onOpenRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec-2' }));
  });

  it('renders only records supplied by the active filtered query', () => {
    render(<AdditionalViews
      layout="timeline"
      layoutConfig={{ timeline: { startPropertyId: 'prop-start' } }}
      locale="en"
      onCreateRecord={vi.fn()}
      onOpenRecord={vi.fn()}
      records={[records[1]!]}
      schema={schema}
    />);

    expect(screen.getByText('Galaxy S24')).toBeInTheDocument();
    expect(screen.queryByText('iPhone 15 Pro')).not.toBeInTheDocument();
  });

  it('keeps records with missing range dates visible', () => {
    const missing = { ...records[0]!, id: 'rec-missing', properties: {}, title: 'Unscheduled' };
    render(<AdditionalViews
      layout="timeline"
      layoutConfig={{ timeline: { endPropertyId: 'prop-due', startPropertyId: 'prop-start' } }}
      locale="en"
      onCreateRecord={vi.fn()}
      onOpenRecord={vi.fn()}
      records={[missing]}
      schema={schema}
    />);

    expect(screen.getByText('Unscheduled')).toBeInTheDocument();
    expect(screen.getByText('No start date → No end date')).toBeInTheDocument();
  });

  it('offers property management when the database has no Date property', async () => {
    const onManageProperties = vi.fn();
    const noDateSchema = { ...schema, properties: schema.properties.filter((property) => property.type !== 'date') };
    render(<AdditionalViews
      layout="timeline"
      locale="en"
      onCreateRecord={vi.fn()}
      onManageProperties={onManageProperties}
      onOpenRecord={vi.fn()}
      records={records}
      schema={noDateSchema}
    />);

    expect(screen.getByText('Add a Date property to place records on the timeline.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add Date property' }));
    expect(onManageProperties).toHaveBeenCalledOnce();
  });

  it('renders Timeline controls in RTL for Arabic', () => {
    const { container } = render(<AdditionalViews
      layout="timeline"
      layoutConfig={{ timeline: { startPropertyId: 'prop-start' } }}
      locale="ar"
      onCreateRecord={vi.fn()}
      onOpenRecord={vi.fn()}
      records={records}
      schema={schema}
    />);

    expect(container.querySelector('.database-timeline')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByLabelText('تاريخ البداية')).toBeInTheDocument();
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
