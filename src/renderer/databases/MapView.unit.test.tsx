// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import axe from 'axe-core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceRecord } from '../../shared/property-contract';
import { MapView } from './MapView';
import { parseMapPoint } from './map-utils';

const schema = {
  database: { createdAt: '2026-09-01', id: 'db-1', title: 'Places', updatedAt: '2026-09-01', visibility: 'workspace' as const },
  properties: [
    { config: {}, createdAt: '2026-09-01', databaseId: 'db-1', id: 'prop-title', name: 'Name', positionKey: 'a0', type: 'title' as const, updatedAt: '2026-09-01' },
    { config: {}, createdAt: '2026-09-01', databaseId: 'db-1', id: 'prop-location', name: 'Coordinates', positionKey: 'a1', type: 'text' as const, updatedAt: '2026-09-01' },
    { config: {}, createdAt: '2026-09-01', databaseId: 'db-1', id: 'prop-notes', name: 'Notes', positionKey: 'a2', type: 'text' as const, updatedAt: '2026-09-01' },
  ],
  views: [],
} as unknown as DatabaseSchema;

const records: readonly WorkspaceRecord[] = [
  { archivedAt: null, contentJson: null, createdAt: '2026-09-01', databaseId: 'db-1', id: 'rec-1', positionKey: 'a0', properties: { 'prop-location': '30.0444, 31.2357' }, revision: 1, sequence: 1, title: 'Cairo', updatedAt: '2026-09-01' },
  { archivedAt: null, contentJson: null, createdAt: '2026-09-01', databaseId: 'db-1', id: 'rec-2', positionKey: 'a1', properties: { 'prop-location': 'not coordinates' }, revision: 1, sequence: 2, title: 'Unmapped', updatedAt: '2026-09-01' },
];

function installMapsApi(overrides: Record<string, unknown> = {}) {
  const maps = {
    getStatus: vi.fn().mockResolvedValue({ configured: true, disclosure: 'Coordinates are sent.', providerName: 'Test maps' }),
    render: vi.fn().mockResolvedValue({ ok: true, value: { imageDataUrl: 'data:image/png;base64,AQID', providerName: 'Test maps' } }),
    ...overrides,
  };
  Object.defineProperty(window, 'maxApi', { configurable: true, value: { maps } });
  return maps;
}

function renderMap(options: {
  layoutConfig?: Readonly<Record<string, unknown>>;
  locale?: 'ar' | 'en';
  onLayoutConfigChange?: (config: Readonly<Record<string, unknown>>) => void;
  onManageProperties?: () => void;
  onOpenRecord?: (record: WorkspaceRecord) => void;
  records?: readonly WorkspaceRecord[];
  schema?: DatabaseSchema;
} = {}) {
  const props = {
    databaseId: 'db-1',
    layoutConfig: options.layoutConfig,
    locale: options.locale ?? 'en',
    onArchiveRecord: vi.fn().mockResolvedValue(undefined),
    onCreateRecord: vi.fn().mockResolvedValue(null),
    onLayoutConfigChange: options.onLayoutConfigChange,
    onManageProperties: options.onManageProperties,
    onOpenRecord: options.onOpenRecord ?? vi.fn(),
    records: options.records ?? records,
    schema: options.schema ?? schema,
  };
  return render(<MapView {...props} />);
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'maxApi');
});

