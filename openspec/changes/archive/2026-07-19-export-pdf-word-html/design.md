## Context

MarkFlow already saves text through Tauri's native `save()` path picker and `storage.writeFile`. The editor's WYSIWYG surface is the source of truth for what users see, including rendered diagrams and inline images. Export must reuse the same safe, native path-selection/write pattern without changing the active document's path or dirty state.

## Goals / Non-Goals

**Goals:**

- Offer HTML, Word, and PDF export from a compact existing toolbar/menu entry.
- Build HTML and Word output from the live rendered editor DOM, including computed styles needed for standalone presentation.
- Reuse the existing dialog and storage primitives, including serial guarding and user-visible error handling.
- Keep the main bundle within its existing budget and add no runtime export dependency.

**Non-Goals:**

- Converting Markdown source directly, editing document state, or creating a native Rust PDF generator.
- Producing OOXML `.docx`, providing print-dialog automation, or guaranteeing an external printer's PDF destination.
- Altering save, autosave, or renderer behavior outside the export action.

## Decisions

### Centralize rendered-document export in a frontend utility

A focused export module will gather the WYSIWYG root's rendered HTML and generate format-specific documents. Toolbar code will only present/select the format and call that module. This makes filename normalization, save cancellation, write failures, and HTML construction independently testable. Embedding this logic in the toolbar was rejected because it would entangle DOM serialization with UI lifecycle code.

### Reuse native `save()` plus `storage.writeFile`

HTML and Word actions will use the same path picker and write primitive as `saveActiveDocument`, each with its own in-progress guard. Cancelling returns without a write or toast; failed writes surface the existing error-toast style. Export writes do not update document metadata. A bespoke file API was rejected because it would duplicate Tauri permission and error behavior.

### Generate standalone HTML and Word-compatible HTML

The serializer will wrap rendered markup in a full HTML document, apply a small export stylesheet, and inline image/diagram data already represented in the current DOM where needed. Word uses the same body inside a Microsoft Office HTML envelope with `xmlns:o`, `xmlns:w`, `xmlns`, UTF-8 meta tags, and the `application/msword` MIME declaration, saved as `.doc`. This zero-dependency format is broadly supported by Word. `.docx` generation was rejected because it requires a zipped OOXML generator and would add complexity and bundle cost.

### Use an isolated browser-print document for PDF

PDF export creates a temporary hidden iframe (or window when required) containing the standalone rendered document and print stylesheet, waits for it to load, and invokes `print()`. The user then chooses “Save as PDF” in the system/browser print UI. This retains the browser's rendering fidelity and introduces no PDF package. jsPDF/pdf-lib were rejected because they increase bundle weight and would require separately recreating layout, images, and diagrams.

### Preserve bundle budget

All export serialization and print code uses browser APIs and existing Tauri packages. No new runtime dependency is added; production build continues to enforce the current 500 KB gzip JavaScript budget.

## Risks / Trade-offs

- [Computed or external styling may not fully transfer to standalone output] → include a scoped export stylesheet and serialize rendered DOM rather than Markdown source.
- [Some Word versions interpret HTML/CSS differently] → use the well-supported `.doc` HTML envelope and conservative CSS.
- [The browser controls PDF output and cancellation] → clearly use the native print flow; a print-dialog cancellation is an expected no-op outside application control.
- [Concurrent export clicks could open duplicate dialogs] → apply a module-level in-progress guard matching the existing save style.
- [Blob or remote image URLs may not work after saving] → convert exportable image sources to data URLs when they are available in the document.

## Migration Plan

This is an additive UI feature with no persisted schema or data migration. Rolling back removes the toolbar entry and export module; no user document content has been modified.

## Open Questions

- None; the issue fixes PDF to browser printing and Word to a dependency-free HTML wrapper.
