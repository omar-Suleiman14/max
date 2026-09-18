// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import axe from 'axe-core';
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

  it('draws one bar per record and opens the record behind it', () => {
    render(<AdditionalViews
      calculations={[{ calculation: 'count', formattedValue: '2', propertyId: 'title', value: 2 }]}
      layout="chart"
      locale="en"
      onCreateRecord={vi.fn()}
      onOpenRecord={vi.fn()}
      records={records}
      schema={schema}
    />);

    expect(screen.getByRole('img', { name: 'Bar chart' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'All records: 2' })).toBeInTheDocument();
  });

  it('renders line and pie from the same grouped query calculations', () => {
    const groups = [
      { calculations: [{ calculation: 'sum' as const, formattedValue: '1650.00', propertyId: 'prop-price', value: 1650 }], groupKey: 'new', label: 'Brand New', records: [records[0]!], totalCount: 1 },
      { calculations: [{ calculation: 'sum' as const, formattedValue: '350.00', propertyId: 'prop-price', value: 350 }], groupKey: 'other', label: 'Other', records: [records[1]!], totalCount: 1 },
    ];
    const { rerender } = render(<AdditionalViews
      groups={groups}
      layout="chart"
      layoutConfig={{ chart: { calculation: 'sum', propertyId: 'prop-price', type: 'line' } }}
      locale="en"
      onCreateRecord={vi.fn()}
      onOpenRecord={vi.fn()}
      records={records}
      schema={schema}
    />);
    expect(screen.getByRole('img', { name: 'Line chart' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Brand New: 1,650' })).toBeInTheDocument();

    rerender(<AdditionalViews
      groups={groups}
      layout="chart"
      layoutConfig={{ chart: { calculation: 'sum', propertyId: 'prop-price', type: 'pie' } }}
      locale="en"
      onCreateRecord={vi.fn()}
      onOpenRecord={vi.fn()}
      records={records}
      schema={schema}
    />);
    expect(screen.getByRole('img', { name: 'Pie chart' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Other: 350' })).toBeInTheDocument();
  });

  it('persists chart type and aggregation without replacing unrelated layout settings', async () => {
    const onLayoutConfigChange = vi.fn();
    render(<AdditionalViews
      calculations={[{ calculation: 'count', formattedValue: '2', propertyId: 'title', value: 2 }]}
      layout="chart"
      layoutConfig={{ density: 'compact' }}
      locale="en"
      onCreateRecord={vi.fn()}
      onLayoutConfigChange={onLayoutConfigChange}
      onOpenRecord={vi.fn()}
      records={records}
      schema={schema}
    />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Value'), 'prop-price');
    expect(onLayoutConfigChange).toHaveBeenLastCalledWith({
      calculations: [{ calculation: 'sum', propertyId: 'prop-price' }],
      chart: { calculation: 'sum', propertyId: 'prop-price', type: 'bar' },
      density: 'compact',
    });
  });

  it('shows an empty state when the filtered query has no calculated data', () => {
    render(<AdditionalViews layout="chart" locale="en" onCreateRecord={vi.fn()} onOpenRecord={vi.fn()} records={[]} schema={schema} />);
    expect(screen.getByRole('status')).toHaveTextContent('No chart data');
  });

  it('renders a single data point and exposes negative values', () => {
    render(<AdditionalViews
      groups={[{ calculations: [{ calculation: 'sum', formattedValue: '-25.00', propertyId: 'prop-price', value: -25 }], groupKey: 'loss', label: 'Loss', records: [records[0]!], totalCount: 1 }]}
      layout="chart"
      layoutConfig={{ chart: { calculation: 'sum', propertyId: 'prop-price', type: 'bar' } }}
      locale="en"
      onCreateRecord={vi.fn()}
      onOpenRecord={vi.fn()}
      records={[records[0]!]}
      schema={schema}
    />);
    expect(screen.getByRole('listitem', { name: 'Loss: -25' })).toBeInTheDocument();
    expect(document.querySelector('.database-chart-track i')).toHaveAttribute('data-negative');
  });

  it('uses only the calculations returned by the active filtered query', () => {
    render(<AdditionalViews
      calculations={[{ calculation: 'sum', formattedValue: '350.00', propertyId: 'prop-price', value: 350 }]}
      layout="chart"
      layoutConfig={{ chart: { calculation: 'sum', propertyId: 'prop-price', type: 'bar' } }}
      locale="en"
      onCreateRecord={vi.fn()}
      onOpenRecord={vi.fn()}
      records={[records[1]!]}
      schema={schema}
    />);
    expect(screen.getByRole('listitem', { name: 'All records: 350' })).toBeInTheDocument();
    expect(screen.queryByText('1,650')).not.toBeInTheDocument();
  });

  it('is accessible in dark RTL rendering', async () => {
    const { container } = render(<div data-theme="dark"><AdditionalViews
      calculations={[{ calculation: 'count', formattedValue: '2', propertyId: 'title', value: 2 }]}
      layout="chart"
      locale="ar"
      onCreateRecord={vi.fn()}
      onOpenRecord={vi.fn()}
      records={records}
      schema={schema}
    /></div>);
    expect(container.querySelector('.database-chart')).toHaveAttribute('dir', 'rtl');
    expect((await axe.run(container)).violations).toEqual([]);
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
