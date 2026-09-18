import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceProperty, WorkspaceRecord } from '../../shared/property-contract';
import { BoardView } from './BoardView';
import { CalendarView } from './CalendarView';
import { TableView } from './TableView';

const RENDER_RECORD_COUNT = 200;
const MEASURED_RUNS = 3;
const NOW = '2026-09-18T12:00:00.000Z';

function property(
  id: string,
  name: string,
  type: WorkspaceProperty['type'],
  options?: WorkspaceProperty['options'],
): WorkspaceProperty {
  return {
    config: {},
    createdAt: NOW,
    databaseId: 'perf-render',
    id,
    name,
    options,
    positionKey: id,
    required: type === 'title',
    type,
    uniqueValue: false,
    updatedAt: NOW,
  };
}

const STATUS_OPTIONS = [
  { id: 'render-todo', label: 'Todo', positionKey: 'a', propertyId: 'render-status', style: {} },
  { id: 'render-doing', label: 'Doing', positionKey: 'b', propertyId: 'render-status', style: {} },
  { id: 'render-done', label: 'Done', positionKey: 'c', propertyId: 'render-status', style: {} },
] as const;

const PROPERTIES = [
  property('render-title', 'Name', 'title'),
  property('render-notes', 'Notes', 'text'),
  property('render-amount', 'Amount', 'number'),
  property('render-status', 'Status', 'status', STATUS_OPTIONS),
  property('render-due', 'Due', 'date'),
  property('render-done-check', 'Checked', 'checkbox'),
] as const;

const SCHEMA: DatabaseSchema = {
  database: {
    archivedAt: null,
    createdAt: NOW,
    defaultViewId: null,
    icon: null,
    id: 'perf-render',
    parentNodeId: null,
    positionKey: 'a',
    revision: 1,
    title: 'Render performance',
    updatedAt: NOW,
    visibility: 'normal',
  },
  properties: PROPERTIES,
  views: [],
};

const RECORDS: readonly WorkspaceRecord[] = Array.from({ length: RENDER_RECORD_COUNT }, (_, index) => ({
  archivedAt: null,
  contentJson: '[]',
  createdAt: NOW,
  databaseId: 'perf-render',
  icon: null,
  id: `render-${index}`,
  positionKey: String(index).padStart(4, '0'),
  properties: {
    'render-amount': index,
    'render-done-check': index % 2 === 0,
    'render-due': `2026-09-${String((index % 28) + 1).padStart(2, '0')}`,
    'render-notes': `Row ${index} notes`,
    'render-status': STATUS_OPTIONS[index % STATUS_OPTIONS.length]!.id,
  },
  revision: 1,
  sequence: index + 1,
  templateId: null,
  title: `Render record ${String(index).padStart(3, '0')}`,
  updatedAt: NOW,
}));

function measureRender(name: string, render: () => string): void {
  render();
  const runsMs: number[] = [];
  let markup = '';
  for (let runIndex = 0; runIndex < MEASURED_RUNS; runIndex += 1) {
    const started = performance.now();
    markup = render();
    runsMs.push(performance.now() - started);
  }
  const sorted = [...runsMs].sort((a, b) => a - b);
  const mean = runsMs.reduce((sum, value) => sum + value, 0) / runsMs.length;
  const variance = runsMs.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / runsMs.length;
  expect(markup.length).toBeGreaterThan(100);
  console.info(`MAX_PERF_RENDER ${JSON.stringify({
    cvPercent: Number((mean === 0 ? 0 : (Math.sqrt(variance) / mean) * 100).toFixed(2)),
    maxMs: Number((sorted.at(-1) ?? 0).toFixed(3)),
    medianMs: Number((sorted[1] ?? 0).toFixed(3)),
    minMs: Number((sorted[0] ?? 0).toFixed(3)),
    name,
    records: name === 'table render' ? 50 : RENDER_RECORD_COUNT,
    runsMs: runsMs.map((value) => Number(value.toFixed(3))),
  })}`);
}

describe('database view rendering performance baseline', () => {
  it('reports three consecutive render measurements for Table, Board, and Calendar', () => {
    const noCreate = () => Promise.resolve(null);
    const noOpen = () => undefined;
    const noUpdate = () => Promise.resolve(undefined);

    measureRender('table render', () => renderToStaticMarkup(createElement(TableView, {
      calculations: [],
      databaseId: 'perf-render',
      onCreateRecord: noCreate,
      onOpenRecord: noOpen,
      onUpdateRecord: noUpdate,
      records: RECORDS.slice(0, 50),
      schema: SCHEMA,
      totalCount: RENDER_RECORD_COUNT,
    })));

    measureRender('board render', () => renderToStaticMarkup(createElement(BoardView, {
      databaseId: 'perf-render',
      groupPropertyId: 'render-status',
      onCreateRecord: noCreate,
      onOpenRecord: noOpen,
      onUpdateRecord: noUpdate,
      records: RECORDS,
      schema: SCHEMA,
    })));

    measureRender('calendar render', () => renderToStaticMarkup(createElement(CalendarView, {
      databaseId: 'perf-render',
      datePropertyId: 'render-due',
      onCreateRecord: noCreate,
      onOpenRecord: noOpen,
      records: RECORDS,
      schema: SCHEMA,
    })));
  });
});
