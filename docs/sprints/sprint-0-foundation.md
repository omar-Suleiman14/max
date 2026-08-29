# Sprint 0 — Foundation and engineering rules

## What Max is becoming

Max is an offline-first configurable shop operating system built from the small
universal primitives Item, Person, Account, Transaction, Property, Template,
View, Page, and Blueprint. A shop configures those primitives into its own
workflow. The local SQLite database is authoritative; cloud capability must never
make the product require an internet connection. Arabic and English, speed,
reliability, recovery, and auditability are first-class requirements.

## Assigned slice

Sprint 0 establishes only the safe foundation:

- Electron + React + TypeScript application bootstrap.
- SQLite connection and migration ownership in Electron main/backend only.
- Narrow typed preload/IPC contract with sender validation.
- Renderer sandboxing and packaged-content security controls.
- Isolated platform detection and packaging configuration.
- Pull-request CI on Ubuntu, Windows, and macOS.
- Native Windows, macOS, Linux, and separate Flatpak release jobs.
- Branch, review, scope, and sprint-report rules.

## Deliberate non-goals

This sprint does not implement the Max product shell, bilingual layout, themes,
shop objects, configurable properties, Blueprints, transactions, accounts,
quick entry, debt, search, closing, backup, cloud services, or release features.
The renderer surface is a foundation health screen, not a shop workflow.

## Acceptance evidence

Before review, all of these must be true:

- `npm run install:clean` succeeds from the committed lockfile on Node 22.
- `npm run lint` succeeds with zero warnings.
- `npm run typecheck` succeeds.
- `npm run test:unit` and `npm run test:integration` succeed.
- `npm run test:smoke` observes the renderer's database-backed ready state.
- `npm run build` produces the native application bundle.
- The PR CI matrix is green on Ubuntu, Windows, and macOS.
- The release workflow configuration exposes host-native artifacts and Flatpak.
- The feature PR targets `release/v0.1.0` and remains unmerged until owner
  confirmation.

## Recorded foundation decisions

- Max uses Electron's built-in `node:sqlite` instead of a native addon. This
  removes ABI rebuilds and contributor compiler requirements across four package
  targets. The API is release-candidate status, so Electron and Node stay pinned,
  migration/integrity integration tests remain release gates, and the decision is
  reviewed again during Sprint 11 hardening.
- Package lifecycle scripts are disabled by default. The repository explicitly
  runs only the Electron, esbuild, and Windows-installer setup scripts it trusts.
- The packaged dependency graph currently passes `npm audit --omit=dev` with no
  advisories. npm reports advisories in Electron Forge's development-only
  packaging graph and proposes a major downgrade rather than a safe upgrade;
  those tools are excluded from the shipped application, remain lockfile-pinned,
  and must be re-audited during dependency maintenance and Sprint 11.
- Flatpak is built in its own Linux release job because it requires Flatpak,
  flatpak-builder, elfutils, and a Flathub runtime rather than the ordinary PR
  build environment.
