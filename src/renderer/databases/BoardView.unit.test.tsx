// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { PropertyType, WorkspaceRecord } from '../../shared/property-contract';
import { BoardView } from './BoardView';

const GROUP = 'prop-group';

function schema(type: Extract<PropertyType, 'select' | 'status'>, background: string, color?: string): DatabaseSchema {
  return {
    database: { archivedAt: null, createdAt: '', icon: null, id: 'db', parentNodeId: null, positionKey: 'a0', revision: 1, title: 'Projects', updatedAt: '', visibility: 'normal' },
    properties: [
      { archivedAt: null, config: {}, createdAt: '', databaseId: 'db', id: 'title', name: 'Name', options: [], positionKey: 'a0', required: false, type: 'title', uniqueValue: false, updatedAt: '' },
      { archivedAt: null, config: {}, createdAt: '', databaseId: 'db', id: GROUP, name: 'Stage', options: [{ id: 'active', label: 'Active', positionKey: 'a0', propertyId: GROUP, style: { background, color } }], positionKey: 'a1', required: false, type, uniqueValue: false, updatedAt: '' },
    ],
    views: [],
  };
}

function record(title: string, group: string | null): WorkspaceRecord {
  return {
    archivedAt: null,
    contentJson: null,
    createdAt: '',
    databaseId: 'db',
    id: title.toLocaleLowerCase().replaceAll(' ', '-'),
    positionKey: 'a0',
    properties: { [GROUP]: group },
    revision: 1,
    sequence: 1,
    title,
    updatedAt: '',
  };
}

const handlers = {
  onCreateRecord: vi.fn().mockResolvedValue(null),
  onOpenRecord: vi.fn(),
  onUpdateRecord: vi.fn().mockResolvedValue(undefined),
};

function show(currentSchema: DatabaseSchema, records: readonly WorkspaceRecord[] = [record('Card', 'active')]) {
  return render(
    <BoardView databaseId="db" groupPropertyId={GROUP} records={records} schema={currentSchema} {...handlers} />,
  );
}

function column(label: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: label });
  const result = heading.closest<HTMLElement>('.board-column');
  if (!result) throw new Error(`Missing board column for ${label}`);
  return result;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.documentElement.removeAttribute('dir');
});

describe('BoardView option colors', () => {
  it('uses a Status option color for the whole column presentation', () => {
    show(schema('status', 'var(--option-green-bg)', 'var(--option-green-text)'));

    expect(column('Active').style.getPropertyValue('--board-column-color')).toBe('var(--option-green-bg)');
    expect(column('Active').style.getPropertyValue('--board-column-text-color')).toBe('var(--option-green-text)');
    expect(screen.getByRole('combobox')).toHaveClass('board-card__move-select');
  });

  it('uses a Select custom color and updates it when the schema changes', () => {
    const { rerender } = show(schema('select', '#7c3aed', '#ffffff'));

    expect(column('Active')).toHaveAttribute('data-board-color', '#7c3aed');
    rerender(<BoardView databaseId="db" groupPropertyId={GROUP} records={[record('Card', 'active')]} schema={schema('select', '#c026d3', '#ffffff')} {...handlers} />);
    expect(column('Active')).toHaveAttribute('data-board-color', '#c026d3');
  });

  it('keeps the No Status column neutral', () => {
    show(schema('status', 'var(--option-blue-bg)'), [record('Unassigned', null)]);

    expect(column('No Status')).toHaveAttribute('data-board-color', '#64748b');
    expect(column('No Status').style.getPropertyValue('--board-column-text-color')).toBe('var(--text)');
  });

  it('uses the target column color while dragging a card', () => {
    show(schema('select', '#0f766e'), [record('Assigned', 'active'), record('Unassigned', null)]);
    const card = screen.getByRole('button', { name: /Assigned/ });
    const transfer = { dropEffect: 'none', effectAllowed: 'none', getData: vi.fn(), setData: vi.fn() };

    fireEvent.dragStart(card, { dataTransfer: transfer });
    fireEvent.dragOver(column('No Status'), { clientX: 0, dataTransfer: transfer });

    expect(column('No Status')).toHaveAttribute('data-drop-target', 'true');
    expect(column('No Status')).toHaveAttribute('data-board-color', '#64748b');
  });

  it('preserves the same color source in an RTL board', () => {
    document.documentElement.dir = 'rtl';
    show(schema('status', 'var(--option-purple-bg)'));

    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(column('Active')).toHaveAttribute('data-board-color', 'var(--option-purple-bg)');
  });
});
