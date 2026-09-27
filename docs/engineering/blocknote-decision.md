# BlockNote as the desktop page editor

Status: implemented for review in #42. Astra reviewed the package licence path
for #171; final distribution and release checks remain required.

## What changed since the prototype

The earlier prototype dropped inline styles, links and nested content, turned
quotes and code blocks into text, and had no custom blocks. It was a no-go. The
editor that replaces it is built around a lossless adapter instead:

- `src/shared/max-inline.ts` parses and serialises Max's inline format (bold,
  italic, underline, strike, highlight, code, web links and `max-page:` links)
  into runs. It is editor-neutral and lives in `shared`.
- `src/renderer/editor/blocknote-adapter.ts` maps every MaxBlock kind to a
  BlockNote block and back. On the way back it merges each block into the
  original MaxBlock by id, so fields BlockNote does not own survive an edit.
  A block of an unknown kind or a future version becomes an `unsupported`
  block that carries the original JSON and is written back unchanged.
- `src/renderer/editor/max-blocknote-schema.tsx` adds Max's own blocks:
  callout, two columns (nested editors), database view, page link, embed,
  bookmark, table of contents, unsupported, a page mention inline and a
  highlight style.
- `src/renderer/editor/max-block-editor.tsx` is the one editor component used
  by pages, the record drawer and record templates. It carries Max's Backspace
  rules, the slash menu additions, `@` page mentions, file uploads through the
  existing asset IPC, Arabic and English dictionaries and RTL.

`src/main/architecture.integration.test.ts` fails if anything outside
`src/renderer/editor` imports `@blocknote/*`. MaxDocument stays the persisted
format; BlockNote types never reach storage, IPC, publishing or sync.

## Evidence for #171

Round trips: `blocknote-adapter.unit.test.ts` converts a fixture of every
block kind (including nested toggles, columns, tables, colours, alignment,
page links and extension fields) to BlockNote and back and compares it with
the original. Unknown kinds, future versions and type conversions are covered.

Custom blocks: callout, columns, database, page link, embed, bookmark, table
of contents and the page mention are all Max extensions running in production
code, not a demonstration.

Bundle: in the production build BlockNote, ProseMirror and Mantine land in one
lazily loaded shared chunk of 1,007 KB (303 KB gzip). It loads when a page or a
record opens, not at startup; the startup `index` chunk does not contain the
editor.

Dependencies and licences:

| Package | Licence |
| --- | --- |
| @blocknote/core, @blocknote/react, @blocknote/mantine 0.54.2 | MPL-2.0 |
| @tiptap/*, prosemirror-* | MIT |
| @mantine/core | MIT |

No BlockNote XL package is installed. Columns are Max's own block for that
reason.

## Licence decision and distribution requirements

MPL-2.0 is file-level copyleft. Its section 3.3 lists GPL-2.0 as a Secondary
Licence, which allows a larger work under GPL-2.0 unless a file is marked
"Incompatible With Secondary Licenses"; none of the inspected 0.54.2 package
files carry that notice. Astra's source review found this route compatible in
principle with Max's GPL-2.0-only declaration, without changing Max's licence.
This is not final distribution clearance. Packaged builds must include the
MPL-2.0 text, BlockNote notice, GPL-2.0 text and a notice directing recipients
to the corresponding source. The release process must verify that source,
including Max's build scripts and any BlockNote modifications, is available.
Tiptap (MIT) remains the fallback if a later review finds a blocker; the
adapter boundary means only `src/renderer/editor` would change.
