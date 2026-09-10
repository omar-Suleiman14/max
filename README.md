# Max

Max is an offline-first, configurable shop operating system.

The local SQLite database is authoritative. Max is designed for complete offline
operation, bilingual Arabic and English use, fast shop-floor entry, reliable
recovery, and an explicit audit trail.

Development is governed by the [v0.1.0 build blueprint](docs/product/max-v0.1.0-blueprint.md).
The current release is built through bounded feature branches into
`release/v0.1.0`; no feature PR is self-merged.

## Status

Sprint 0 is integrated. The Sprint 1 bilingual application shell is prepared for review;
shop objects and transactions have deliberately not been implemented yet.

## Foundation commands

Max pins Node.js 22.23.2 in `.nvmrc`. Dependency lifecycle scripts are disabled
by default, and Max explicitly prepares only the trusted
Electron/esbuild/Windows-installer runtimes it needs.

```text
npm install
npm run setup:runtime
npm test
npm run build
```

For an exact lockfile install, use `npm run install:clean`. Run the development
application with `npm start`; create the native installer for the current host
with `npm run make`.

## License

Max is free software released under the GNU General Public License, version 2 —
the same licence the Linux kernel uses. See [LICENSE](LICENSE) for the full
text. Every runtime dependency is MIT or ISC licensed, which GPLv2 permits.
