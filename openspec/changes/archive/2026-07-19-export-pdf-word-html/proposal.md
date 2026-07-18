## Why

MarkFlow currently lets users save Markdown but does not provide a way to share the document in common presentation and office formats. Exporting the rendered document lets users retain the WYSIWYG result, including diagrams, images, and visual styling, when sending content to readers who do not use MarkFlow.

## What Changes

- Add one Export menu entry in the existing toolbar/menu UI with PDF, Word, and HTML actions.
- Export the currently rendered WYSIWYG HTML as self-contained HTML and Word-compatible HTML files selected through the native save dialog.
- Print that rendered HTML through the browser print flow for PDF creation, with dedicated print styles and no PDF library dependency.
- Provide sensible default filenames and extensions, and surface export write failures while treating a cancelled save dialog as a no-op.

## Capabilities

### New Capabilities

- `rendered-document-export`: Export the active rendered document as HTML, Word-compatible HTML, or a browser-printable PDF.

### Modified Capabilities

- None.

## Impact

- Toolbar/menu components and the rendered editor DOM export path.
- A focused frontend export utility using the existing Tauri save dialog and `storage.writeFile` mechanism.
- Frontend unit tests for export payload generation, path selection cancellation, and write errors.
- No new runtime dependency or main-bundle budget impact: PDF uses browser printing and Word uses a small HTML wrapper.
