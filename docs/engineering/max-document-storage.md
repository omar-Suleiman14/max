# MaxDocument storage and preservation

Page JSON stores `{ document: { version: 1, blocks: [...] }, ...metadata }`.
Each block owns a stable Max `id`, a `type`, and block-specific `data`. Optional
block `version` defaults to 1 when omitted by early writers. A future block
version is preserved and shown as an unsupported block rather than edited as a
known version. Document versions this build cannot read remain read-only.

Legacy arrays and `{ blocks, ...metadata }` are read by the shared adapter and
written in the envelope on an explicit edit. Opening a page performs no write.
Every legacy field other than id/type stays in data, including attachment URLs,
inline Markdown, page IDs, table cells, toggle children and the separate column
arrays. Empty blocks and unequal column lengths are significant and preserved.
Links continue to use Max page IDs, including `max-page:` inline destinations.

Page metadata and document extensions survive unrelated edits. Canonical block
extension fields survive the desktop adapter through an internal symbol, which
is carried by object spreads but never serialized as editor data. Downstream
consumers use the shared contract and never import BlockNote.

Malformed or future-version documents keep their original source on writes to
title/icon/order. A prior prototype flattened columns into one child array and
erased their boundary; these documents are kept read-only rather than guessing
a split. The source remains intact for an explicit recovery operation.

Round-trip fixtures cover the current block kinds, unequal/empty columns,
nested toggles, unknown block extensions, and malformed/future documents.
This preservation work does not establish completion of the BlockNote migration.
