/**
 * Document identity boundary. Queue whole asynchronous operations before their
 * first await (save dialogs and image settings included). Internal helpers must
 * never enqueue again: close/reload/overwrite call their *InOperation variant.
 * Autosave skips a busy queue so it cannot deadlock a transition awaiting save.
 */
let tail: Promise<unknown> = Promise.resolve();
let pending = 0;

export function isDocumentOperationPending(): boolean { return pending > 0; }

export function runDocumentOperation<T>(operation: () => T | Promise<T>): Promise<T> {
  pending += 1;
  const result = tail.then(operation);
  tail = result.catch(() => undefined);
  return result.finally(() => { pending -= 1; });
}
