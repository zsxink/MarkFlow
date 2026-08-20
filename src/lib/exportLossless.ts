// Lossless export — render the lossless Core logical text for export.
//
// P3 default-on: documents open on the single lossless CodeMirror EditorView and
// the ProseMirror surface (`#wysiwyg-editor`) stays hidden/empty. The legacy
// export path (`toolbar.exportCurrentDocument`) reads `getEditor()?.view.dom`
// (ProseMirror) which is empty in the lossless path — exporting that would
// produce an empty document. This module renders the lossless logical text
// through markdown-it into an exportable `.ProseMirror` container, so the whole
// existing export pipeline (HTML / PDF / DOCX / print, theme + image handling)
// keeps working unchanged.

import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

const md = new MarkdownIt({
  html: false,
  breaks: false,
  linkify: false,
  typographer: false,
});

/** Render lossless logical text into a `.ProseMirror` export container.
 *  Returns null when the text is empty (callers show the existing "no content"
 *  toast). The container carries `data-theme` so the export theme CSS applies.
 *  The container is detached (never appended to the live DOM). */
export function buildLosslessExportRoot(
  logicalText: string,
  themeAttr: string | null,
): HTMLElement | null {
  if (!logicalText.trim()) return null;
  const purify = DOMPurify(window);
  const rendered = purify.sanitize(md.render(logicalText));

  const root = document.createElement('div');
  root.className = 'ProseMirror';
  root.setAttribute('data-theme', themeAttr ?? 'light');
  root.innerHTML = rendered;
  return root;
}