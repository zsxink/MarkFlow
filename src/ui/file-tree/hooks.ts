// ── File tree context menu hook ───────────────────────────────────────
//
// The tree renderer (`core.ts`) needs to open a context menu for a node, and
// the menu implementation (`file-tree-context-menu.ts`) needs tree operations
// from the barrel that re-exports `core.ts`. Importing each other directly
// would close a cycle, so the menu registers itself here instead.
//
// The default is a no-op: a tree rendered without the menu module still works.

import type { ContextMenuItem } from '../context-menu';

export type TreeTargetType = 'file' | 'folder';

export interface TreeContextMenuHooks {
  showContextMenu: (x: number, y: number, path: string | null, type: TreeTargetType) => void;
}

const defaults: TreeContextMenuHooks = {
  showContextMenu: () => {},
};

let hooks: TreeContextMenuHooks = { ...defaults };

/** Called once by `file-tree-context-menu.ts` when that module loads. */
export function registerTreeContextMenuHooks(implementations: Partial<TreeContextMenuHooks>): void {
  hooks = { ...hooks, ...implementations };
}

/** Restore defaults; used by tests to isolate hook state. */
export function resetTreeContextMenuHooks(): void {
  hooks = { ...defaults };
}

export const treeContextMenuHooks = {
  showContextMenu: (x: number, y: number, path: string | null, type: TreeTargetType) =>
    hooks.showContextMenu(x, y, path, type),
};

export type { ContextMenuItem };
