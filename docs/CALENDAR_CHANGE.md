# Focus 0.1.4 · 工作月历

Scope: add a monthly view inside the existing timeline. Monday-first 7-column grid, month navigation, holiday/weekend/makeup annotations, task rows, daily overflow list, click-date creation. Preserve the approved white hand-drawn design and all existing timeline/task interactions.

Data contract: unchanged schema version 1, unchanged TaskStore/model/Repository/reminder ledger and native userData path. Calendar only projects existing plannedStart/plannedEnd and deadline instants. Unscheduled tasks are never assigned to a day automatically. Date-click defaults only populate an unsaved form. Status changes and edits go through the original store.

Planned checks: pure local-date/DST projection tests, all original tests, calendar CRUD and day overflow browser tests, zero writes across view changes, byte-for-byte disk load plus logical save/reopen compatibility, DMG source and signature integrity. Mac native execution remains unverified in Linux.

Steps:
- [x] Restore 0.1.3 and establish baseline (75/75 after restoring ZIP executable permissions).
- [x] Write failing projection tests and implement pure projection in domain/time.mjs.
- [x] Add the calendar renderer, shared timeline switch and daily list.
- [x] Verify create/edit, status/archiving, large daily lists, viewport behavior and persistence.
- [x] Package 0.1.4 arm64 using the same Electron runtime and app identity, verify final bytes.

Executed: 93 Node checks; 86 browser checks. A direct localhost browser navigation was blocked by environment policy, so all UI checks use set_content and the same production renderer bundle, with a narrow Electron bridge substitute. No macOS native execution.
