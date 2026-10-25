# Design

## Context

See `proposal.md` for motivation. The current implementation classifies files before loading, derives the default editor mode from file metadata, and has a separate Markdown qualification path for WYSIWYG. The user-configured size threshold is currently duplicated as a qualification rejection, so bypassing it for manual switching requires separating default-mode selection from content-safety validation. Settings are represented in both TypeScript and Rust and are serialized to `settings.json`.

## Goals / Non-Goals

**Goals:**
- Use only document size and line count to choose the automatic editor mode; preserve Markdown round-trip safety checks without node-count or structure-complexity gates.
- Ask before opening files larger than the configured source-size threshold, and proceed when the user confirms.
- Keep opening decisions based on metadata before full editor activation.
- Keep the prototype and UI spec aligned with the agreed visual interaction.

**Non-Goals:**
- Blocking a document from opening after the user confirms the source-size warning.
- Changing persisted setting names or units.
- Changing the existing document-tab interaction model.

## Decisions

1. **Separate automatic mode from WYSIWYG safety.** File size and line count decide the initial mode. A manual mode switch follows the normal WYSIWYG loading and Markdown round-trip safety path; thresholds and node counts do not reject it. This avoids conflating an automatic performance preference with a content-safety failure.
2. **Keep backend metadata available before opening.** Read bytes and line count before loading content. WYSIWYG size and max-lines select the default mode; source-size overflow prompts for confirmation. Keep the three user settings and TS/Rust round-trip requirement, with source size constrained to be at least the WYSIWYG size.
3. **Scope override to the document session.** Manual mode choice affects the current open tab and does not rewrite global thresholds or automatically change other open tabs. Threshold edits apply to documents opened afterward.
4. **Render the notice in the document content column.** Place the compact notice below the active document tab bar. Its X dismisses only the notice for the current document session; switching mode hides it while preserving the explicit user mode.
5. **Keep semantic safety separate from performance thresholds.** Unsupported content that cannot be safely reconciled remains in source mode with a clear reason. Node count and structural complexity are not WYSIWYG gates. Source-size overflow asks for confirmation; accepting continues the open operation.

## Risks / Trade-offs

- [Manual WYSIWYG can consume substantial memory for a large document] → Keep the normal loading progress and failure feedback path; size/line thresholds choose the default mode, while source-size overflow uses a confirmation the user can accept.
- [Settings may be dropped by a backend read-modify-write path] → Keep TS and Rust settings definitions aligned and verify settings round trips in implementation tests.
- [Dismiss state may be lost when switching tabs] → Store warning dismissal on the per-document session, not as global UI state.

## Migration Plan

The new optional `restoreWorkspace` setting defaults to true in TypeScript and Rust; existing files need no version migration. Removed node/text fields are stripped when settings are saved. Existing threshold values retain their names, units, defaults, and serialization. Legacy nonpositive thresholds recover to defaults, and source bytes recover to at least WYSIWYG bytes. Saves reject an inverted size relationship. Autosave defaults to 30 seconds while saved intervals retain their value. Update the classification/qualification interaction, then validate focused tests and settings round-trip coverage. Rollback can restore the previous automatic rejection while preserving settings values.

The former 100MB `read_file` ceiling is removed so source-size confirmation can actually authorize opening larger documents. Allocation, decoding and I/O failures still report through the normal open-error path.
