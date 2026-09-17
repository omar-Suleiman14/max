# Database view layout parity

This file records the shipped behavior of the five database layouts. It is an implementation reference, not the product roadmap.

| Capability | Table | List | Board | Calendar | Gallery |
| --- | --- | --- | --- | --- | --- |
| Search / filters / sorts | Applies; query-level | Applies; query-level | Applies; query-level | Applies; query-level | Applies; query-level |
| Grouping | Applies; host groups rows | Applies; host groups rows | Applies through the configured Select/Status property | Applies; host groups calendars | Applies; host groups galleries |
| Hidden properties / property order | Columns | Summary fields | Card fields | Date configuration remains usable when hidden | Card fields; cover configuration remains usable when hidden |
| Layout-specific configuration | N/A | N/A | Group property | Date property | Cover property |
| Create / default template | New row / shared New | Quick add / shared New | New card / shared New | Day click / empty state / shared New | New page / empty state / shared New |
| Open record | Row | Row and newly created record | Card and newly created record | Record pill and newly created record | Card and newly created record |
| Empty state | New row remains available | Explicit copy + quick add | Explicit copy + add-card affordance | Explicit copy + create-today action | Explicit copy + create-first-page action |

Board explains that a Select or Status property is required when grouping cannot apply. Calendar exposes Created time when no date property is configured. Gallery simply omits the cover selector when the database has no file or URL property that can act as a cover.
