# ADR: Core / Runtime / Host Dependency Direction

- Status: Accepted for M0 baseline
- Date: 2026-07-27
- Evidence: `implementation-notes.md`, `reports/validation-results.md`

## Decision

MarkFlow's target layering is UI, Editor Adapter, Core Bridge, `markflow-runtime`, `markflow-core`, Host Adapter, and Platform.

`markflow-core` owns pure Markdown document capability: text buffer, source mapping, parser facade, patch validation, history model, search/indexes, diagnostics, Render IR, and Export IR. It must not depend on Tauri, DOM, CodeMirror, SolidJS, ProseMirror, file I/O, network, clipboard, dialogs, print, windows, or menus.

`markflow-runtime` owns workflow coordination: session registry, task scheduling and cancellation, save and sync orchestration, external modification decisions, asset transactions, and Host capability calls. It must not implement Markdown syntax.

Host Adapter owns platform side effects such as filesystem, dialogs, clipboard, menus, notifications, watchers, printing, HTTP permissions, and shell integration. Tauri is the first Host Adapter, not the application framework that owns Markdown editing behavior.

## Consequences

- M1 may create production Core and Runtime crates, but M0 spike code stays isolated under this change.
- UI stores may keep session, revision, selection, viewport, dirty banners, and panel state, but not authoritative Markdown.
- Product commands continue to work unchanged until later stages explicitly migrate them.

## M1 Constraints

- Any public Core API must expose MarkFlow-owned DTOs rather than third-party parser AST types.
- Any Host operation must be called through Runtime-owned ports.
- Dependency checks should fail if Core imports Tauri, DOM, CodeMirror, SolidJS, or ProseMirror concepts.

