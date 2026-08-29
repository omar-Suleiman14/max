# Max engineering contract

Read `docs/product/max-v0.1.0-blueprint.md` before changing product behavior.

## Scope discipline

- Begin every sprint and PR by restating what Max is supposed to become, then
  implement only the assigned slice.
- Never silently implement a later sprint. Record deliberately deferred work in
  `Remaining`.
- Every PR must leave Max runnable, tested, and internally coherent. A small PR
  is one bounded capability with its schema, implementation, migration, tests,
  and functional UI when that capability requires UI—not an arbitrary fragment.
- Do not merge your own PR. Prepare it, verify it, explain it, and wait for the
  owner's explicit merge confirmation.
- Use `main` only for released/stable code, `release/v0.1.0` as the release
  integration branch, and `feature/...` for individual work.

## Required sprint report

Every sprint checkpoint must report exactly these sections:

- Built: what now works.
- Tested: automated and manual checks performed.
- Remaining: what is deliberately not implemented yet.
- Risks / decisions: discoveries and decisions affecting later work.
- PR: link/name and exact scope.

## Architectural invariants

- Electron main/backend is the only layer allowed to open or query SQLite.
- Renderer code reaches backend capabilities only through a narrow, typed,
  validated preload/IPC contract. Never expose raw Electron or IPC APIs.
- Keep platform-specific behavior in explicit platform adapters or packaging
  configuration rather than scattering operating-system checks.
- The local database remains authoritative; cloud capability must never make Max
  require an internet connection.
- Arabic and English, RTL and LTR, dark and light themes, keyboard access,
  recovery, performance, reliability, and auditability are design inputs rather
  than retrofit tasks.
- Blank pages and empty states must offer the appropriate creation or import
  action; do not strand the user on a dead screen.
- Preserve history for consequential changes. Prefer undo, reversal, or an
  explicit audited operation to destructive mutation.

## Quality gates

Before requesting review, run install, lint, typecheck, unit tests, integration
tests, and a production build. Match additional checks to the sprint acceptance
criteria. Keep CI green on Ubuntu, Windows, and macOS.

