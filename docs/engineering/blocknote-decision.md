# BlockNote evaluation: production migration is not approved

The current prototype is not safe to use for persisted pages. Its adapter drops
inline styles, links and nested content, and changes quote/code blocks to text.
Custom blocks have no adapter. CustomPageView therefore uses the existing
desktop editor while the prototype is kept outside the production import path.
This is a no-go for the current implementation, not a completed migration.

The installed prototype packages are @blocknote/core, @blocknote/react and
@blocknote/mantine 0.54.2, each declaring MPL-2.0 in package metadata. No XL
package is installed. These declarations alone do not establish distribution
compatibility with Max's GPL-2.0-only licence. That decision remains open in
#171; this document does not approve a licence change or distribution.

Before enabling the adapter, #171 requires an exact dependency/notice review,
representative round-trip fixtures, a demonstrated Max custom block extension,
and measured bundle/runtime impact. Then #42 requires every supported block,
editing interaction, unknown-block preservation, RTL, accessibility and narrow
layout checks. The previous document incorrectly treated package-lock size as
a bundle measurement and did not establish these acceptance criteria.

Tiptap remains the fallback candidate if BlockNote fails that evaluation.
Neither editor may become Max's persisted format. Shared contracts, persistence,
mobile, publishing and sync remain independent of BlockNote types.
