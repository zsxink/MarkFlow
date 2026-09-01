import { beforeEach, describe, expect, it } from 'vitest';
import { getDocumentState, isProgrammaticUpdate, withProgrammaticUpdate, bumpRevision, getRevision } from './editor.state';
import { scheduler } from './taskScheduler';
import { store } from './store';

beforeEach(() => {
  const state = getDocumentState();
  state.programmaticUpdate = false;
  state.programmaticUpdateDepth = 0;
  state.revision = 0;
  state.lastPersistedMarkdown = '';
  store.setState({ dirty: false, mode: 'wysiwyg', activeFilePath: null, workspacePath: null, expandedPaths: [], autosaveErrorCount: 0 });
  scheduler.cancelAll();
});

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 4.6 — the scoped programmatic guard uses a counter so a scheduled callback
 * that runs *after* the guard's finally block cannot be misclassified as a
 * user edit. The editor.onUpdate handler snapshots the guard state while the
 * transaction is handled, then schedules the dirty check. Mimic that exact
 * lifecycle with the real scheduler.
 */
describe('delayed scheduler + scoped programmatic guard (task 4.6)', () => {
  it('a programmatic snapshot taken inside the guard is honored by a late callback', async () => {
    let isUserUpdateSnapshot = false;
    let lateCallbackSeenGuardIsCleared = false;
    let callbacksRan = 0;

    const runDirtyCheck = () => {
      callbacksRan += 1;
      // This callback runs strictly after the guard's finally has run.
      lateCallbackSeenGuardIsCleared = !isProgrammaticUpdate();
      if (isUserUpdateSnapshot) return; // programmatic write: skip
    };

    withProgrammaticUpdate(() => {
      isUserUpdateSnapshot = !isProgrammaticUpdate();
      expect(isUserUpdateSnapshot).toBe(false);
      scheduler.schedule('dirty-check', 10, runDirtyCheck);
      expect(isProgrammaticUpdate()).toBe(true);
    });
    expect(isProgrammaticUpdate()).toBe(false);

    await wait(40);
    expect(callbacksRan).toBe(1);
    expect(lateCallbackSeenGuardIsCleared).toBe(true);
    expect(getRevision()).toBe(0);
    expect(store.getState().dirty).toBe(false);
  });

  it('a snapshot outside the guard (real user edit) bumps revision and dirty via the scheduler', async () => {
    let isUserUpdateSnapshot = false;
    let callbacksRan = 0;

    const runDirtyCheck = () => {
      callbacksRan += 1;
      if (isUserUpdateSnapshot) {
        bumpRevision();
        store.setState({ dirty: true });
      }
    };

    // Real user transaction: no guard wrapping.
    isUserUpdateSnapshot = !isProgrammaticUpdate();
    expect(isUserUpdateSnapshot).toBe(true);
    scheduler.schedule('dirty-check', 10, runDirtyCheck);

    await wait(40);
    expect(callbacksRan).toBe(1);
    expect(getRevision()).toBe(1);
    expect(store.getState().dirty).toBe(true);
  });
});