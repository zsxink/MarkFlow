/**
 * Sorted insertion helpers for the file tree.
 *
 * Extracted from fileTree.core.ts to keep the core module focused on
 * tree state, rendering, and event handling.
 *
 * NOTE: both this module and fileTree.core.ts import from each other
 * (circular). This is safe because all imports are used only inside
 * function bodies, not at module-evaluation time — by the time any
 * function runs both modules are fully loaded.
 */

import { escapePathSelector } from './fileTree.core';

// --- Sorting ---

export function insertSorted(container: HTMLElement, node: HTMLElement, isDir: boolean) {
  const children = Array.from(container.children);
  const newName = (node.querySelector(':scope > span') as HTMLElement)?.textContent || '';
  let inserted = false;
  for (const child of children) {
    if (child === node) continue;
    const childIsDir = child.classList.contains('tree-folder') ||
      child.querySelector(':scope > .tree-folder') !== null;
    if (isDir && !childIsDir) continue;
    if (!isDir && childIsDir) { container.insertBefore(node, child); inserted = true; break; }
    const childName = (child.querySelector(':scope > span, :scope > .tree-folder > span') as HTMLElement)?.textContent || '';
    if (newName.localeCompare(childName) < 0) { container.insertBefore(node, child); inserted = true; break; }
  }
  if (!inserted) container.appendChild(node);
}

export function renameEntryInTree(oldPath: string, newName: string) {
  const el = document.querySelector(`[data-path="${escapePathSelector(oldPath)}"]`) as HTMLElement;
  if (!el) return;

  const span = el.querySelector(':scope > span') as HTMLElement;
  if (span) span.textContent = newName;

  const parentDir = oldPath.substring(0, Math.max(oldPath.lastIndexOf('/'), oldPath.lastIndexOf('\\')));
  const newPath = `${parentDir}/${newName}`;
  el.dataset.path = newPath;

  const container = el.classList.contains('tree-file') ? el.parentElement : el.parentElement?.parentElement;
  if (!container) return;

  const isDir = el.classList.contains('tree-folder');
  const siblings = Array.from(container.children).filter(c => c !== el && c !== el.parentElement);
  let target: Element | null = null;
  for (const sib of siblings) {
    const sibIsDir = sib.classList.contains('tree-folder') || sib.querySelector(':scope > .tree-folder') !== null;
    const sibName = (sib.querySelector(':scope > span, :scope > .tree-folder > span') as HTMLElement)?.textContent || '';
    if (isDir && !sibIsDir) continue;
    if (!isDir && sibIsDir) { target = sib; break; }
    if (sibName.localeCompare(newName) >= 0) { target = sib; break; }
  }

  const node = el.classList.contains('tree-file') ? el : el.parentElement!;
  if (target) {
    container.insertBefore(node, target);
  } else {
    container.appendChild(node);
  }
}
