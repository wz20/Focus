# Focus Electron desktop implementation

User approved the seven UI screens and explicitly requested implementation. The design is authoritative: white, hand-drawn linework, four visible coordinate quadrants; sparse cards / dense aggregation; add/edit/details; todo → ing → done → explicitly archive; one-click planned timeline.

## Delivery constraints
- No accounts, AI APIs, telemetry, company integrations, or remote UI assets.
- Local data only. Atomic persisted JSON, schema validation, backup, undo, restore from archive.
- Electron shell uses context isolation, sandboxing, a restricted preload bridge, custom local protocol, and denied external navigation.
- No bundled font files; use installed Kai/handwriting fonts with readable system fallback.
- Concrete blocker: npm/official Electron download attempts fail in this container (DNS and downloader failure); there is no macOS/hdiutil. Use dependency-free ES modules so all renderer/domain tests run offline. Provide macOS-native builder using curl + verified Electron release checksum + codesign + hdiutil; do not claim a DMG exists unless it is actually built.

## Task 1: Task model and state
- Write and run failing node:test cases for validation, status cycle, explicit archiving, restoring, undo, dates, filtering, overlap intervals, and corrupt data.
- Implement domain/model.mjs and domain/store.mjs; repeat until suite passes.

## Task 2: Local persistence and Electron security
- Write failing storage tests (atomic saves, corrupt file backup recovery, invalid input, serialized writes).
- Implement store repository and main/preload. Native app menu supports JSON backup and import, with explicit replace confirmation and pre-import backup.

## Task 3: UI faithful to approved designs
- Native DOM modules, reusable SVG icons/sketch strokes, shared CSS tokens.
- Home: visible axes, per-quadrant adaptive density, counts, drag to change quadrant, scrollable virtualized drill-down.
- Add/edit modal with title, notes, importance, urgency, state, optional planned window, estimated work.
- Detail drawer, safe explicit status controls, archive/restore, confirm delete.
- Timeline: planned window bars, current marker, actual ing count, view ranges; draggable/resizable time bars, pending unscheduled tasks. Overlapping windows never mean simultaneous actual labor.
- Keyboard shortcuts, reduced motion, empty/error/loading states and persistence feedback.

## Task 4: Verification and packaging
- Browser end-to-end tests through installed Chromium using Playwright (no Browser plugin available), 1440x1000 / 1280x800 / 900x700 / mobile fallback.
- Inspect screenshots against approved screenshots, including dense lists and timeline.
- Build no-dependency offline preview and source archive; add one-double-click macOS builder with pinned verified Electron runtime.
- Attempt final DMG only if runtime and build tools become available; record exact result rather than substitute another format.
