# Max engineering contract

Max is a local-first workspace and operations application. It supports pages,
databases, properties, relations, formulas, rollups, database views, workflows,
quick actions, templates, blueprints, graph navigation, search, local backup and
business operations.

Max is not a phone-shop application. A shop is one workspace somebody can build
with Max. Do not describe Max as a shop operating system in generic product UI
or in current product documentation. Shop-specific language belongs inside an
imported shop blueprint, where it genuinely means something.

Max must remain useful with no internet connection, no account, no Max Cloud
subscription and no external integration.

## The roadmap is GitHub, not a file in this repository

The mutable roadmap is **GitHub Issues, Milestones, issue dependencies and the
`Max 2.0` Project**. Read them before starting work.

Do not treat any static document as the current product plan. In particular,
`docs/product/max-v0.1.0-blueprint.md` and everything under `docs/sprints/` are
historical records of how Max was built, not statements about what Max is now or
what it should become.

If an implementation issue has become obsolete because another merged change
already solved it, **do not write duplicate code**. Report it for Astra review.

## Model authority policy

Max uses three model roles. Every agent must know which one it is.

**If an agent cannot determine which model it is, it must assume
implementation-only permissions. It may not merge and it may not release.**

The owner wants to conserve Astra usage. Do not use Astra for ordinary
implementation, and do not use Astra for a repository audit or roadmap work
unless Opus cannot complete it.

### Opus 5 — primary planning and implementation

Use Opus for repository-wide audits, roadmap creation, architecture, schema
work, migrations, sync architecture, cloud architecture, mobile architecture,
complex UI, editor work, workflow engine work, hard bugs, integrations,
publishing, self-hosting, store packaging where several systems interact,
security-sensitive implementation and multi-file refactors.

Opus **may**: inspect the repository; create issues, milestones and Project
configuration; create feature branches; modify code; add tests; run
implementation tests; run lint and typecheck during development; commit; push
feature branches; open and update pull requests; respond to review feedback; and
move implementation issues to Review.

Opus **may not**: merge a pull request; merge a feature branch into `main`; mark
final verification as passed; close a release parent issue; create a stable
release tag; publish a stable GitHub Release; publish to an application store;
publish to Flathub; change the software licence without owner approval; execute
an irreversible production migration; or perform the final production release.

**When Opus finishes an implementation issue, it stops at Review.**

### GPT-5.6 Terra — smaller, clear, low-risk implementation

Good Terra work: isolated UI components, straightforward styling fixes, copy
changes, documentation, simple tests, accessibility fixes with clear
requirements, simple validation, small settings changes, small database-view
changes, mechanical refactors, isolated bug fixes, and release metadata updates
that do not publish anything.

Terra **may**: inspect relevant code; edit code; add tests; run implementation
tests; run lint or typecheck relevant to its change; commit; push a feature
branch; open and update a pull request; and move the implementation issue to
Review.

Terra **may not**: merge; perform final release checks; close release parent
issues; tag stable releases; publish releases; deploy production; submit to
stores; or make architecture decisions outside its issue.

If Terra finds that an issue requires a new architecture, a migration strategy,
a sync rule, a security model or a broad refactor, it **stops and escalates the
issue to Opus**. Do not quietly expand the issue.

### GPT-6 Astra — final verification, merge, milestone and release authority

Use Astra only after implementation work reaches Review, or when the owner
explicitly asks for Astra on a difficult decision.

Only Astra may: perform final acceptance review; run or verify the complete
required check set; approve an implementation issue as Done; merge pull
requests; merge feature branches; close release parent issues; approve a
milestone as complete; create stable release tags; publish stable GitHub
Releases; execute production release workflows; perform production release
migrations; submit official production store releases; submit an official
Flathub release; and make final cross-milestone architecture decisions when
implementation work conflicts.

**Astra still requires explicit owner approval for release actions.** Being
Astra does not grant automatic permission to publish anything.

Astra should return incomplete work to Opus or Terra rather than fixing large
implementation problems itself. Use Astra's expensive context for review and
release decisions, not routine coding.

## Branch workflow

Use feature branches. Do not group unrelated issues into one branch.

Before implementation:

