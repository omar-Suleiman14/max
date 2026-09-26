# Search ranking and popup keys

## Ranking rule

Workspace search (Ctrl+K) orders results the same way in the main process and
in the popup:

1. **Match tier**, on the normalised title:
   1. the title is exactly the query;
   2. the title starts with the query;
   3. the title contains the query;
   4. only the body, a property value or another indexed field matches.
2. **Kind**, within a tier: page, database, view, then record.
3. **Title**, alphabetically in the reader's language.

Normalisation folds Arabic letter forms (أ إ آ to ا, ة to ه, ى to ي and so on),
strips diacritics and turns Arabic-Indic digits into Latin ones, so "فاتوره 123"
finds "فاتورة ١٢٣" and ranks it as an exact match.

`WorkspaceSearchService` orders by tier in SQL.
`src/renderer/search/result-ranking.ts` applies the full rule after results from
the generic and older search services are merged. The command menu uses the
same tiers on command labels, with a keyword-only match last.

Every result shows a kind label (Page, Database, View, Record, Action), so a
page and a record with the same name can be told apart.

Tests: `result-ranking.unit.test.ts`, `workspace-search.integration.test.ts`
("ranks by the same tiers across records, pages and databases").

## Popup keys

The search popup and the command menu answer the same keys, through
`src/renderer/ui/listbox-keys.ts` and `FocusedOverlay`:

| Key | Effect |
| --- | --- |
| Typing | Narrows the list |
| Up, Down | Move through the list, wrapping at both ends |
| Enter | Chooses the highlighted row |
| Escape | Closes and returns focus to where it was |
| Tab | Stays inside the popup |

Keys pressed while an input method is composing are left to the composition.
Both popups announce the number of results through a polite live region.

Tests: `popup-keyboard-parity.unit.test.tsx` runs the same key sequence against
both popups.
