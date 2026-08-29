# Sprint 0 architecture

## Process boundary

```text
React renderer
  -> window.maxApi (typed, capability-specific API)
  -> isolated preload wrapper
  -> validated IPC handler
  -> Electron main/backend service
  -> SQLite
```

The renderer has no Node.js integration and cannot import Electron, Node built-ins,
or main-process modules. The preload exposes one method per
allowed capability instead of exposing raw IPC. Main-process handlers validate
the sender before executing. Integration tests scan source boundaries so common
violations fail CI.

## Source ownership

- `src/renderer`: React and browser-only presentation.
- `src/preload`: narrow context bridge implementation.
- `src/shared`: serializable IPC types and channel identifiers only.
- `src/main/ipc`: capability registration and sender enforcement.
- `src/main/database`: SQLite connections and migrations. Only this directory may
  import the SQLite driver.
- `src/main/platform`: platform detection and later OS adapters. Operating-system
  checks do not leak across features.
- `src/main/protocol`: packaged-app protocol handling.
- `src/main/window`: hardened BrowserWindow construction.

## Database foundation

`DatabaseService` owns the built-in `node:sqlite` connection lifecycle. It enables
foreign keys, a busy timeout, WAL for file databases, transactional numbered
migrations, idempotent startup, and SQLite quick-check health reporting. Sprint 0
creates only migration metadata and application metadata; no shop domain tables
are present.

Future migrations are append-only and contiguous. A capability PR owns its
schema, migration, implementation, integration tests, and functional UI where
appropriate.

## Security defaults

- Context isolation and renderer sandbox are enabled.
- Node integration is disabled.
- All permission requests, popups, and unexpected navigation are denied.
- Packaged content uses the privileged `max://app` protocol with path traversal
  protection.
- Electron fuses disable RunAsNode, Node options, and CLI inspection while
  enabling cookie encryption and ASAR integrity checks.

## Platform and packaging

Electron Forge packages each operating system on its native GitHub Actions
runner. Windows uses Squirrel, macOS uses DMG plus ZIP, and Linux uses DEB.
Flatpak is a separate Linux release job because its builder and Flathub runtime
requirements are heavier than ordinary PR CI. Internal v0.1.0 artifacts are
unsigned; public distribution requires signing/notarization work and credentials.

## Reproducible installation

Package lifecycle scripts are disabled in `.npmrc`. Max uses Electron's built-in
`node:sqlite`, so there is no native database addon, ABI rebuild, or contributor
compiler requirement. `scripts/setup-runtime.cjs` explicitly runs and verifies
only the Electron, esbuild, and Windows-installer setup steps. Application and
packaging scripts call it themselves, and CI exposes it as a separate auditable
step after `npm ci --ignore-scripts`.
