# Max

Max is a local-first workspace and operations application. You build the
workspace you need out of pages, databases and workflows, and it keeps working
with no internet connection, no account and no subscription.

A shop is one workspace somebody can build with Max. It is not what Max is.

Current version: 1.0.3.

## What is in it

**Pages.** A block editor with headings, lists, quotes, callouts, toggles, code,
dividers, images and embedded databases. Pages nest, and every page can carry a
cover and an icon.

**Databases.** Generic collections of pages with typed properties: text, number,
select, status, checkbox, date, relation, rollup, formula, url, email, phone,
file, person, created and edited stamps, auto identifiers and buttons. Records
are pages, so anything in a database opens as a page with a body.

**Views.** Table, list, board, calendar and gallery, each with its own saved
filters, sorts, grouping, visible columns, column order and widths. A view can
live on the database's own page or as a block inside any other page.

**Relations, formulas and rollups.** A relation writes both sides of the link at
once, a formula recomputes when the values it reads change, and a rollup
aggregates across a relation.

**Workflows and quick actions.** Small automations over the workspace, with
forms that collapse the fields you rarely fill in.

**Blueprints.** A whole workspace — its databases, properties, views, pages and
workflows — exported to a file and imported somewhere else. The blueprint format
is described in
[the blueprint authoring contract](docs/product/blueprint-authoring-contract.md).

**Search and the graph.** Workspace-wide search on Ctrl+K, and a graph view of
how pages connect.

**Operations.** Accounts, people, transactions and reconciliation, for
workspaces that track money.

Arabic and English, right to left and left to right, dark and light, and
keyboard access are built in rather than bolted on.

## Backups

**Local backup works.** Max writes a full snapshot of the workspace to a file
you choose, on a schedule or on demand, and restores from one.

**Max Cloud backup is being fixed.** It is present in the application but it is
not yet trustworthy end to end, and the work to make it so is tracked in the
issue tracker. Do not rely on it as your only copy.

The local SQLite database is authoritative either way. A network failure never
blocks a local operation.

## Architecture

Only the Electron main process opens SQLite. The renderer reaches the backend
through one narrow, typed, validated preload and IPC contract, never through raw
Electron or Node APIs. An integration test enforces that boundary so a violation
fails the build rather than shipping.

[docs/engineering/architecture.md](docs/engineering/architecture.md) describes
the process boundary and who owns what.

## Development

Max pins Node.js 22.23.2 in `.nvmrc`. Dependency lifecycle scripts are disabled
by default, and Max explicitly prepares only the trusted Electron, esbuild and
Windows-installer runtimes it needs.

```text
npm install
npm run setup:runtime
npm start
```

For an exact lockfile install, use `npm run install:clean`.

`npm run dev:web` serves the renderer at `http://127.0.0.1:5178/` against a
disposable SQLite file, which is useful for looking at the interface quickly. It
never opens the desktop application's data.

## Testing

```text
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
```

`npm test` runs both suites. CI runs the same checks on Ubuntu, Windows and
macOS.

## Packaging

```text
npm run build
npm run make
```

`npm run make` builds the native installer for the current host: Squirrel on
Windows, a dmg on macOS, deb on Linux, and Flatpak behind
`npm run make:flatpak`.

## Contributing

The roadmap is GitHub Issues, Milestones and the project board, not a file in
this repository. [AGENTS.md](AGENTS.md) is the engineering contract: the
architectural invariants, the branch workflow and who is allowed to merge and
release.

## Licence

Max is free software released under the GNU General Public License, version 2 —
the same licence the Linux kernel uses. See [LICENSE](LICENSE) for the full
text. Every runtime dependency is MIT or ISC licensed, which GPLv2 permits.
