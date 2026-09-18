// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import axe from 'axe-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceRecord, WorkspaceRecordDraft } from '../../shared/property-contract';
import { FormView } from './FormView';

const schema = {
  database: { createdAt: '2026-09-01T00:00:00.000Z', id: 'db-1', title: 'Products', updatedAt: '2026-09-01T00:00:00.000Z', visibility: 'workspace' as const },
  properties: [
    { config: {}, createdAt: '2026-09-01T00:00:00.000Z', databaseId: 'db-1', id: 'prop-title', name: 'Name', positionKey: 'a0', required: false, type: 'title' as const, uniqueValue: false, updatedAt: '2026-09-01T00:00:00.000Z' },
    { config: {}, createdAt: '2026-09-01T00:00:00.000Z', databaseId: 'db-1', id: 'prop-price', name: 'Price', positionKey: 'a1', required: false, type: 'number' as const, uniqueValue: true, updatedAt: '2026-09-01T00:00:00.000Z' },
    { config: {}, createdAt: '2026-09-01T00:00:00.000Z', databaseId: 'db-1', id: 'prop-related', name: 'Related', positionKey: 'a2', required: false, type: 'relation' as const, uniqueValue: false, updatedAt: '2026-09-01T00:00:00.000Z' },
  ],
  views: [],
} as unknown as DatabaseSchema;

const savedRecord = {
  archivedAt: null, contentJson: null, createdAt: '2026-09-01T00:00:00.000Z', databaseId: 'db-1', id: 'rec-1',
  positionKey: 'a0', properties: { 'prop-price': 100 }, revision: 1, sequence: 1, title: 'Pixel 9', updatedAt: '2026-09-01T00:00:00.000Z',
} as WorkspaceRecord;

describe('FormView', () => {
  afterEach(cleanup);

  it('loads persisted configuration and persists edits without replacing unrelated layout settings', async () => {
    const onLayoutConfigChange = vi.fn<(layoutConfig: Readonly<Record<string, unknown>>) => void>();
    render(<FormView layoutConfig={{ density: 'compact', form: { fields: [
      { helpText: 'Public product name', label: 'Product', propertyId: 'prop-title', required: true, visible: true },
      { propertyId: 'prop-price', required: false, visible: true },
    ] } }} locale="en" onCreateRecord={vi.fn()} onLayoutConfigChange={onLayoutConfigChange} schema={schema}/>);

    expect(screen.getByLabelText('Product')).toBeInTheDocument();
    expect(screen.getByText('Public product name')).toBeInTheDocument();
    await userEvent.setup().type(screen.getByLabelText('Label for Price'), 'Cost');
    const savedConfig = onLayoutConfigChange.mock.lastCall?.[0];
    expect(savedConfig?.density).toBe('compact');
    const savedFields = (savedConfig?.form as { fields?: readonly { label?: string; propertyId: string }[] } | undefined)?.fields;
    expect(savedFields?.some((field) => field.propertyId === 'prop-price' && field.label === 'Cost')).toBe(true);
  });

  it('submits through the supplied record creator and clears after success', async () => {
    const onCreateRecord = vi.fn<(draft: WorkspaceRecordDraft) => Promise<WorkspaceRecord | null>>().mockResolvedValue(savedRecord);
    render(<FormView locale="en" onCreateRecord={onCreateRecord} schema={schema}/>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name'), 'Pixel 9');
    await user.type(screen.getByLabelText('Price'), '100');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onCreateRecord).toHaveBeenCalledTimes(1);
    expect(onCreateRecord.mock.calls[0]?.[0]).toEqual({ databaseId: 'db-1', properties: { 'prop-price': 100 }, title: 'Pixel 9' });
    expect(await screen.findByRole('status')).toHaveTextContent('Record saved');
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });

  it('blocks submission and reports the responsible missing required field', async () => {
    const onCreateRecord = vi.fn();
    render(<FormView layoutConfig={{ form: { fields: [
      { propertyId: 'prop-title', visible: true },
      { propertyId: 'prop-price', required: true, visible: true },
    ] } }} locale="en" onCreateRecord={onCreateRecord} schema={schema}/>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name'), 'Pixel 9');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByText('Price is required.')).toHaveAttribute('role', 'alert');
    expect(screen.getByLabelText('Price')).toHaveAttribute('aria-invalid', 'true');
    expect(onCreateRecord).not.toHaveBeenCalled();
  });

  it('maps backend validation failures to the matching field', async () => {
    const onCreateRecord = vi.fn().mockRejectedValue(new Error('Price must be unique.'));
    render(<FormView locale="en" onCreateRecord={onCreateRecord} schema={schema}/>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name'), 'Pixel 9');
    await user.type(screen.getByLabelText('Price'), '100');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Price must be unique.')).toHaveAttribute('role', 'alert');
    expect(screen.getByLabelText('Price')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows property types it cannot render instead of silently dropping them', () => {
    render(<FormView locale="en" onCreateRecord={vi.fn()} schema={schema}/>);
    expect(screen.getByText('Related is not supported in forms.')).toBeInTheDocument();
    expect(screen.getByText('Not supported in forms')).toBeInTheDocument();
  });

  it('renders in Arabic RTL and passes an axe assertion', async () => {
    const { container } = render(<FormView locale="ar" onCreateRecord={vi.fn()} schema={schema}/>);
    expect(container.querySelector('.database-form-view')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('button', { name: 'حفظ' })).toBeInTheDocument();
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]);
  });
});
