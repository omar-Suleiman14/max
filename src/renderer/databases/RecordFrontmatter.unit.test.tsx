// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceProperty } from '../../shared/property-contract';
import { RecordFrontmatter } from './RecordFrontmatter';

afterEach(cleanup);

function titleProperty(): WorkspaceProperty {
  return {
    archivedAt: null,
    config: {},
    createdAt: '2026-09-18T00:00:00.000Z',
    databaseId: 'db',
    id: 'title',
    name: 'Name',
    positionKey: 'a0',
    required: true,
    type: 'title',
    uniqueValue: false,
    updatedAt: '2026-09-18T00:00:00.000Z',
  };
}

function schema(): DatabaseSchema {
  return {
    database: {
      archivedAt: null,
      createdAt: '2026-09-18T00:00:00.000Z',
      defaultViewId: null,
      icon: null,
      id: 'db',
      parentNodeId: null,
      positionKey: 'a0',
      revision: 1,
      title: 'Tasks',
      updatedAt: '2026-09-18T00:00:00.000Z',
      visibility: 'normal',
    },
    properties: [titleProperty()],
    views: [],
  };
}

describe('RecordFrontmatter', () => {
  it('offers explicit creation for an unknown key and creates nothing until accepted', async () => {
    const onCreateProperty = vi.fn().mockResolvedValue(null);
    render(<RecordFrontmatter locale="en" onCreateProperty={onCreateProperty} onWrite={vi.fn().mockResolvedValue(null)} properties={{}} schema={schema()} title="One" />);

    fireEvent.change(screen.getByLabelText('YAML source for record properties'), {
      target: { value: '---\nName: One\nPriority: High\n---' },
    });

    expect(screen.getByText('Create "Priority" as a property')).toBeInTheDocument();
    expect(onCreateProperty).not.toHaveBeenCalled();

    const create = screen.getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Type for Priority'), 'text');
    expect(create).toBeEnabled();
    await userEvent.click(create);
    expect(onCreateProperty).toHaveBeenCalledWith('Priority', 'text', 'High');
  });

  it('shows a per-key type error while retaining valid sibling writes', () => {
    const count: WorkspaceProperty = { ...titleProperty(), id: 'count', name: 'Count', type: 'number', required: false };
    const done: WorkspaceProperty = { ...titleProperty(), id: 'done', name: 'Done', type: 'checkbox', required: false };
    const current = schema();
    const onWrite = vi.fn().mockResolvedValue(null);
    render(<RecordFrontmatter locale="en" onCreateProperty={vi.fn().mockResolvedValue(null)} onWrite={onWrite} properties={{ count: 1, done: false }} schema={{ ...current, properties: [...current.properties, count, done] }} title="One" />);

    fireEvent.change(screen.getByLabelText('YAML source for record properties'), {
      target: { value: '---\nName: One\nCount: wrong\nDone: true\n---' },
    });

    expect(screen.getByText(/Count must be a number/)).toBeInTheDocument();
  });
});
