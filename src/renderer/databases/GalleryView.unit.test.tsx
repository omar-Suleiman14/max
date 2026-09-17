// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceRecord } from '../../shared/property-contract';
import { GalleryView } from './GalleryView';

const PHOTO = '22222222-2222-4222-8222-222222222222';
const STAGE = '33333333-3333-4333-8333-333333333333';
const RISK = '44444444-4444-4444-8444-444444444444';

const schema = {
  database: { archivedAt: null, createdAt: '', icon: null, id: 'db', parentNodeId: null, positionKey: 'a0', title: 'Projects', updatedAt: '' },
  properties: [
    { config: {}, databaseId: 'db', id: 'title', isRequired: false, name: 'Name', options: [], positionKey: 'a0', type: 'title' },
    { config: {}, databaseId: 'db', id: PHOTO, isRequired: false, name: 'Photo', options: [], positionKey: 'a1', type: 'file' },
    { config: {}, databaseId: 'db', id: STAGE, isRequired: false, name: 'Stage', options: [], positionKey: 'a2', type: 'text' },
    { config: {}, databaseId: 'db', id: RISK, isRequired: false, name: 'Risk', options: [{ id: 'risk-high', label: 'High', positionKey: 'a0', propertyId: RISK, style: {} }], positionKey: 'a3', type: 'select' },
  ],
} as unknown as DatabaseSchema;

function record(title: string, properties: Record<string, unknown>): WorkspaceRecord {
  return {
    archivedAt: null,
    createdAt: '2026-09-01T09:00:00.000Z',
    databaseId: 'db',
    icon: null,
    id: title,
    positionKey: 'a0',
    properties,
    sequence: 1,
    title,
    updatedAt: '2026-09-01T09:00:00.000Z',
  } as unknown as WorkspaceRecord;
}

function show(records: readonly WorkspaceRecord[], overrides: Partial<Parameters<typeof GalleryView>[0]> = {}) {
  return render(
    <GalleryView
      coverPropertyId={PHOTO}
      locale="en"
      onCreate={vi.fn()}
      onOpenRecord={vi.fn()}
      records={records}
      schema={schema}
      {...overrides}
    />,
  );
}

afterEach(cleanup);

describe('GalleryView', () => {
  it('shows the picture the cover property names', () => {
    const name = 'a'.repeat(64);
    const { container } = show([record('Website redesign', { [PHOTO]: [`max://asset/${name}.png`] })]);

    // Under jsdom the page is served over http, the same as the browser preview,
    // where the max: scheme has no handler and the asset is fetched over http.
    expect(container.querySelector('.database-gallery-image')?.getAttribute('src')).toBe(`/__max/asset/${name}.png`);
  });

  it('keeps a placeholder when the record has no cover', () => {
    const { container } = show([record('Product launch', { [PHOTO]: null })]);

    expect(container.querySelector('.database-gallery-image')).toBeNull();
    expect(container.querySelector('.database-gallery-preview svg')).not.toBeNull();
  });

  it('ignores an attachment that is not a picture', () => {
    const { container } = show([record('Customer research', { [PHOTO]: ['max://asset/contract.pdf'] })]);

    expect(container.querySelector('.database-gallery-image')).toBeNull();
  });

  it('shows a few of the record’s other property values under the title', () => {
    show([record('Website redesign', { [PHOTO]: null, [STAGE]: 'Planning' })]);

    expect(screen.getByText('Stage')).toBeInTheDocument();
    expect(screen.getByText('Planning')).toBeInTheDocument();
  });

  it('uses the visible schema for card properties while keeping the full schema for cover configuration', () => {
    const visibleSchema = { ...schema, properties: [schema.properties[0]!, schema.properties[3]!] } as DatabaseSchema;
    show([record('Website redesign', { [PHOTO]: null, [RISK]: 'risk-high', [STAGE]: 'Hidden stage' })], { visibleSchema });

    expect(screen.getByRole('combobox', { name: 'Cover property' })).toBeInTheDocument();
    expect(screen.getByText('Risk')).toBeInTheDocument();
    expect(screen.queryByText('Stage')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden stage')).not.toBeInTheDocument();
  });

  it('names a choice rather than printing the option id it is stored as', () => {
    show([record('Website redesign', { [PHOTO]: null, [RISK]: 'risk-high' })]);

    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.queryByText('risk-high')).not.toBeInTheDocument();
  });

  it('lets the cover property be chosen', async () => {
    const onCoverPropertyChange = vi.fn();
    show([record('Website redesign', {})], { coverPropertyId: null, onCoverPropertyChange });

    await userEvent.click(screen.getByRole('combobox', { name: 'Cover property' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Photo' }));

    expect(onCoverPropertyChange).toHaveBeenCalledWith(PHOTO);
  });

  it('opens a card and offers a single useful creation action when empty', async () => {
    const onOpenRecord = vi.fn();
    const one = record('Website redesign', {});
    const { rerender } = show([one], { onOpenRecord });
    await userEvent.click(screen.getByRole('button', { name: /Website redesign/ }));
    expect(onOpenRecord).toHaveBeenCalledWith(one);

    const onCreate = vi.fn();
    rerender(<GalleryView coverPropertyId={PHOTO} locale="en" onCreate={onCreate} onOpenRecord={onOpenRecord} records={[]} schema={schema} />);
    expect(screen.getByText('No records yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New page' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create first page' }));
    expect(onCreate).toHaveBeenCalledOnce();
  });
});
