# Proposal

## Why

Issue #337 claims that the Mermaid and PlantUML context-menu implementations and their helper files remain substantially duplicated. Current source confirms the two 41-line helper files are identical and the menu modules share the same export, clipboard, and SVG-to-PNG flow, so this is a verified, bounded first step in the issue's stated P1 order. Other claims in the issue are not included without separate verification.

## What Changes

- Consolidate the duplicated Mermaid/PlantUML diagram context-menu behavior into shared implementation while retaining diagram-specific save callbacks and CSS classes.
- Replace the duplicate helper modules with one shared helper implementation.
- Preserve the existing menu labels, behavior, error reporting, SVG/PNG conversion limits, export naming, and clipboard fallback behavior.
- Add or update focused tests to protect both diagram menu variants and shared conversion limits.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is an implementation-only refactor; externally observable behavior must remain unchanged.

## Impact

Affects `src/components/mermaidContextMenu.ts`, `src/components/plantumlContextMenu.ts`, their helper modules, and focused tests. No public API, dependency, or user-visible behavior changes are intended. Set `skip_specs: true` because this change does not alter a behavior requirement.
