// ── File tree header toolbar ─────────────────────────────────────────
// The sticky row pinned to the top of the file list (issue #424): collapse
// chevron + workspace folder name on the left, four hover-revealed quick
// actions (new file / new folder / refresh / toggle all folders) on the right.
// Lives above the loader in the import graph — the loader mounts it through
// the hook in context.ts so the modules stay acyclic.

import { getFileName, getParentDir } from '../../utils/paths';
import { registerTreeHeaderMounter } from './context';
import { escapeHtml } from './dom';
import { refreshFileTree, collapseAllFolders, expandAllFolders } from './loader';
import { startInlineCreate } from './inline';
import { getWorkspacePath } from './workspace';

// Inline SVG icons, hand-drawn in the same stroke style as the tree node
// icons in render.ts (no external icon library).
const ICONS = {
  chevron: '<polyline points="6 9 12 15 18 9"/>',
  filePlus: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 11v6"/><path d="M9 14h6"/>',
  folderPlus: '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><path d="M12 11v6"/><path d="M9 14h6"/>',
  refresh: '<path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16"/><path d="M8 16H3v5"/><path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8"/><path d="M16 8h5V3"/>',
  chevronsDownUp: '<path d="M7 9l5 5 5-5"/><path d="M7 15l5-5 5 5"/>',
} as const;

function actionButton(label: string, icon: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tree-header-action';
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${icon}</svg>`;
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return button;
}

/** Directory a header "create" action targets: follow the current selection. */
export function resolveCreateTargetDir(): string | null {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) return null;
  // Selection single truth is the store's activeFilePath, mirrored onto the
  // tree as `.tree-file.active` (active-document.ts) / `aria-selected`
  // (aria.ts). A selected folder creates inside itself, a selected file in
  // its sibling directory, no selection falls back to the workspace root.
  const selected = document.querySelector<HTMLElement>(
    '#file-tree .tree-file.active, #file-tree [aria-selected="true"]',
  );
  const path = selected?.dataset.path;
  if (!selected || !path) return workspacePath;
  return selected.classList.contains('tree-folder') ? path : getParentDir(path);
}

/** True when any rendered folder is still folded (drives the smart toggle). */
export function hasCollapsedFolder(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>('#file-tree .tree-folder'))
    .some(folder => {
      const chevron = folder.querySelector('.tree-chevron');
      return !!chevron
        && !!folder.parentElement?.querySelector(':scope > .tree-children')
        && !chevron.classList.contains('expanded');
    });
}

/** Smart toggle shared with the old tab-row hover button (issue #418):
 * anything still folded → expand everything, otherwise fold the whole tree. */
export function toggleAllFolders(): void {
  if (hasCollapsedFolder()) void expandAllFolders();
  else void collapseAllFolders();
}

function createInSelection(type: 'file' | 'folder'): void {
  const dir = resolveCreateTargetDir();
  if (dir) startInlineCreate(type, dir);
}

function buildTreeHeader(rootName: string, workspacePath: string): HTMLElement {
  const header = document.createElement('div');
  header.className = 'tree-header';
  header.innerHTML = `
    <button class="tree-chevron-btn" type="button" aria-label="收起所有文件夹" title="收起所有文件夹">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${ICONS.chevron}</svg>
    </button>
    <span class="tree-header-name" title="${escapeHtml(workspacePath)}">${escapeHtml(rootName)}</span>
  `;

  // Both the chevron and the folder name fold the whole tree up (confirmed
  // interaction for issue #424).
  header.querySelector('.tree-chevron-btn')!.addEventListener('click', (e) => {
    e.stopPropagation();
    void collapseAllFolders();
  });
  header.querySelector('.tree-header-name')!.addEventListener('click', (e) => {
    e.stopPropagation();
    void collapseAllFolders();
  });

  const actions = document.createElement('div');
  actions.className = 'tree-header-actions';
  actions.appendChild(actionButton('新建文件', ICONS.filePlus, () => createInSelection('file')));
  actions.appendChild(actionButton('新建文件夹', ICONS.folderPlus, () => createInSelection('folder')));
  actions.appendChild(actionButton('刷新', ICONS.refresh, () => { void refreshFileTree(); }));
  actions.appendChild(actionButton('展开或收起所有文件夹', ICONS.chevronsDownUp, toggleAllFolders));
  header.appendChild(actions);
  return header;
}

/**
 * Mount (or refresh) the sticky header at the top of `#file-tree`. The tree
 * root is rebuilt by `renderDirectory` via `container.innerHTML = ''`, so the
 * loader re-invokes this hook after every root render; mounting is idempotent
 * and a missing workspace removes the row entirely.
 */
export function mountTreeHeader(): void {
  const container = document.getElementById('file-tree');
  if (!container) return;
  const workspacePath = getWorkspacePath();
  const existing = container.querySelector<HTMLElement>(':scope > .tree-header');
  if (!workspacePath) {
    existing?.remove();
    return;
  }
  const rootName = getFileName(workspacePath) || workspacePath;
  if (existing) {
    const name = existing.querySelector(':scope > .tree-header-name');
    if (name && name.textContent !== rootName) name.textContent = rootName;
    if (container.firstElementChild !== existing) container.prepend(existing);
    return;
  }
  container.prepend(buildTreeHeader(rootName, workspacePath));
}

// The loader owns every root render (initial load, refresh, stale recovery),
// so it pulls the mount through the context hook; the loader must not import
// this module directly or the two would form a cycle.
registerTreeHeaderMounter(mountTreeHeader);