describe('MapView', () => {
  it('parses only finite in-range latitude and longitude pairs', () => {
    expect(parseMapPoint('30.0444, 31.2357')).toEqual({ latitude: 30.0444, longitude: 31.2357 });
    expect(parseMapPoint('91, 31')).toBeNull();
    expect(parseMapPoint('30, 181')).toBeNull();
    expect(parseMapPoint('30')).toBeNull();
    expect(parseMapPoint('hello, 31')).toBeNull();
  });

  it('requires disclosure acceptance before any provider render and preserves unrelated layout config', async () => {
    const maps = installMapsApi();
    const onLayoutConfigChange = vi.fn();
    renderMap({ layoutConfig: { density: 'compact', map: { custom: 'keep' } }, onLayoutConfigChange });

    expect(await screen.findByText('Before showing the map')).toBeInTheDocument();
    expect(maps.render).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Continue and show map' }));
    expect(onLayoutConfigChange).toHaveBeenCalledWith({
      density: 'compact',
      map: { custom: 'keep', disclosureAccepted: true, locationPropertyId: 'prop-location' },
    });
    expect(maps.render).not.toHaveBeenCalled();
  });

  it('renders accepted coordinates and opens the record from its local marker', async () => {
    const maps = installMapsApi();
    const onOpenRecord = vi.fn();
    renderMap({ layoutConfig: { map: { disclosureAccepted: true, locationPropertyId: 'prop-location' } }, onOpenRecord });

    await waitFor(() => expect(maps.render).toHaveBeenCalledWith([{ latitude: 30.0444, longitude: 31.2357 }]));
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Cairo' }));
    expect(onOpenRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec-1' }));
    expect(screen.getByText('Records without valid coordinates')).toBeInTheDocument();
    expect(screen.getByText('Unmapped')).toBeInTheDocument();
  });

  it('keeps records usable when no text property exists', async () => {
    installMapsApi();
    const onManageProperties = vi.fn();
    const noText = { ...schema, properties: schema.properties.filter((property) => property.type !== 'text') } as DatabaseSchema;
    renderMap({ onManageProperties, schema: noText });

    expect(screen.getByText('Add a Text property containing coordinates as: latitude, longitude.')).toBeInTheDocument();
    expect(screen.getByText('Cairo')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add Text property' }));
    expect(onManageProperties).toHaveBeenCalledOnce();
  });

  it('keeps records usable when coordinates are malformed or the provider is unavailable', async () => {
    installMapsApi({ getStatus: vi.fn().mockResolvedValue({ configured: false, disclosure: '', providerName: 'Unavailable' }) });
    renderMap();
    expect(await screen.findByRole('status')).toHaveTextContent('Map rendering is unavailable');
    expect(screen.getByText('Cairo')).toBeInTheDocument();
  });

  it('falls back to the list when the maps API or provider request fails', async () => {
    Object.defineProperty(window, 'maxApi', { configurable: true, value: {} });
    const { rerender } = renderMap();
    expect(await screen.findByRole('status')).toHaveTextContent('Map rendering is unavailable');

    const maps = installMapsApi({ render: vi.fn().mockRejectedValue(new Error('offline')) });
    rerender(<MapView
      databaseId="db-1"
      layoutConfig={{ map: { disclosureAccepted: true, locationPropertyId: 'prop-location' } }}
      locale="en"
      onArchiveRecord={vi.fn().mockResolvedValue(undefined)}
      onCreateRecord={vi.fn().mockResolvedValue(null)}
      onOpenRecord={vi.fn()}
      records={records}
      schema={schema}
    />);
    await waitFor(() => expect(maps.render).toHaveBeenCalled());
    expect(await screen.findByRole('status')).toHaveTextContent('Could not render map: Could not reach the map provider.');
  });

  it('shows the zero-valid-coordinate state without contacting render', async () => {
    const maps = installMapsApi();
    renderMap({
      layoutConfig: { map: { disclosureAccepted: true, locationPropertyId: 'prop-location' } },
      records: [{ ...records[0]!, properties: { 'prop-location': '91, 200' } }],
    });

    expect(await screen.findByText('No valid coordinates were found in this property.')).toBeInTheDocument();
    expect(maps.render).not.toHaveBeenCalled();
    expect(screen.getByText('Cairo')).toBeInTheDocument();
  });

  it('renders RTL accessibly after disclosure is accepted', async () => {
    installMapsApi();
    const { container } = renderMap({ locale: 'ar', layoutConfig: { map: { disclosureAccepted: true, locationPropertyId: 'prop-location' } } });
    await screen.findByRole('button', { name: 'Cairo' });
    expect(container.querySelector('.database-map')).toHaveAttribute('dir', 'rtl');
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
