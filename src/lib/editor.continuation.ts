import { getEditor, getMode } from './editor.state';

const CONTINUATION_TARGET_TYPES = ['image', 'blockquote', 'codeBlock'];

/**
 * If the WYSIWYG document ends with a "continuation-target" block
 * (image, blockquote, or codeBlock) that has no following content,
 * append an empty paragraph after it as a writable continuation entry.
 *
 * Returns true if a continuation paragraph was inserted, false otherwise.
 */
export function ensureContinuationParagraph(): boolean {
  const ed = getEditor();
  if (!ed || getMode() !== 'wysiwyg') return false;

  const { doc, schema } = ed.state;
  if (doc.childCount === 0) return false;

  const lastChild = doc.child(doc.childCount - 1);
  if (!lastChild || !CONTINUATION_TARGET_TYPES.includes(lastChild.type.name)) return false;

  // Insert an empty paragraph at the very end of the document
  const paragraph = schema.nodes.paragraph.create();
  const tr = ed.state.tr.insert(doc.content.size, paragraph);
  ed.view.dispatch(tr);
  return true;
}
