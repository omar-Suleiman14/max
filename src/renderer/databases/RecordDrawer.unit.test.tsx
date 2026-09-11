// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ui/notion-block-editor', () => ({ NotionBlockEditor: () => <div>Page content</div> }));

import { RecordDrawer } from './RecordDrawer';

function property(id: string, name: string, type: string, required: boolean) {
  return {
    config: {},
    createdAt: '2026-09-11',
    databaseId: 'db',
    id,
    name,
    positionKey: id,
    required,
    type,
    uniqueValue: false,
    updatedAt: '2026-09-11',
  };
}

const schema = {
  database: { id: 'db', title: 'Phones' },
  properties: [
    property('title', 'Name', 'title', true),
    property('imei', 'IMEI', 'text', true),
    property('cost', 'Cost', 'number', true),
    property('note', 'Note', 'text', false),
  ],
  views: [],
};

const record = {
  archivedAt: null,
  contentJson: null,
  createdAt: '2026-09-11',
  databaseId: 'db',
  id: 'record-1',
  positionKey: 'a0',
  properties: { cost: 250 },
  revision: 1,
  title: 'Nokia 3310',
  updatedAt: '2026-09-11',
};

type DrawerProps = Parameters<typeof RecordDrawer>[0];

function drawer() {
  return render(
    <RecordDrawer
      isOpen
      onArchive={() => Promise.resolve()}
      onClose={vi.fn()}
      record={record as unknown as DrawerProps['record']}
      schema={schema as unknown as DrawerProps['schema']}
    />,
  );
}

beforeEach(() => {
  Object.defineProperty(window, 'maxApi', {
    configurable: true,
    value: { workspace: { updateRecord: vi.fn(() => Promise.resolve({ ok: true, value: record })) } },
    writable: true,
  });
});

afterEach(cleanup);

describe('a record with unanswered required properties', () => {
  it('marks the outstanding ones instead of refusing to show the record', () => {
    drawer();

    // The record opened despite IMEI being empty: this is where the value gets
    // typed in, so blocking here left nowhere to supply it.
    expect(screen.getByDisplayValue('Nokia 3310')).toBeInTheDocument();
    expect(document.querySelector('.record-required-summary')).toHaveTextContent('1 required property still needs a value: IMEI');

    const rows = document.querySelectorAll('.record-drawer__prop-row');
    const marked = [...rows].filter((row) => row.hasAttribute('data-required-unmet'));
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent('IMEI');
  });

  it('clears the mark as soon as the value is filled in', async () => {
    const user = userEvent.setup();
    drawer();

    const inputs = [...document.querySelectorAll<HTMLInputElement>('.record-drawer__prop-row input.input-clean')];
    await user.type(inputs[0]!, '355123456789012');

    expect(document.querySelectorAll('.record-drawer__prop-row[data-required-unmet]')).toHaveLength(0);
    expect(document.querySelector('.record-required-summary')).toBeNull();
  });

  it('leaves an answered requirement and an optional property unmarked', () => {
    drawer();

    const labels = [...document.querySelectorAll('.record-drawer__prop-row')]
      .map((row) => ({
        name: row.querySelector('.record-drawer__prop-label')?.textContent ?? '',
        unmet: row.hasAttribute('data-required-unmet'),
      }));

    expect(labels.find(({ name }) => name.includes('Cost'))?.unmet).toBe(false);
    expect(labels.find(({ name }) => name.includes('Note'))?.unmet).toBe(false);
    // Required is still announced on every required property, answered or not.
    expect(document.querySelectorAll('.record-required-mark')).toHaveLength(2);
  });
});
