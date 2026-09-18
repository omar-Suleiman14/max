import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';

import type { DatabaseQueryParams } from '../../shared/query-contract';
import { DatabaseService } from './database-service';

function service(): DatabaseService {
  const db = new DatabaseService(':memory:');
  db.initialize();
  return db;
}

describe('Performance Audit & Reference Benchmarks', () => {
  /**
   * Hosted runners preempt threads, so a single sample measures the scheduler
   * as much as the query. Take the fastest of a few runs: a genuine regression
   * slows every run, while a descheduled sample only inflates the slowest.
   * All three queries are read-only, so repeating them is free of side effects.
   */
  function fastestRun<T>(run: () => T, attempts = 5): { durationMs: number; result: T } {
    let result = run();
    let durationMs = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const started = performance.now();
      result = run();
      durationMs = Math.min(durationMs, performance.now() - started);
    }
    return { durationMs, result };
  }

  it('executes search, ledger, and statement queries within their UI response budgets across large datasets', () => {
    const db = service();

    const cashAccount = db.accounts.createAccount({
      accountType: 'cash',
      initialBalance: 10000,
      name: 'Central Cash Vault',
    });

    const customer = db.objects.createRecord({
      label: 'Performance Test Customer VIP',
      objectKind: 'person',
      values: {},
    });

    // Populate catalog and transactions
    const startPopulate = performance.now();
    for (let i = 0; i < 500; i++) {
      db.objects.createRecord({
        label: `Product SKU-${i.toString().padStart(4, '0')} Ultra Edition`,
        objectKind: 'item',
        values: {},
      });

      if (i % 2 === 0) {
        db.transactions.createTransaction({
          movements: [{ accountId: cashAccount.id, amount: 25.5, movementType: 'inflow' }],
          note: `Invoice receipt for SKU-${i}`,
          paidAmount: 25.5,
          personId: customer.id,
          totalAmount: 25.5,
          transactionType: 'sale',
        });
      }
    }
    const populateDuration = performance.now() - startPopulate;
    expect(populateDuration).toBeGreaterThan(0);

    // 1. Benchmark universal search across 500+ items and 250+ transactions
    const { durationMs: searchDurationMs, result: searchResults } = fastestRun(() => db.search.query('SKU-0250'));

    expect(searchResults.length).toBeGreaterThanOrEqual(1);
    expect(searchDurationMs).toBeLessThan(25); // Target: < 25ms

    // 2. Benchmark ledger summary subqueries
    const { durationMs: ledgerDurationMs, result: summary } = fastestRun(() => db.transactions.getLedgerSummary());

    expect(summary.totalSales).toBeGreaterThan(0);
    expect(ledgerDurationMs).toBeLessThan(20); // Target: < 20ms

    // 3. Benchmark person debt statement calculation
    const { durationMs: statementDurationMs, result: statement } = fastestRun(() => db.personDebt.getStatement(customer.id));

    expect(statement.summary.personId).toBe(customer.id);
    // The statement deliberately materializes up to 500 full transaction
    // records and their movements. Keep its release budget below one frame,
    // while allowing normal hosted-runner scheduler variance.
    expect(statementDurationMs).toBeLessThan(40); // Release budget: < 40ms
  });
});

const PRIMARY_RECORD_COUNT = 1_200;
const TARGET_RECORD_COUNT = 600;
const RELATION_EDGE_COUNT = 300;
const MEASURED_RUNS = 3;

type Measurement = Readonly<{
  coefficientOfVariationPercent: number;
  maxMs: number;
  medianMs: number;
  minMs: number;
  runsMs: readonly number[];
}>;

function summarize(runsMs: readonly number[]): Measurement {
  const sorted = [...runsMs].sort((a, b) => a - b);
  const mean = runsMs.reduce((sum, value) => sum + value, 0) / runsMs.length;
  const variance = runsMs.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / runsMs.length;
  return {
    coefficientOfVariationPercent: mean === 0 ? 0 : (Math.sqrt(variance) / mean) * 100,
    maxMs: sorted.at(-1) ?? 0,
    medianMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
    minMs: sorted[0] ?? 0,
    runsMs,
  };
}

function measure<T>(run: () => T): { measurement: Measurement; results: readonly T[] } {
  // Warm the prepared statements and SQLite page cache. The three following
  // samples are the consecutive runs reported by this baseline.
  run();
  const runsMs: number[] = [];
  const results: T[] = [];
  for (let runIndex = 0; runIndex < MEASURED_RUNS; runIndex += 1) {
    const started = performance.now();
    results.push(run());
    runsMs.push(performance.now() - started);
  }
  return { measurement: summarize(runsMs), results };
}

function printMeasurement(name: string, measurement: Measurement): void {
  console.info(`MAX_PERF ${JSON.stringify({
    cvPercent: Number(measurement.coefficientOfVariationPercent.toFixed(2)),
    maxMs: Number(measurement.maxMs.toFixed(3)),
    medianMs: Number(measurement.medianMs.toFixed(3)),
    minMs: Number(measurement.minMs.toFixed(3)),
    name,
    runsMs: measurement.runsMs.map((value) => Number(value.toFixed(3))),
  })}`);
}

function createService(): DatabaseService {
  const database = new DatabaseService(':memory:');
  database.initialize();
  return database;
}

