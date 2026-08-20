// Lossless image editing surface wiring — task 5.3.
//
// In the lossless path the document is a single CodeMirror EditorView. Advanced
// image widgets belong to P4B; P3 provides a SAFE, EDITABLE exact-source
// fallback: double-clicking an image in Live Preview (or an image markdown
// literal in Source) opens a small edit panel to change the src/alt or delete
// the whole literal. Every change is a local CodeMirror transaction that
// targets only the image's source range (never a full-text rewrite, never the
// hidden ProseMirror owner). The resource migration itself continues to run at
// save time via `preparePendingImagesForSave` → `applyImagePatches`.

import type { EditorView } from '@codemirror/view';
import { showModal } from '../../components/ui/modal';
import { showToast } from '../../components/toast';
import { logException } from '../logger';
import { findImageAt, type ImageSourceRange } from './imageSourceRange';
import { replaceImageSource, deleteImageSource } from './commandRouter';
import { getActiveLosslessBinding } from './registry';

/** Bind image-edit UX to a lossless CodeMirror EditorView. */
export function bindLosslessImageEditing(view: EditorView): () => void {
  const onDblClick = (event: MouseEvent) => {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return;
    const doc = view.state.doc.toString();
    const range = findImageAt(doc, pos);
    if (!range) return;
    // Capture the exact source range AT THE CLICK. Re-resolving from the
    // selection head on confirm is unsafe: CM's native dblclick selects a word
    // whose head can sit outside the matched literal (reviewer F3).
    showImageEditPanel(view, range);
  };

  view.contentDOM.addEventListener('dblclick', onDblClick);
  return () => view.contentDOM.removeEventListener('dblclick', onDblClick);
}

function showImageEditPanel(
  view: EditorView,
  range: ImageSourceRange,
): void {
  const currentSrc = range.src.text;
  const currentAlt = range.alt.text;
  const modal = showModal({
    className: 'lossless-image-edit',
    content: `
      <div class="modal-header">
        <span>编辑图片</span>
        <button class="modal-close" id="lossless-image-close">✕</button>
      </div>
      <div style="padding:16px 24px;">
        <label class="image-edit-label" style="display:block;margin-bottom:4px;font-size:13px;">URL / 路径</label>
        <input class="image-edit-input" id="lossless-image-src" style="width:100%;box-sizing:border-box;" value="${escapeAttr(currentSrc)}" />
        <label class="image-edit-label" style="display:block;margin:12px 0 4px;font-size:13px;">注释 (alt)</label>
        <input class="image-edit-input" id="lossless-image-alt" style="width:100%;box-sizing:border-box;" value="${escapeAttr(currentAlt)}" />
        <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding-top:16px;">
          <button class="btn-secondary" id="lossless-image-delete">删除</button>
          <button class="btn-secondary" id="lossless-image-cancel">取消</button>
          <button class="btn-primary" id="lossless-image-confirm">保存</button>
        </div>
      </div>
    `,
  });

  const close = () => modal.hide();

  document.getElementById('lossless-image-close')!.addEventListener('click', () => { close(); view.focus(); });
  document.getElementById('lossless-image-cancel')!.addEventListener('click', () => { close(); view.focus(); });

  document.getElementById('lossless-image-confirm')!.addEventListener('click', () => {
    const srcInput = document.getElementById('lossless-image-src') as HTMLInputElement | null;
    const altInput = document.getElementById('lossless-image-alt') as HTMLInputElement | null;
    const newSrc = srcInput?.value.trim() ?? '';
    const newAlt = altInput?.value ?? '';
    if (!newSrc) {
      showToast('图片路径不能为空');
      return;
    }
    try {
      // Replace the src in-place. If the user changed the alt too, apply it as
      // a second local change in the SAME transaction (both are exact ranges
      // captured at the dblclick — reviewer F3: never re-resolve from the
      // possibly-shifted selection head).
      const srcRange = range;
      const changes = [
        { from: srcRange.src.from, to: srcRange.src.to, insert: newSrc },
      ];
      if (newAlt !== srcRange.alt.text) {
        changes.push({ from: srcRange.alt.from, to: srcRange.alt.to, insert: newAlt });
      }
      changes.sort((a, b) => b.from - a.from);
      view.dispatch({
        changes,
        selection: { anchor: srcRange.src.from + newSrc.length },
        scrollIntoView: true,
        userEvent: 'command',
      });
      view.focus();
      close();
      showToast('图片已更新');
    } catch (e) {
      logException('lossless.image.edit', 'Failed to update image', e);
      showToast('图片更新失败');
    }
  });

  document.getElementById('lossless-image-delete')!.addEventListener('click', () => {
    try {
      // Delete the EXACT range captured at the dblclick (reviewer F3).
      view.dispatch({
        changes: { from: range.start, to: range.end, insert: '' },
        selection: { anchor: range.start },
        scrollIntoView: true,
        userEvent: 'command',
      });
      view.focus();
      close();
      showToast('图片已删除');
    } catch (e) {
      logException('lossless.image.delete', 'Failed to delete image', e);
      showToast('图片删除失败');
    }
  });
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Expose pure helpers for E2E/unit tests: resolves the image literal at a
 * position; used by tests to assert the exact source range is targeted.
 */
export function imageAt(view: { state: { doc: { toString(): string } } }, pos: number) {
  return findImageAt(view.state.doc.toString(), pos);
}

// E2E-only hook: real image edit on the active lossless view.
if (import.meta.env.MODE === 'e2e') {
  (window as unknown as { __replaceLosslessImage?: (src: string) => boolean }).__replaceLosslessImage =
    (src: string) => {
      const binding = getActiveLosslessBinding();
      if (!binding) return false;
      return replaceImageSource(binding.editor.view, src);
    };
  (window as unknown as { __deleteLosslessImage?: () => boolean }).__deleteLosslessImage =
    () => {
      const binding = getActiveLosslessBinding();
      if (!binding) return false;
      return deleteImageSource(binding.editor.view);
    };
}