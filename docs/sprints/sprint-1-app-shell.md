# Sprint 1 — Max shell and product feel

## What Max is becoming

Max is an offline-first configurable shop operating system built from universal
primitives rather than hardcoded phone-shop concepts. Local SQLite remains
authoritative. Arabic and English, speed, reliability, recovery, auditability,
keyboard access, and purposeful empty states shape the product from the start.

## Assigned slice

Sprint 1 adds only the user-facing shell and shared interaction language:

- Workspace sidebar, page navigation, status, and actionable empty surfaces.
- English/LTR and Arabic/RTL with persisted local interface preference.
- System, light, and dark themes with persisted local interface preference.
- Global command surface with keyboard search and execution.
- Settings overlay, trigger-origin menu, focus management, press feedback,
  consequential-action treatment, reduced motion, and high-value error notice.
- Consistent Tab, Enter, Escape, Home/End, and arrow-key behavior.

## Deliberate non-goals

This sprint does not create Item, Person, Account, Transaction, View, or Page
records. Empty-state create actions explain the missing configurable schema rather
than inventing fields or persisting fake data. Configurable properties and CRUD
remain Sprint 2; Blueprints, templates, and onboarding remain Sprint 3. No ledger,
quick entry, search index, closing, backup, or cloud feature is introduced.

## Interaction decisions

- Language, theme, and sidebar collapse are interface preferences stored locally
  in the renderer. They are not shop data and do not bypass SQLite ownership.
- Theme preference supports system/light/dark; system changes are observed live.
- Direction-aware layout uses logical CSS properties so Arabic is a true mirrored
  layout, not a translated LTR screen.
- Motion is centralized in shared button, menu, overlay, and notice primitives;
  the reduced-motion media query collapses all decorative transitions.
- Ordinary theme and language changes do not show toasts. A persistent alert is
  reserved for local-engine failure because continuing could threaten reliability.

## Acceptance evidence

- English/LTR and Arabic/RTL renderer snapshots.
- Keyboard-only command execution, sidebar traversal, Escape close/focus restore,
  theme persistence, and actionable empty-state tests.
- Automated baseline accessibility scan plus semantic and reduced-motion checks.
- Real Electron smoke captures in English/light and Arabic/dark.
- Production bundle and packaged-executable smoke run before review.
