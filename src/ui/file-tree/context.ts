// ── Shared mutable state for the file tree ────────────────────────────
// The renderer, the loader and the incremental event applier all touch the
// same tree state, load cache, suppression list and metric counters. Keeping
// them here is what lets those three modules stay acyclic.

import type { DragState } from '../../types/file-tree';
import { createFileTreeState, type FileTreeState } from './state';

/** Suppressed watcher paths and the timestamp they were suppressed at. */
export const suppressPaths: Map<string, number> = new Map();
export const SUPPRESS_DURATION_MS = 3000;

/** In-flight directory loads, keyed by path, so concurrent loads dedupe. */
export const pendingLoads = new Map<string, Promise<void>>();

/** Counters reported in the `file-tree.metrics` logs. */
export const treeMetrics = {
  rootRefreshCount: 0,
  incrementalBatchCount: 0,
  localPatchCount: 0,
  recoveryRescanCount: 0,
};

let treeState: FileTreeState = createFileTreeState();

export function getTreeState(): FileTreeState {
  return treeState;
}

export function setTreeState(next: FileTreeState): void {
  treeState = next;
}

export function resetTreeMetrics(): void {
  treeMetrics.rootRefreshCount = 0;
  treeMetrics.incrementalBatchCount = 0;
  treeMetrics.localPatchCount = 0;
  treeMetrics.recoveryRescanCount = 0;
}

// ── rAF mutation batching ─────────────────────────────────────────────
// Incremental events are applied as DOM mutations coalesced into one frame, so
// a burst of watcher events does not thrash layout.

let cleanupRafId: number | null = null;
let pendingMutations: Array<() => void> = [];
let rafScheduled = false;

export function scheduleRafFlush(): void {
  if (rafScheduled) return;
  rafScheduled = true;
  cleanupRafId = requestAnimationFrame(() => {
    cleanupRafId = null;
    rafScheduled = false;
    const mutations = pendingMutations;
    pendingMutations = [];
    for (const fn of mutations) fn();
  });
}

export function queueMutation(mutation: () => void): void {
  pendingMutations.push(mutation);
}

/** Drain queued mutations synchronously; used by tests before rAF fires. */
export function flushPendingMutations(): void {
  rafScheduled = false;
  const mutations = pendingMutations;
  pendingMutations = [];
  for (const fn of mutations) fn();
}

export function cancelScheduledFlush(): void {
  if (cleanupRafId !== null) {
    cancelAnimationFrame(cleanupRafId);
    cleanupRafId = null;
  }
  rafScheduled = false;
  pendingMutations = [];
}

/** Drag source shared by the renderer and `dragdrop.ts`. */
export const dragState: DragState = {
  srcPath: null,
  srcEl: null,
  isDragging: false,
};

// ── Loader hook ───────────────────────────────────────────────────────
// The renderer (node creation, expand-on-click, "load more") needs to trigger a
// directory load, and the loader renders through this module. Injecting the
// loader here keeps `render.ts` and `loader.ts` from importing each other.

let loadDirectoryImpl: (path: string, append: boolean) => Promise<void> = async () => {};

export function registerDirectoryLoader(
  implementation: (path: string, append: boolean) => Promise<void>,
): void {
  loadDirectoryImpl = implementation;
}

export function loadDirectoryThroughHook(path: string, append: boolean): Promise<void> {
  return loadDirectoryImpl(path, append);
}
