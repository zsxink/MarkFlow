# Design

## Context

See `proposal.md` for motivation and verified scope. Both diagram-menu modules currently implement the same four menu actions and conversion flow, with diagram-specific storage commands and CSS class names. The helper modules contain identical canvas-size validation and menu-positioning code. Existing capability specs cover the observable Mermaid/PlantUML export behavior; this refactor must not change it.

## Goals / Non-Goals

**Goals:**
- Keep Mermaid and PlantUML entry points and their diagram-specific export persistence.
- Keep shared action construction and SVG-to-PNG conversion in one module.
- Keep one shared copy of the menu helper functions and canvas-size limits.
- Preserve fallback/error behavior, MIME types, canvas limits, and URL cleanup.

**Non-Goals:**
- Change UI labels, export filenames, clipboard behavior, or user-visible error messages.
- Change image context menus, export-theme font conversion, Rust code, or other Issue #337 items.
- Introduce new dependencies or alter any behavior specification.

## Decisions

- Add a shared diagram context-menu module parameterized by menu class and SVG/PNG save callbacks. Keep the two public `showMermaidContextMenu` and `showPlantumlContextMenu` functions as thin adapters, so editor callers and diagram-specific storage APIs remain unchanged. This avoids an abstraction over storage itself while eliminating duplicated action and conversion code.
- Move `clampMenuPosition`, `validatePngCanvasSize`, and their constants/types into one shared helper module; update the existing context-menu implementation and diagram conversion code to import it, then remove the duplicate helper file. This is preferable to retaining per-diagram forwarding modules because there are no behavior differences to preserve in those helpers.
- Add focused tests for shared size validation and diagram-menu actions/conversion using the repository's existing Vitest patterns. Keep tests behavior-oriented so the extraction can be changed later without a spec/API contract.
- Keep conversion error handling and URL revocation in `finally`; do not combine conversion with persistence in a way that could skip cleanup on failure.

## Risks / Trade-offs

- [Shared callback wiring could associate an export with the wrong diagram-specific storage command] → Keep separate typed adapters and test each adapter's save callbacks.
- [A utility move could break imports outside the two menu files] → Update all existing imports, including the shared context-menu implementation, and use type checking plus the full test suite.
- [Consolidation could accidentally alter the PlantUML byte conversion behavior] → Use one tested chunked Blob conversion path and verify generated Base64 on multi-chunk input.

## Migration Plan

No persisted data or user migration is involved. Replace duplicate modules in place within the branch, run focused tests, then the full TypeScript build and test suite. Reverting the change restores the prior duplicated implementation without data changes.
