# Max v0.1.0 build blueprint

Status: frozen product and delivery contract  
Release integration branch: `release/v0.1.0`  
Stable branch: `main`  
Release tag: `v0.1.0`

## Product definition

Max is an offline-first configurable shop operating system. It is not a
phone-shop app, POS, inventory app, accounting program, or Notion clone.

Its deliberately small universal primitives are:

- Item
- Person
- Account
- Transaction
- Property
- Template
- View
- Page
- Blueprint

A shop configures these primitives into its own workflow. Concepts such as
Phone, Screen Protector, Case, Vodafone Cash, InstaPay, Customer, Debt, Phone
sale, and Wallet transfer are configuration for the first shop unless they prove
to be universal primitives.

The local SQLite database is authoritative and Max works completely without an
internet connection. v0.1.0 includes optional cloud backup, not cloud sync.
Arabic and English are first-class from the start.

The design target is Notion-like simplicity, extremely fast shop data entry,
meaningful craft and motion, strong recovery from mistakes, visible auditability,
and operational reliability. Every blank page or empty state offers a relevant
creation or import action instead of becoming a dead end.

## Delivery rules

Every sprint starts by restating this product definition and implements only its
assigned slice. Later-sprint features are explicitly deferred rather than
silently included.

Every meaningful change follows:

```text
feature/... -> PR -> review + tests -> release/v0.1.0
```

At release completion:

```text
release/v0.1.0 -> final release PR -> main -> tag v0.1.0
```

Every PR leaves Max working and represents one coherent capability. Agents
prepare and verify PRs but never merge them without the owner's explicit
confirmation.

Every sprint checkpoint reports:

1. Built — what now works.
2. Tested — automated and manual checks performed.
3. Remaining — what was deliberately not implemented.
4. Risks / decisions — anything discovered that affects later work.
5. PR — link/name and exact scope.

## Cross-cutting release requirements

- Speed: startup, input latency, search, indexing, and repeated entry receive
  explicit performance checks on constrained hardware and large fake datasets.
- Reliability: failure-safe writes, migrations, backup/recovery, and cross-OS
  builds are release gates.
- Audit trail: consequential changes preserve who/what/when and use undo,
  correction, forgiveness, or reversal rather than silent deletion.
- Empty states: every blank surface offers an appropriate next action.
- Accessibility: consistent keyboard behavior, focus management, semantics,
  contrast, reduced motion, Arabic/English, RTL/LTR, dark/light.
- Platform isolation: OS-specific implementations live behind adapters.
- Packaging: Windows, macOS, Linux, and Flatpak when the Linux build environment
  supports the required Flatpak toolchain. Flatpak is an explicit release
  artifact target, not an unverified checkbox.

## Sprint 0 — Foundation and engineering rules

Build no shop functionality. Establish Electron + React + TypeScript, local
SQLite owned only by Electron main/backend, narrow typed IPC, isolated platform
code, repository/branch rules, GitHub Actions, and packaging foundations.

PR CI on Ubuntu, Windows, and macOS runs install, lint, typecheck, unit tests,
integration tests, and build. Release workflows build native installers on their
matching operating systems. Internal v0.1.0 artifacts may remain unsigned;
Windows signing and Apple signing/notarization remain distribution risks.

Completion: runnable application, architecture boundaries, CI, branch rules,
packaging foundations. Fresh clone must install, test, and build on all three CI
operating systems. Everything users actually interact with remains deferred.

## Sprint 1 — Max shell and product feel

Build sidebar, actionable empty pages, navigation, global command/search surface,
settings, theme system, Arabic/English and RTL/LTR. Establish shared motion and
interaction primitives: press feedback, naturally originating menus, focused
overlays, subtle ordinary actions, stronger consequential actions, and rare
high-value toasts. Standardize Tab, Enter, Escape, arrows, command search, focus,
and reduced-motion behavior.

Completion: real bilingual Max shell, themes, command surface, keyboard and craft
primitives. Test Arabic/English snapshots and manual flows, keyboard navigation,
dark/light, reduced motion, and accessibility basics. Shop objects and
transactions remain deferred.

## Sprint 2 — Configurable object system

Items and Persons receive configurable data-defined properties. Initial types:
Text, Number, Money, Date, Checkbox, Select, Status, Relation. Validation:
required, unique, digits-only, minimum, maximum, length, allowed choices. IMEI,
Customer ID, Phone, and Company are configurations, never hardcoded fields. Do
not build a scripting language.

Completion: configurable Item/Person schemas, properties, validation, migrations,
and basic CRUD. Test schema changes, optional fields, failures, uniqueness, and
migrations. Templates, transactions, ledger behavior, and views remain deferred.

## Sprint 3 — Blueprints, templates, and onboarding

A Blueprint describes item/person types, properties, validation, accounts,
templates, pages, saved views, icons, and preferences. It never contains customer
or business records.

Onboarding: language, shop name, blank/import Blueprint, basic structure, backup
schedule, then workspace. The workspace visibly assembles as configuration is
created/imported. Templates answer “What am I creating?”, order important fields
first, and progressively disclose uncommon fields. Blueprint import/export ships
in v0.1.0.

Completion: reusable configuration, onboarding, creation templates, actionable
blank states, and Blueprint import/export. Test blank/imported/invalid flows,
export/reimport, and Arabic onboarding. Money engine and fast transaction entry
remain deferred.

## Sprint 4 — Accounts and transaction engine

