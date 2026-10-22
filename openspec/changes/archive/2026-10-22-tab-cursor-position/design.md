# Design

## Context

The tab coordinator reuses one ProseMirror EditorView and snapshots its EditorState when suspending a document. On activation it updates that view with the stored state. The document selection is therefore preserved in state, but browser DOM selection/focus synchronization may lag while the same view is reused across tabs.

## Goals / Non-Goals

**Goals:**
- Restore DOM focus to the document editing surface that owned focus before a tab switch, after the target editing mode becomes visible.
- Keep the WYSIWYG browser selection aligned with the restored ProseMirror selection, while preserving source-mode selections and both modes' scroll positions.

**Non-Goals:**
- Creating separate editor views per tab.
- Changing selection semantics, status-bar formatting, or keyboard navigation.

## Decisions

- Reproduce the switch using two documents with deliberately different selections and inspect both the restored ProseMirror selection and the editor DOM selection.
- Determine focus ownership from `document.activeElement` containment in the WYSIWYG or CodeMirror editing surface. ProseMirror and CodeMirror expose different `hasFocus` semantics, and CodeMirror also checks whether the whole window is foreground.
- Transfer focus to the target editor only when an editing surface owned DOM focus before the switch; leave keyboard focus on tab controls untouched. Apply focus after the target mode is visible so its browser selection synchronizes with the preserved state.
- Avoid replacing the stored EditorState or rebuilding plugin state, which would risk losing history and document-local plugin state.
- Publish one editor-update event when projecting a restored tab and let the existing subscribers refresh outline, frontmatter, and status. Remove any parallel direct refreshes so large documents are not parsed or traversed twice per switch.

## Risks / Trade-offs

- [Focusing the restored editor may steal focus from tab controls] → Restore focus only when an editing surface owned the active DOM element before the switch; validate mouse, keyboard, and background-window activation.
- [DOM selection can be stale in jsdom] → Add a real WebView E2E regression for visual/DOM selection in addition to unit-level state assertions.
- [Projection changes could leave one panel stale] → Verify outline, frontmatter, and status refresh together from the single editor-update event.
