// ── Image draft lifecycle ─────────────────────────────────────────────
// Owns the module-level draft state: which pending draft the unsaved document
// writes into, the serialized write queue, and the save barrier that prevents a
// draft from being migrated while writes are still in flight.

import { cleanupPendingImages } from '../storage';

export interface ImageDraftContext {
  draftId: string | null;
  pendingReferences: Set<string>;
  immediateAbsoluteReferences: Set<string>;
}

let activeImageDraft: ImageDraftContext = createEmptyDraft();
let pendingWriteQueue: Promise<void> = Promise.resolve();
const activeImageOperations = new Set<Promise<unknown>>();
let pendingSaveBarrier: Promise<void> | null = null;
let releasePendingSaveBarrier: (() => void) | null = null;

export function createEmptyDraft(): ImageDraftContext {
  return {
    draftId: null,
    pendingReferences: new Set(),
    immediateAbsoluteReferences: new Set(),
  };
}

export function getActiveImageDraft(): ImageDraftContext {
  return activeImageDraft;
}

export function replaceActiveImageDraft(draft: ImageDraftContext): void {
  activeImageDraft = draft;
}

export function getActiveImageDraftId(): string | null {
  return activeImageDraft.draftId;
}

export function getPendingWriteQueue(): Promise<void> {
  return pendingWriteQueue;
}

export function setPendingWriteQueue(queue: Promise<void>): void {
  pendingWriteQueue = queue;
}

export function getPendingSaveBarrier(): Promise<void> | null {
  return pendingSaveBarrier;
}

export function beginPendingImagesSave(): void {
  if (pendingSaveBarrier) throw new Error('图片保存操作正在进行中');
  pendingSaveBarrier = new Promise<void>(resolve => {
    releasePendingSaveBarrier = resolve;
  });
}

export function releasePendingImagesSave(): void {
  const release = releasePendingSaveBarrier;
  releasePendingSaveBarrier = null;
  pendingSaveBarrier = null;
  release?.();
}

/** Queue a staged write behind earlier writes and any active save barrier. */
export function stagePendingOperation(
  write: (draftId: string | null) => Promise<{ draftId: string; path: string }>,
): Promise<string> {
  const saveBarrier = pendingSaveBarrier;
  const queued = pendingWriteQueue.then(async () => {
    if (saveBarrier) await saveBarrier;
    const draft = activeImageDraft;
    const pending = await write(draft.draftId);
    if (draft.draftId && draft.draftId !== pending.draftId) {
      throw new Error('图片暂存草稿标识不一致');
    }
    draft.draftId = pending.draftId;
    draft.pendingReferences.add(pending.path);
    return pending.path;
  });
  pendingWriteQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

export function trackImageOperation<T>(operation: () => Promise<T>): Promise<T> {
  const pending = operation();
  activeImageOperations.add(pending);
  void pending.then(
    () => activeImageOperations.delete(pending),
    () => activeImageOperations.delete(pending),
  );
  return pending;
}

/** Await this at the serialized document boundary before taking its draft. */
export async function settleImageOperations(): Promise<void> {
  while (activeImageOperations.size) await Promise.allSettled([...activeImageOperations]);
  await pendingWriteQueue;
}

export function detachImageDraft(): ImageDraftContext {
  const draft = activeImageDraft;
  activeImageDraft = createEmptyDraft();
  return draft;
}

export function attachImageDraft(draft: ImageDraftContext): void {
  activeImageDraft = draft;
}

export async function releaseImageDraft(draft: ImageDraftContext): Promise<void> {
  if (draft.draftId) await cleanupPendingImages(draft.draftId);
  draft.pendingReferences.clear();
  draft.immediateAbsoluteReferences.clear();
  draft.draftId = null;
}

/** Test/lifecycle helper; callers should normally use discardActiveImageDraft. */
export function resetActiveImageDraftState(): void {
  activeImageDraft = createEmptyDraft();
  pendingWriteQueue = Promise.resolve();
  releasePendingImagesSave();
}

/** Best-effort cleanup used when the active unsaved document is discarded.
 *  Skips cleanup if a save is in progress — the save will handle it, or the
 *  7-day expiry on startup will collect any leftovers. */
export async function discardActiveImageDraft(): Promise<void> {
  if (pendingSaveBarrier) return;
  const discardedDraft = activeImageDraft;
  const pendingWrites = pendingWriteQueue;
  activeImageDraft = createEmptyDraft();
  await pendingWrites;
  const draftId = discardedDraft.draftId;
  if (draftId) await cleanupPendingImages(draftId);
}