1. Read the issue.
2. Inspect the relevant current code.
3. Check the issue's dependencies.
4. Move the issue to **In progress**.

When implementation is complete:

1. Run implementation-level tests.
2. Run relevant lint and typecheck.
3. Summarise the changes.
4. List the tests that were run.
5. List any incomplete acceptance criteria.
6. Commit.
7. Push.
8. Open or update the pull request.
9. Link the issue.
10. Move the issue to **Review**.
11. Stop.

**Do not merge. Do not move the issue to Done.**

## Astra review workflow

When an issue enters Review, Astra inspects, in order: the issue; its acceptance
criteria; the full diff; the relevant code around the diff; migration impact;
data compatibility; security impact where relevant; test results; CI results;
unresolved review comments; and milestone boundaries.

If the work fails, Astra returns it to Opus or Terra. If it passes and owner
policy allows merge, Astra may merge and then move the implementation issue to
Done.

**Only Astra closes release parent issues.**

## Milestone implementation workflow

When the owner says `implement v1.4`, read it as `implement milestone v1.4.0`.

The coordinator should: fetch the milestone; read the release parent issue; list
open sub-issues; inspect dependencies; choose an order; use Opus or Terra
according to issue complexity; implement only the selected milestone; keep Max
runnable throughout; send completed work to Review; use Astra for final
verification and merge; and **not begin a later milestone without owner
instruction**.

## Stable release permissions

Only Astra may merge, perform final full checks, close a release parent, approve
milestone completion, create a stable tag, publish a stable GitHub Release, run
a production release workflow, perform a release migration, submit an official
store build, submit a Flathub release, or perform a final production deployment.

**Even Astra requires explicit owner approval for**: stable release publication;
production database migration; store submission; public Flathub submission;
licence change; and any irreversible production action.

Publishing a release is not finished when the tag and the GitHub Release exist.
The **Update feed** workflow must be dispatched afterwards for the release to
actually reach people.

## Architectural invariants

These survive from the original contract because they are still true and still
load-bearing.

- The Electron main process is the only layer allowed to open or query SQLite.
- Renderer code reaches backend capabilities only through a narrow, typed,
  validated preload and IPC contract. Never expose raw Electron or IPC APIs.
  `src/main/architecture.integration.test.ts` enforces this; keep it enforcing.
- Keep platform-specific behaviour in explicit platform adapters or packaging
  configuration rather than scattering operating-system checks through the code.
- The local database remains authoritative. Cloud capability must never make Max
  require an internet connection, and a network failure must never block a local
  operation.
- Arabic and English, RTL and LTR, dark and light themes, keyboard access,
  recovery, performance, reliability and auditability are design inputs, not
  retrofit tasks.
- Blank pages and empty states must offer the appropriate creation or import
  action. Do not strand somebody on a dead screen.
- Preserve history for consequential changes. Prefer undo, reversal or an
  explicit audited operation to destructive mutation.
- Visible product copy and internal persisted schema names are separate
  decisions. Do not rename a persisted database key, a Blueprint compatibility
  field, an IPC contract field or a migration compatibility field merely for
  cleaner naming. Change the copy; leave the schema unless a migration is
  genuinely worthwhile, and then do it as its own issue.

## Product and pricing rules

The software is yours. The convenience is what we sell.

Free or self-hosted alternatives must exist wherever practical: local backup,
GitHub backup, GitHub Pages publishing, static export, self-hosted backup,
self-hosted sync, self-hosted publishing, and the open-source mobile
application. Managed Max Cloud may charge for managed backup, managed sync,
managed publishing, managed storage, and hosting and monitoring.

**Never gate local Max, local backup, self-hosting, GitHub backup, GitHub Pages
publishing or the mobile application behind an entitlement.**

**Do not hardcode a price, a product identifier, a limit or an entitlement into
any client.** Server configuration controls all of them.

## Quality gates

Before requesting review, run install, lint, typecheck, unit tests, integration
tests and a production build. Match additional checks to the issue's own
Verification section. Keep CI green on Ubuntu, Windows and macOS.

Every pull request must leave Max runnable, tested and internally coherent. A
small pull request is one bounded capability with its schema, implementation,
migration, tests and functional UI where that capability requires UI — not an
arbitrary fragment.
