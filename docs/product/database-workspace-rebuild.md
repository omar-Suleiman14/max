# Database workspace rebuild

Max remains a local, configurable workspace. Databases are generic collections of pages; shop-specific schemas belong to imported templates.

## Built

- One database renderer for standalone databases, linked blocks, the database directory, and migrated links.
- A compact Notion-style view bar with contextual settings, layout selection, search, filters, sorts, grouping, and templates.
- Table, list, board, calendar, and gallery layouts; saved column visibility, ordering, and widths; board dragging; paginated records.
- Record pages with editable properties and body content, related-page navigation, reciprocal relations, multi-select editing, and side/center/full page presentation.
- Reusable templates created from a page, with editable defaults copied and unique/computed/relation values excluded.
- Related-database property selection for rollups and separate saved views for linked blocks.
- Backend fix for page-body updates that were previously accepted without persisting the content.

## Local browser preview

Run `npm run dev:web`, then open `http://127.0.0.1:5178/`.

The preview uses `.cache/browser-preview.sqlite`, initialized with sample Projects and Tasks. It does not open the desktop application's database. Its loopback-only bridge uses the existing typed preload API and validated backend handlers. Cloud services are disabled in this development preview.

## Verification status

Earlier focused checks covered database integration and table interactions. The owner subsequently requested implementation without further tests or browser checks; the final additions have not been verified. No branch, PR, release, or CI run was requested for this work.

## Remaining

This implements the local database workspace, not Notion's hosted collaboration, publishing, AI, or complete suite of specialized views. Timeline, chart, map, and form layouts are not offered in the rebuilt view picker.
