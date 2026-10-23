import { documentTabHooks } from './documents/hooks';
import { setMarkdown, getEditor } from '../editor';
import { store } from '../infra/store';
import { refreshOutline } from './outline';
import { hideDegradationBar } from './degradation-bar';
import { discardActiveImageDraft } from '../infra/images/core';

export function getActiveFilePath(): string | null {
  return store.getState().activeFilePath;
}

export function setActiveFilePath(path: string | null) {
  store.setState({ activeFilePath: path });
  updateActiveTreeSelection(path);
}

export function rewriteActiveDocumentPath(from: string, to: string) {
  if (documentTabHooks.hasOpenDocumentTabs()) { documentTabHooks.rewriteDocumentTabPaths(from, to); return; }
  const currentPath = getActiveFilePath();
  if (!currentPath) return;
  if (currentPath !== from && !currentPath.startsWith(`${from}/`)) return;
  const suffix = currentPath === from ? '' : currentPath.slice(from.length);
  setActiveFilePath(`${to}${suffix}`);
}

export function clearActiveDocumentIfMatches(path: string) {
  if (documentTabHooks.hasOpenDocumentTabs()) return documentTabHooks.closeDocumentTabsMatchingPath(path);
  const currentPath = getActiveFilePath();
  if (!currentPath) return;
  if (currentPath === path || currentPath.startsWith(`${path}/`)) {
    clearActiveDocument();
  }
}

export function clearActiveDocument() {
  void discardActiveImageDraft();
  setMarkdown('');
  setActiveFilePath(null);
  refreshOutline();
  store.setState({ readOnly: false, dirty: false });
  const editor = getEditor();
  if (editor) editor.setEditable(true);
  hideDegradationBar();
}

function updateActiveTreeSelection(path: string | null) {
  document.querySelectorAll('.tree-file').forEach(el => {
    el.classList.toggle('active', (el as HTMLElement).dataset.path === path);
  });
}
