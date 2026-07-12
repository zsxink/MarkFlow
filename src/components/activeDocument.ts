import { setMarkdown } from '../lib/editor';
import { store } from '../lib/store';
import { refreshOutline } from './outline';

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
  setMarkdown('');
  setActiveFilePath(null);
  refreshOutline();
}

function updateActiveTreeSelection(path: string | null) {
  document.querySelectorAll('.tree-file').forEach(el => {
    el.classList.toggle('active', (el as HTMLElement).dataset.path === path);
  });
}
