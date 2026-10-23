// ── Caret placement after a whole-document load ───────────────────────
// `setContent` replaces `0..doc.content.size` in one transaction. ProseMirror
// maps the previous selection through that replacement with the default
// association, so a caret sitting at the start of the old (e.g. empty) document
// lands at the END of the new one. On top of that, EditorView only writes the
// browser selection while it is focused — when a file is opened from the tree
// the old DOM Range survives, so the caret is painted at the previous
// document's position and with its font metrics (a short caret glued next to a
// heading instead of inside it).

import type { Editor } from '@tiptap/core';
import { Selection } from '@tiptap/pm/state';

/**
 * Re-establish the caret after a whole-document load.
 *
 * `start` is the document-load semantic (first editable position, or the
 * nearest one for a node-start document). `preserve` keeps an in-place
 * re-render close to where the user was (frontmatter patches, image-path
 * rewrites) instead of teleporting to the top.
 */
export function placeCaretAfterContentLoad(
  editor: Editor,
  mode: 'start' | 'preserve' = 'start',
  previousPos = 1,
): void {
  // Harness/mock editors used by the markdown-bridge tests carry only commands.
  const view = editor?.view;
  if (!view?.state?.doc) return;
  const { doc } = view.state;
  const focused = typeof view.hasFocus === 'function' ? view.hasFocus() : false;
  const selection = mode === 'start'
    ? Selection.atStart(doc)
    : Selection.near(doc.resolve(Math.max(0, Math.min(previousPos, doc.content.size))));
  if (selection.eq(view.state.selection)) {
    // Same range, but the DOM may still hold a stale Range from the replaced
    // document — force the write-back when the view owns focus.
    if (focused) view.focus();
    return;
  }
  // Selection-only transactions never emit `update`, and must not enter undo.
  view.dispatch(
    view.state.tr.setSelection(selection)
      .setMeta('addToHistory', false)
      .setMeta('preventUpdate', true),
  );
  // PM skips `selectionToDOM` while unfocused; refocusing makes the browser
  // caret agree with the state we just set.
  if (focused) view.focus();
}
