# Large database performance baseline

Date: 2026-09-18

Issue: #41

This baseline measures the scale-sensitive database and database-view paths without changing production behavior. The measurement tests generate the dataset deterministically in memory, warm read paths once, then record three consecutive runs.

## Environment

- Windows NT 10.0.26200.0
- Intel Core i7-14700HX
- 23.7 GB RAM
- Node.js 22.23.2
- npm 12.0.2

## Dataset

Backend measurements use:

- 1,200 primary records
- 600 relation-target records
- 6 primary properties: title, status, date, number, text, relation
- 2 target properties: title and inverse relation
- 1 relation
- 300 relation edges

Renderer measurements use 200 deterministic records and 6 properties. Table renders 50 records to match the normal page size; Board and Calendar render all 200 records. Renderer timings use React `renderToStaticMarkup`, so they measure component render cost only and do not include browser layout, paint, effects, or user interaction.

## Measurements

Coefficient of variation (CV) reports run-to-run variance. Read operations receive one warm-up run before the three reported samples.

| Operation | Dataset | Runs (ms) | Median (ms) | CV | Budget proposal |
| --- | --- | ---: | ---: | ---: | --- |
| Table query, 50 rows | backend dataset | 1.285, 16.676, 1.577 | 1.577 | 110.36% | observation only; scheduler outlier makes an absolute budget unsafe |
| Filter `amount >= 900` | backend dataset | 2.330, 2.199, 2.106 | 2.199 | 4.16% | candidate local regression budget: 6 ms |
| Database search `needle-0999` | backend dataset | 23.882, 22.646, 23.716 | 23.716 | 2.34% | candidate local regression budget: 50 ms |
| Board grouping by status | backend dataset | 3.142, 3.003, 3.089 | 3.089 | 1.86% | observation only; repeated invocations did not keep variance stable |
| Calendar September range | backend dataset | 5.198, 3.836, 3.789 | 3.836 | 15.28% | observation only; variance is too high for a budget |
| Relation picker search | backend dataset | 0.713, 0.689, 0.666 | 0.689 | 2.78% | candidate local regression budget: 2 ms |
| Open record | backend dataset | 0.206, 0.199, 0.198 | 0.199 | 1.85% | candidate local regression budget: 1 ms |
| Create record | backend dataset | 2.278, 2.025, 1.917 | 2.025 | 7.31% | candidate local regression budget: 6 ms |
| Table render, 50 records | renderer dataset | 65.639, 66.179, 65.660 | 65.660 | 0.38% | candidate local regression budget: 150 ms |
| Board render, 200 records | renderer dataset | 34.351, 19.746, 15.854 | 19.746 | 34.15% | observation only; variance is too high for a budget |
| Calendar render, 200 records | renderer dataset | 5.514, 3.529, 3.217 | 3.529 | 24.90% | observation only; variance is too high for a budget |

## Budget decision

The candidate budgets above are intentionally loose, roughly twice the observed maximum rounded to a readable threshold. They are useful as local regression references for measurements that remained stable across validation runs. They are not enforced as absolute CI timing assertions because CPU scheduling and runner hardware differ substantially across machines.

The suite was invoked repeatedly during validation. Table query, backend Board/Calendar, and renderer Board/Calendar crossed the 10% CV threshold in at least one invocation, so they remain observations even when one individual invocation looked stable. This is exactly the scheduler sensitivity an absolute CI timing assertion would hide.

No operation showed a clear slow-path bottleneck in this dataset. Ignoring the scheduler outlier, the largest backend maximum was 23.882 ms for database search, and the largest renderer maximum was 66.179 ms for the Table SSR proxy. No optimization or follow-up performance issue is justified by these measurements alone.

## Reproduction

Run the backend baseline with:

```sh
npx vitest run --config vitest.integration.config.ts src/main/database/performance.integration.test.ts
```

Run the renderer baseline with:

```sh
npx vitest run --config vitest.unit.config.ts src/renderer/databases/database-views.performance.unit.test.tsx
```

The tests emit `MAX_PERF`, `MAX_PERF_DATASET`, and `MAX_PERF_RENDER` JSON lines so later runs can be compared directly.
