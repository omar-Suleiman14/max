# Overlays

Every overlay in Max registers with one stack, `src/renderer/ui/overlay-stack.ts`,
and follows the same rules.

## Rules

- **Focus.** Opening an overlay moves focus into it, to `[data-autofocus]` or the
  first control. Closing it returns focus to where it was, or to the control
  that opened it. A select list is the exception: focus stays on its trigger,
  which drives the list with the arrow keys.
- **Escape** closes the topmost overlay only, one layer per press. A control
  that is itself holding a draft (a field being edited, a select with its list
  open) answers Escape first by letting go of the draft. Escape never saves a
  pending draft and never undoes what an overlay already saved.
- **Pressing outside** an anchored overlay (popover, picker, select list, menu)
  closes it and only it. A press on the control that opened it is not "outside":
  that control toggles the overlay itself. Modal overlays (dialogs, the record
  drawer) close from their backdrop rather than from any press outside their
  panel, so floating menus opened from inside them stay usable.
- **Tab** stays inside a modal overlay. Anchored overlays are not modal.
- **Arrow keys** move through every list-like overlay: select lists, the
  command and search popups, the relation picker, the option list and the icon
  grid, where Left and Right follow reading direction.
- **Placement.** Anchored overlays are placed by `anchor-popover.ts`. The inline
  start follows the document direction, so in Arabic an overlay's right edge
  meets its trigger's right edge.

## Audit

| Overlay | Primitive | Notes |
| --- | --- | --- |
| Settings dialog, settings page dialogs, relation picker, blueprint dialog, template picker, command menu, search popup | `FocusedOverlay` (modal layer) | Escape now comes from the stack, so a picker opened inside closes first |
| Property editor, filter builder, sort builder | `DatabasePopover` (anchored layer) | The hand-kept list of exempt class names is gone; nested select lists are layers |
| Select list | `Select` (anchored layer while open) | Its own Escape runs first; a press outside goes through the stack |
| Option list | `OptionValue` popup (anchored layer) | Escape leaves the colour editor first, then closes |
| Icon picker | Anchored layer | Was on `window` keydown and `mousedown`. Now takes focus, returns it to its trigger and has grid arrow keys |
| Cover picker | Anchored layer | Now takes focus on open and returns it |
| Record drawer | Modal layer | Its hand-written Escape chain is gone: the icon picker and property editor inside it are layers and close first |

Tests: `src/renderer/ui/overlays.unit.test.tsx` checks focus, Escape, pressing
outside, Tab, RTL placement, nesting order and axe for each primitive.
