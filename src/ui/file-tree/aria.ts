// ── File tree ARIA / keyboard layer ───────────────────────────────────
// WAI-ARIA tree semantics: roving tabindex, aria-selected tracking and the
// arrow/Enter keyboard model. Kept apart from rendering so the renderer stays
// free of focus concerns.

import { getActiveFilePath } from '../active-document';
import { escapePathSelector } from './dom';

const TREE_ITEM_SELECTOR = '.tree-folder, .tree-file';

/** Initialize WAI-ARIA attributes on the tree root container. */
export function initTreeAria(container: HTMLElement) {
  if (!container.hasAttribute('role')) {
    container.setAttribute('role', 'tree');
    container.setAttribute('aria-label', '文件树');
    container.setAttribute('tabindex', '0');
  }
  if (!container.dataset.ariaInitialized) {
    container.dataset.ariaInitialized = '1';
    container.addEventListener('keydown', handleTreeKeydown);
  }
}

/** Get all visible treeitem nodes (folders and files) in DOM order, excluding hidden ones. */
function getVisibleTreeItems(): HTMLElement[] {
  const container = document.getElementById('file-tree');
  if (!container) return [];
  const all = container.querySelectorAll<HTMLElement>(TREE_ITEM_SELECTOR);
  const visible: HTMLElement[] = [];
  for (const el of all) {
    if (el.offsetParent !== null) visible.push(el);
  }
  return visible;
}

/** Move roving tabindex + focus to a target treeitem. */
function focusTreeItem(target: HTMLElement) {
  const container = document.getElementById('file-tree');
  if (!container) return;
  container.querySelectorAll<HTMLElement>(TREE_ITEM_SELECTOR).forEach(el => {
    el.setAttribute('tabindex', '-1');
  });
  target.setAttribute('tabindex', '0');
  target.focus();
}

/** Set aria-selected on the currently active file node. */
export function updateSelectedAria() {
  const container = document.getElementById('file-tree');
  if (!container) return;
  container.querySelectorAll<HTMLElement>('[aria-selected="true"]').forEach(el => {
    el.removeAttribute('aria-selected');
  });
  const activePath = getActiveFilePath();
  if (!activePath) return;
  const activeEl = container.querySelector(
    `.tree-file[data-path="${escapePathSelector(activePath)}"]`,
  ) as HTMLElement | null;
  if (activeEl) activeEl.setAttribute('aria-selected', 'true');
}

function expandFolder(target: HTMLElement) {
  const chevron = target.querySelector('.tree-chevron');
  if (chevron && !chevron.classList.contains('expanded')) {
    target.click();
    return;
  }
  const childrenEl = target.parentElement?.querySelector(':scope > .tree-children') as HTMLElement | null;
  const firstChild = childrenEl?.querySelector<HTMLElement>(TREE_ITEM_SELECTOR);
  if (firstChild) focusTreeItem(firstChild);
}

function collapseToParent(target: HTMLElement) {
  if (target.classList.contains('tree-folder')) {
    const chevron = target.querySelector('.tree-chevron');
    if (chevron && chevron.classList.contains('expanded')) {
      target.click();
      return;
    }
  }
  const wrapper = target.closest('.tree-folder-wrapper');
  const parentFolder = wrapper?.parentElement?.closest('.tree-folder') as HTMLElement | null;
  if (parentFolder) focusTreeItem(parentFolder);
}

/** Keydown handler for WAI-ARIA tree keyboard navigation. */
function handleTreeKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  const items = getVisibleTreeItems();
  if (items.length === 0) return;

  const currentIndex = items.indexOf(target);

  switch (e.key) {
    case 'ArrowDown': {
      e.preventDefault();
      const next = currentIndex < items.length - 1 ? items[currentIndex + 1] : items[0];
      focusTreeItem(next);
      break;
    }
    case 'ArrowUp': {
      e.preventDefault();
      const prev = currentIndex > 0 ? items[currentIndex - 1] : items[items.length - 1];
      focusTreeItem(prev);
      break;
    }
    case 'ArrowRight': {
      e.preventDefault();
      if (target.classList.contains('tree-folder')) expandFolder(target);
      break;
    }
    case 'ArrowLeft': {
      e.preventDefault();
      collapseToParent(target);
      break;
    }
    case 'Enter': {
      if (target.classList.contains('tree-file')) {
        e.preventDefault();
        target.click();
      }
      break;
    }
  }
}
