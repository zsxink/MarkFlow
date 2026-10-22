# Proposal

## Why

Returning to a WYSIWYG document tab can leave the visible caret at a different location from the document selection and status bar. This makes typing land somewhere other than where the user sees the caret, undermining the document-session restoration introduced by multi-tab editing.

## What Changes

- Keep the restored WYSIWYG selection, visible caret, status-bar position, and insertion point synchronized after switching tabs.
- Avoid duplicate full-document outline and frontmatter refresh work during a tab switch.
- Add a regression test that exercises switching between documents with distinct selections.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `document-tabs`: Require the visible WYSIWYG caret to match the restored document selection after a tab switch.
- `document-tabs`: Require each tab switch to project the active document once, avoiding redundant full-document scans/parsing.

## Impact

- Affected editor context restoration, document projection, and document-tab session tests.
- No public API or dependency changes.
