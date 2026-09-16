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

The workspace was reverified capability by capability in September 2026, under issue #28. Every check below was run either as an integration test against a real database or as a screenshot pass through the browser preview in both Arabic and English.

| Capability | Verdict |
| --- | --- |
| Table layout | Working |
| List layout | Working |
| Board layout, grouped by a select property | Working |
| Calendar layout | Working after two fixes; the localisation of its own chrome is still outstanding |
| Gallery layout | Partly working: cards open records, but every card shows the same placeholder icon |
| Search, filters, sorts | Working |
| Grouping, with a count per group | Working |
| Record templates | Working |
| Relations and reciprocal relations | Working |
| Rollups | Working after a fix |
| Formulas | Working |
| Linked databases | Working |
| Pagination, including the total under an active filter | Working |
| Record creation and editing | Working |
| Archive and restore, for records, pages and databases | Working |

Three defects were found and fixed in the same pass.

- A rollup counted records that had been archived. Archiving a record does not archive its relation edges, and the rollup only checked the edge, so an archived line kept adding to the total.
- The calendar placed no record on any day, ever. It compared the date property against a string, but a stored date arrives as an object, so every record was filtered out whatever the dates said.
- The stylesheet read six custom properties it never defined. A custom property with no value makes the browser drop the whole declaration silently, which left calendar record pills as white text on a white cell, the today badge unreadable, and eight database rules with no text colour. `tests/styles-tokens.unit.test.ts` now fails if another one is introduced.

Larger findings became their own issues rather than being fixed here: the gallery ignoring `coverPropertyId`, and the calendar's month names, weekday names and controls being English only.

## Remaining

This implements the local database workspace, not Notion's hosted collaboration, publishing, AI, or complete suite of specialized views. Timeline, chart, map, and form layouts are not offered in the rebuilt view picker.
