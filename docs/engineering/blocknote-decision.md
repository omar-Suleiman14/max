# BlockNote desktop adapter decision

Max uses BlockNote 0.54.2 only as the desktop editing adapter. The installed
packages are `@blocknote/core`, `@blocknote/react`, and `@blocknote/mantine`;
each declares MPL-2.0 in its package metadata. No BlockNote XL package is
installed or permitted by this decision.

The adapter is limited to standard text, headings, lists, checklists, quotes,
and code. MaxDocument remains the versioned persisted contract. Existing
Max-specific blocks stay on the existing desktop renderer until their own
BlockNote extension adapters exist, so their data cannot be converted into an
editor-specific representation.

MPL-2.0 source and notice obligations must be retained for any modified
BlockNote source. The dependency is kept isolated from Max-owned domain,
persistence, sync, mobile, and publishing code. If distribution review finds
the selected package's MPL terms unsuitable for Max's GPL-2.0-only release,
the fallback is a MaxDocument-to-Tiptap adapter; no database migration is
needed because the persisted format is MaxDocument.

The adapter introduces no network dependency, account requirement, or cloud
feature. Its package cost is recorded in `package-lock.json` and must be
measured during production build review before release.