describe('large database performance baseline', () => {
  it('reports three-run measurements for scale-sensitive database operations', () => {
    const db = createService();
    try {
      const work = db.databases.createDatabase({ id: 'perf-work', title: 'Performance work' });
      const targets = db.databases.createDatabase({ id: 'perf-targets', title: 'Performance targets' });
      const status = db.properties.createProperty({
        databaseId: work.id,
        id: 'perf-status',
        name: 'Status',
        options: [
          { id: 'perf-todo', label: 'Todo' },
          { id: 'perf-doing', label: 'Doing' },
          { id: 'perf-done', label: 'Done' },
        ],
        type: 'status',
      });
      const due = db.properties.createProperty({ databaseId: work.id, id: 'perf-due', name: 'Due', type: 'date' });
      const amount = db.properties.createProperty({ databaseId: work.id, id: 'perf-amount', name: 'Amount', type: 'number' });
      const notes = db.properties.createProperty({ databaseId: work.id, id: 'perf-notes', name: 'Notes', type: 'text' });
      const relationProperty = db.properties.createProperty({
        databaseId: work.id,
        id: 'perf-related',
        name: 'Related target',
        type: 'relation',
      });
      const relation = db.relations.createRelation({
        id: 'perf-relation',
        inversePropertyName: 'Work',
        sourceDatabaseId: work.id,
        sourcePropertyId: relationProperty.id,
        targetDatabaseId: targets.id,
      });

      const statusIds = ['perf-todo', 'perf-doing', 'perf-done'] as const;
      const sourceIds: string[] = [];
      for (let index = 0; index < PRIMARY_RECORD_COUNT; index += 1) {
        const suffix = String(index).padStart(4, '0');
        const id = `perf-work-${suffix}`;
        db.records.createRecord({
          databaseId: work.id,
          id,
          properties: {
            [amount.id]: index % 1_000,
            [due.id]: `2026-09-${String((index % 28) + 1).padStart(2, '0')}`,
            [notes.id]: `Deterministic note ${suffix} needle-${suffix}`,
            [status.id]: statusIds[index % statusIds.length],
          },
          title: `Work item ${suffix} needle-${suffix}`,
        });
        sourceIds.push(id);
      }

      const targetIds: string[] = [];
      for (let index = 0; index < TARGET_RECORD_COUNT; index += 1) {
        const suffix = String(index).padStart(4, '0');
        const id = `perf-target-${suffix}`;
        db.records.createRecord({ databaseId: targets.id, id, title: `Target ${suffix}` });
        targetIds.push(id);
      }

      for (let index = 0; index < RELATION_EDGE_COUNT; index += 1) {
        db.relations.connect(relation.id, sourceIds[index]!, targetIds[index % targetIds.length]!);
      }

      const schema = db.databases.getSchema(work.id);
      expect(schema.properties).toHaveLength(6);
      expect(db.databases.getSchema(targets.id).properties).toHaveLength(2);

      const operations: ReadonlyArray<readonly [string, () => unknown]> = [
        ['table query (50 rows)', () => db.databaseQuery.query({ databaseId: work.id, limit: 50 })],
        ['filter amount >= 900', () => db.databaseQuery.query({
          databaseId: work.id,
          filter: { kind: 'property', operator: 'greater_than_or_equal', propertyId: amount.id, value: 900 },
          limit: 50,
        })],
        ['database search needle-0999', () => db.databaseQuery.query({ databaseId: work.id, limit: 50, search: 'needle-0999' })],
        ['board grouping by status', () => db.databaseQuery.query({ databaseId: work.id, group: { propertyId: status.id }, limit: 200 })],
        ['calendar September range', () => db.databaseQuery.query({
          databaseId: work.id,
          filter: {
            kind: 'property',
            operator: 'between_dates',
            propertyId: due.id,
            value: '2026-09-01',
            valueTo: '2026-09-30',
          },
          limit: 200,
        })],
        ['relation picker search', () => db.relations.searchRelationTargets(relation.id, 'Target 0555', 30, sourceIds[0])],
        ['open record', () => db.records.getRecord(sourceIds[777]!)],
      ];

      for (const [name, operation] of operations) {
        const { measurement, results } = measure(operation);
        expect(results).toHaveLength(MEASURED_RUNS);
        printMeasurement(name, measurement);
      }

      const createRuns: number[] = [];
      for (let runIndex = 0; runIndex < MEASURED_RUNS; runIndex += 1) {
        const started = performance.now();
        const created = db.records.createRecord({
          databaseId: work.id,
          id: `perf-created-${runIndex}`,
          properties: {
            [amount.id]: 500 + runIndex,
            [due.id]: '2026-09-18',
            [notes.id]: 'Measured create operation',
            [status.id]: 'perf-doing',
          },
          title: `Measured create ${runIndex}`,
        });
        createRuns.push(performance.now() - started);
        expect(created.databaseId).toBe(work.id);
      }
      printMeasurement('create record', summarize(createRuns));

      const sanityQueries: readonly DatabaseQueryParams[] = [
        { databaseId: work.id, limit: 50 },
        { databaseId: work.id, limit: 50, search: 'needle-0999' },
      ];
      expect(db.databaseQuery.query(sanityQueries[0]!).totalCount).toBe(PRIMARY_RECORD_COUNT + MEASURED_RUNS);
      expect(db.databaseQuery.query(sanityQueries[1]!).records.some((record) => record.id === 'perf-work-0999')).toBe(true);

      console.info(`MAX_PERF_DATASET ${JSON.stringify({
        measuredRuns: MEASURED_RUNS,
        primaryProperties: schema.properties.length,
        primaryRecords: PRIMARY_RECORD_COUNT,
        relationEdges: RELATION_EDGE_COUNT,
        relations: 1,
        targetProperties: db.databases.getSchema(targets.id).properties.length,
        targetRecords: TARGET_RECORD_COUNT,
      })}`);
    } finally {
      db.close();
    }
  }, 120_000);
});
