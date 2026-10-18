# Focus 0.1.2 · optional deadline and reminders

User-approved scope: add optional deadline entry and popup reminders to the existing application; preserve design, task data path and existing behaviours. No redesign, cloud or automatic background-agent installation.

## Contract
- deadline is an independent nullable ISO instant, never changed by moving a planned timeline bar.
- per-task start/deadline lead times are nullable minutes. Legacy tasks have reminders disabled; new-task form suggests 10 / 30 minutes, and unset associated time means no reminder.
- In-app non-modal reminder popup with open/dismiss; main-process macOS Notification while app is in background. Completed/archived/deleted and rescheduled events are withdrawn.
- Main-process clock checks every 5 seconds and on resume, not dependent on a renderer. Fully quit app / sleeping Mac cannot deliver on time; after return catch up starts within 15 min and deadlines within 24h, once.
- Durable sent ledger + pending inbox, separate from tasks.json. Date edits cancel obsolete reminders. Permissions/OS Focus mode can suppress native notification; in-app pending popup remains.
- Test reminder entry; compatible JSON export/import; unchanged Focus data directory and app ID.

## Execution / verification
1. [x] Domain and migration: failing tests for null/deadline-only/past/invalid/independent timing, configuration and due/cancel/dedup rules, then implementation.
2. [x] Main-process integration: durable queue, IPC whitelist, click-open/resume/shutdown, permission failure, background delivery; deterministic fake clock and temp-file tests.
3. [x] UI: minimal optional controls, detail and card deadline labels, timeline marker, popup; browser regression including blank deadline, save/reload and stale reminder cancellation.
4. [x] Repackage existing arm64 Electron application, sign ad-hoc, regenerate UDIF image, independent archive and byte-integrity verification. macOS native delivery remains unverified in Linux.

Intentional platform boundary: no promise of notifications after Cmd+Q or during sleep. HTML preview only delivers an in-page popup while the page remains open; it is not a background notification service.
