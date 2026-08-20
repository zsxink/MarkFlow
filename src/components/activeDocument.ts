import { setMarkdown, getEditor } from '../lib/editor';
import { store } from '../lib/store';
import { refreshOutline } from './outline';
import { hideDegradationBar } from './degradationBar';
import { discardActiveImageDraft } from '../lib/imageUtils';
import { getActiveLosslessBinding } from '../lib/lossless/registry';
import { isLosslessCoreSessionEnabled } from '../lib/lossless/flag';

export function getActiveFilePath(): string | null {
  return store.getState().activeFilePath;
}

export function setActiveFilePath(path: string | null) {
  store.setState({ activeFilePath: path });
  updateActiveTreeSelection(path);
}

export function rewriteActiveDocumentPath(from: string, to: string) {
  const currentPath = getActiveFilePath();
  if (!currentPath) return;
  if (currentPath !== from && !currentPath.startsWith(`${from}/`)) return;
  const suffix = currentPath === from ? '' : currentPath.slice(from.length);
  setActiveFilePath(`${to}${suffix}`);
}

export function clearActiveDocumentIfMatches(path: string) {
  const currentPath = getActiveFilePath();
  if (!currentPath) return;
  if (currentPath === path || currentPath.startsWith(`${path}/`)) {
    clearActiveDocument();
  }
}

export function clearActiveDocument() {
  void discardActiveImageDraft();
  // ── P3 independent-reviewer F2: on a lossless doc, clearing must NOT touch
  // the hidden ProseMirror. Dispose the active lossless binding (flush/close)
  // instead of calling setMarkdown('') on the empty legacy PM surface (owner
  // isolation, design P1B §5). The binding is disposed here so resources do not
  // linger after a workspace-switch/external-deletion on a lossless document.
  if (isLosslessCoreSessionEnabled() && getActiveLosslessBinding()) {
    void import('../lib/lossless/integration').then(({ closeLosslessActiveDocument }) =>
      closeLosslessActiveDocument(),
    );
  } else {
    setMarkdown('');
  }
  setActiveFilePath(null);
  refreshOutline();
  store.setState({ readOnly: false });
  const editor = getEditor();
  // P0S: setEditable(true) must not fire a document update (no doc change).
  if (editor) editor.setEditable(true, /* emitUpdate */ false);
  hideDegradationBar();
}

function updateActiveTreeSelection(path: string | null) {
  document.querySelectorAll('.tree-file').forEach(el => {
    el.classList.toggle('active', (el as HTMLElement).dataset.path === path);
  });
}
