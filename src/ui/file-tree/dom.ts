// ── File tree DOM helpers ─────────────────────────────────────────────
// Pure string/DOM utilities shared by the renderer, the ARIA layer and the
// inline-rename editor. They must stay free of tree state.

import { normalizeTreePath } from './state';

/** Escape a path for use inside an attribute selector. */
export function escapePathSelector(path: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(path);
  }
  return path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Escape untrusted text before it is interpolated into markup. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Locate the element that holds the children of `parentPath`.
 *
 * The root check compares normalized tree keys: the workspace root and the tree
 * node keys must agree even when a persisted path still carries an upper-case
 * Windows drive letter (issue #375). A mismatch here returns null and makes the
 * renderer drop the whole directory silently.
 */
export function findChildrenContainer(parentPath: string, workspacePath: string | null): HTMLElement | null {
  if (!workspacePath) return null;
  if (normalizeTreePath(parentPath) === normalizeTreePath(workspacePath)) return document.getElementById('file-tree');
  const folderEl = document.querySelector(
    `.tree-folder[data-path="${escapePathSelector(parentPath)}"]`,
  );
  if (!folderEl) return null;
  return folderEl.parentElement?.querySelector(':scope > .tree-children') as HTMLElement | null;
}

/** Indentation depth of a children container. */
export function getDepth(container: HTMLElement): number {
  let depth = 0;
  let el: HTMLElement | null = container;
  while (el) {
    if (el.classList.contains('tree-children')) depth++;
    el = el.parentElement;
  }
  return depth;
}

/** Insert `node` among `container`'s children keeping folders-first + name order. */
export function insertSorted(container: HTMLElement, node: HTMLElement, isDir: boolean): void {
  const children = Array.from(container.children);
  const newName = (node.querySelector(':scope > span') as HTMLElement)?.textContent || '';
  let inserted = false;
  for (const child of children) {
    if (child === node) continue;
    const childIsDir = child.classList.contains('tree-folder')
      || child.querySelector(':scope > .tree-folder') !== null;
    if (isDir && !childIsDir) continue;
    if (!isDir && childIsDir) {
      container.insertBefore(node, child);
      inserted = true;
      break;
    }
    const childName = (child.querySelector(':scope > span, :scope > .tree-folder > span') as HTMLElement)?.textContent || '';
    if (newName.localeCompare(childName) < 0) {
      container.insertBefore(node, child);
      inserted = true;
      break;
    }
  }
  if (!inserted) container.appendChild(node);
}
