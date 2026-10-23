# Design

## Context

See `proposal.md` for motivation and the delta specs for observable menu and shortcut behavior. `src/utils/keyboard.ts` owns current keyboard commands; document, editor, file-tree, export, dialog, and settings behavior already lives in frontend modules. `src-tauri/src/lib.rs` builds the Tauri application and owns window/application lifecycle. Menu enablement must reflect current workspace/document state rather than duplicating that state in Rust.

## Goals / Non-Goals

**Goals:**
- Keep platform-specific menu construction and system-native items in Rust while routing application commands to existing frontend behavior.
- Keep action identifiers stable and menu state updates explicit and testable.
- Maintain the specified Chinese labels, ordering, disabled placeholders, and platform differences.

**Non-Goals:**
- Implement placeholder capabilities such as quick switch, search/replace, zoom, or shortcut help.
- Reimplement file, editor, export, or settings business logic in Rust.

## Decisions

- **Build menus with Tauri v2 menu APIs in the application setup path.** This keeps native menu ownership with the desktop shell and allows platform-specific predefined items. Alternatives: a frontend-rendered menu would not be an operating-system menu; relying on defaults leaves platforms inconsistent.
- **Use an explicit action-id mapping over `menu:action` events.** Rust handles native menu events and emits a small stable action identifier; a frontend dispatcher maps each supported identifier to existing command implementations. This avoids duplicating domain logic and permits focused dispatcher tests. Native predefined edit/window/application items remain system-managed.
- **Keep menu structure declarative and distinguish app actions from disabled placeholders.** Construct nested submenus and disabled items in the requested order, using a platform conditional only for the documented app-menu differences.
- **Report frontend state to Rust for enablement.** The frontend sends workspace/document/recent-file availability when it changes; Rust updates corresponding menu item enabled states. This avoids Rust independently inferring frontend document state.
- **Avoid duplicate accelerator handling.** Match Tauri accelerators to current keyboard bindings and remove/adjust frontend key handlers only where native accelerators take ownership; preserve shortcuts not represented by native accelerators and modal protections.

## Risks / Trade-offs

- [Tauri menu APIs or accelerators differ by OS] → Verify against the pinned Tauri v2 API and run Rust checks; keep platform-specific construction narrowly scoped.
- [Capability available only in some builds] → An item whose backing API is compiled out of release builds (the webview inspector behind `debug_assertions`) is declared as debug-only so release builds show it disabled, never enabled-but-inert.
- [Native accelerators and DOM key handlers both observe a key] → Test each shared accelerator and ensure it dispatches once, including modal and input-control contexts.
- [Menu state becomes stale after frontend state transitions] → Centralize state notifications and send updates on workspace, active-document, and recent-file changes; default unsafe actions to disabled until state is known.
- [System predefined item labels differ by platform] → Supply explicit Chinese labels where the API permits and validate each platform-specific menu definition.
- [macOS Quit bypasses the unsaved-document confirmation] → The macOS 退出 item is the system-standard `PredefinedMenuItem::quit` required by the spec, so it terminates the app directly; this matches the behaviour before the menu bar existed (default Tauri menu also quits on Cmd+Q) and autosave bounds the exposure. Confirming quit on macOS needs an `ExitRequested` interception and is tracked as follow-up work, not silently changed here.

## Migration Plan

No data migration is required. Replace the current default menu during application setup, register the event bridge and frontend dispatcher, and validate behavior on supported platforms. Rollback consists of reverting menu construction and dispatcher changes; persisted user data is unaffected.