Accounts represent Cash, wallets, and other value locations. A Transaction
records what happened; money movements record where value moved. Keep them
separate. Internal payment state is PAID, PARTIAL, or UNPAID while UI methods can
remain shop-friendly. Transfers are not revenue. Stock purchase is not
automatically ordinary expense. Reversals preserve history. After the short Undo
window, transactions are effectively immutable and corrections use audited
history/reversal behavior.

Completion: trustworthy audited ledger, accounts, transfers, payment states, and
reversals. Test balances, transfers, reversals, partial/unpaid, concurrency/failure
atomicity, and zero-value edges. High-speed entry remains deferred.

## Sprint 5 — Quick entry

The fixed mental sequence is Product -> Amount -> Method. Max remembers only the
last amount and method for that specific product/template. Prefilled historical
values remain visibly unconfirmed until clicked or keyboard-confirmed; changing a
value confirms it. Tab advances confirmation points and Enter completes only when
required values are confirmed.

Amount precedence is explicit item price -> template default -> last transaction
value -> blank. Person stays hidden unless necessary. Partial captures Total,
Paid now, Method, Person, optional Debt collector, and calculated Remaining.
Later captures Total, Person, and optional Debt collector; it creates no fake
payment account. Ordinary creation receives immediate Undo, not confirmation.

Completion: production-quality keyboard and pointer entry. Test price precedence,
accidental edits, partial/later, rapid consecutive transactions, and a manual
100-transaction endurance run. If it becomes annoying after transaction 20, the
sprint is not complete. Debt management, closing, and sophisticated retrieval
remain deferred.

## Sprint 6 — People, balances, and debt

Person balances derive from transactions, never manually maintained totals.
Partial/unpaid transactions create attributable balances and history. Receiving a
payment updates balance while preserving links to source transactions. Debt owner
defaults to transaction person but is changeable; collector is optional. Debt
forgiveness is explicit and audited.

Completion: people ledger, debt, repayment, balance history, and useful person
empty/search states. Test multiple debts, partial repayments, assigned owner,
forgiveness, and reversal. Saved views, search, daily close, and backup remain.

## Sprint 7 — Views, pages, and search

A saved View stores filters, sort, grouping, visible properties/order, relative
date logic, and presentation. Relative filters remain semantic over time. Pages
contain saved views; pinned views make Home configurable without a separate
dashboard-builder. Local search automatically indexes searchable configurable
properties and updates incrementally where practical, avoiding disruptive full
rebuilds.

Completion: configurable information retrieval and actionable blank pages. Test
large generated datasets, Arabic/English search, added properties, relative dates,
incremental indexing, and constrained-hardware performance. Daily close,
recovery, and cloud backup remain.

## Sprint 8 — Daily opening, closing, and reconciliation

Opening begins from the prior close. Transactions continuously update expected
account balances. Closing compares expected and confirmed actual balances,
calculates discrepancies, and offers filtered investigation. Zero receives a
restrained completion state. Closing history is preserved; later changes never
silently rewrite past days.

Completion: full daily lifecycle and notebook “zero equation” replacement. Test
multi-day operation, post-close reversals, discrepancies, investigation, and
opening propagation. Backup/recovery and final hardening remain.

## Sprint 9 — Local backup and recovery

Onboarding chooses an automatic schedule and “Back up now” is always available.
Smart retention keeps recent daily, monthly-boundary, yearly, and latest
snapshots. Blueprint, Data, or Both are separately recoverable. Data-only restore
checks Blueprint dependencies. Major restore/config replacement first creates a
safety snapshot; restore is undoable where technically possible. Files are
versioned for future migrations.

Completion: trusted local disaster recovery. Test corrupt/old-schema backups,
interrupted recovery, Blueprint-only, data-only, full restore, safety snapshots,
and restore-after-upgrade. Cloud backup remains.

## Sprint 10 — Cloud backup

Cloud backup is opt-in; without it Max needs no account. Enabling it uses Clerk
authentication and the ownership chain Clerk User -> Shop membership -> Shop ID
-> Backup records. Backups belong to shops. SQLite stays authoritative. Max
encrypts backup artifacts locally before upload to Cloudflare R2; cloud storage
sees ciphertext and minimum version-list metadata. Cloud sync is explicitly out
of v0.1.0.

Completion: optional authenticated encrypted cloud recovery. Test offline
schedules, interrupted/resumable upload, login/logout, two shops per account,
cross-machine restore, deletion, retention, and cryptographic failure cases.
Stabilization remains.

## Sprint 11 — Release hardening

Add no features. Run and repair the complete workflows on Linux, Windows, and
macOS: new shop, Blueprint import, 100+ rapid sales, partial/unpaid, debts,
transfers, reversals, seven simulated days, month view, closing, local/cloud
backup, complete machine-loss restore, Arabic/English, dark/light, reduced motion,
and keyboard-only operation.

Performance-test a deliberately large fake shop database for startup, memory,
search latency, input latency, and indexing CPU. Fix bugs only. Require entirely
green CI, open the final `release/v0.1.0` -> `main` PR, obtain owner merge approval,
tag `v0.1.0`, and generate verified native artifacts plus Flatpak where the
toolchain is supported.

## Explicitly outside v0.1.0

- Cloud sync or any online-authoritative mode.
- A property scripting/programming language.
- Hardcoded phone-shop domain entities that can be expressed as configuration.
- Broad-distribution signing/notarization unless separately authorized and
  credentials are supplied.
- Features invented during stabilization.

