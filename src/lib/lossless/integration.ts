// Lossless Core session integration — P1B 3.4/3.5/3.7.
//
// Routes the app's open / save / reload / close operations to the lossless
// EditorSurfaceBinding when the `losslessCoreSession` flag is on and a file is
// opened through the lossless path. The legacy path is untouched when the flag
// is off (owner isolation, design P1B §5).

import { store } from '../store';
import { setActiveDocumentPath, setMode, resetDocumentRevision } from '../editor.state';
import { EditorSurfaceBinding, type LosslessSaveResult } from './editorSurfaceBinding';
import {
  disposeActiveLosslessBinding,
  getActiveLosslessBinding,
  isActiveLosslessPath,
  setActiveLosslessBinding,
} from './registry';
import { isLosslessCoreSessionEnabled } from './flag';

// Re-export for callers (main.ts external-modification routing).
export { isActiveLosslessPath } from './registry';

const SOURCE_WRAPPER_ID = 'source-editor-wrapper';
const WYSIWYG_ID = 'wysiwyg-editor';

function sourceWrapper(): HTMLElement | null {
  return document.getElementById(SOURCE_WRAPPER_ID);
}

function wysiwygEditor(): HTMLElement | null {
  return document.getElementById(WYSIWYG_ID);
}

function showSourceForLossless(): void {
  const wrapper = sourceWrapper();
  const wysiwyg = wysiwygEditor();
  if (wrapper) wrapper.hidden = false;
  if (wysiwyg) wysiwyg.hidden = true;
  setMode('source');
}

/** Whether the active document is a lossless Core document. */
export function isLosslessActiveDoc(path: string | null): boolean {
  return isLosslessCoreSessionEnabled() && path !== null && isActiveLosslessPath(path);
}

/**
 * Open a file through the lossless Core path. Returns true when handled; false
 * when the caller should fall back to the legacy path (flag off, or open failed
 * and the caller shows the error).
 */
export async function openLosslessDocument(
  path: string,
  defaultEol = 'lf',
): Promise<boolean> {
  if (!isLosslessCoreSessionEnabled()) return false;
  try {
    await disposeActiveLosslessBinding();
    setActiveDocumentPath(path);
    const container = sourceWrapper();
    if (!container) return false;
    showSourceForLossless();

    const binding = await EditorSurfaceBinding.open(path, container, defaultEol, (state) => {
      store.emit({ type: 'editor:update' });
      if (state === 'blocked') {
        // UI hint only; no old snapshot may be written (design 02 §6).
        store.setState({ autosaveErrorCount: store.getState().autosaveErrorCount + 1 });
      }
    });
    setActiveLosslessBinding(binding, path);
    // Lossless dirty is authoritative on the binding; keep the store in sync.
    store.setState({ dirty: binding.isDirty() });
    resetDocumentRevision();
    return true;
  } catch (err) {
    await disposeActiveLosslessBinding();
    store.setState({ dirty: false });
    return false;
  }
}

/**
 * Save the active lossless document, or return null when not a lossless doc.
 * Images are migrated as an explicit local patch before the confirmed bytes are
 * prepared (design 04 §6): never a full-text rewrite before save.
 */
export async function saveLosslessActiveDocument(options: {
  interactive?: boolean;
} = {}): Promise<LosslessSaveResult | null> {
  const binding = getActiveLosslessBinding();
  if (!binding) return null;

  // 1. Confirm every local edit (flush barrier) before touching the doc for
  //    image migration.
  const flush = await binding.flushNow();
  if (flush.status === 'blocked') return 'failed';
  if (flush.status === 'disposed') return 'failed';

  // 2. Migrate staged images → explicit local URL-range patches.
  const { preparePendingImagesForSave, completePendingImagesSave, abortPendingImagesSave } =
    await import('../imageUtils');
  const prepared = await preparePendingImagesForSave(binding.logicalText, binding.path).catch(
    () => ({ markdown: '', draftId: null, localPatches: [] }),
  );

  // 3. Apply the local patch through the controller and re-confirm.
  if (prepared.localPatches && prepared.localPatches.length > 0) {
    await binding.applyImagePatches(prepared.localPatches);
  }

  // 4. Save the Core-confirmed bytes (guarded atomic write).
  const result = await binding.save(options);
  if (result === 'saved' && prepared.draftId) {
    await completePendingImagesSave(prepared.draftId).catch(() => undefined);
  } else if (result !== 'saved') {
    abortPendingImagesSave();
  }
  return result;
}

/** Reload the active lossless document from disk (force). */
export async function reloadLosslessActiveDocument(
  path: string,
  defaultEol = 'lf',
): Promise<boolean> {
  const binding = getActiveLosslessBinding();
  if (!binding || !isActiveLosslessPath(path)) return false;
  try {
    await binding.reload(path, defaultEol);
    store.setState({ dirty: false });
    return true;
  } catch {
    return false;
  }
}

/** Flush + close the active lossless document (close / switch / flag-off rollback). */
export async function closeLosslessActiveDocument(): Promise<void> {
  await disposeActiveLosslessBinding();
}

/** Save As for the active lossless document (new path, expected identity Absent). */
export async function saveLosslessActiveDocumentAsNewFile(targetPath: string): Promise<boolean> {
  const binding = getActiveLosslessBinding();
  if (!binding) return false;
  try {
    const saved = await binding.saveAs(targetPath);
    return saved === 'saved';
  } catch {
    return false;
  }
}

/** External modification detection for a lossless document. */
export function markLosslessExternalModification(path: string): void {
  const binding = getActiveLosslessBinding();
  if (!binding || !isActiveLosslessPath(path)) return;
  // The guarded atomic write detects the identity mismatch at the replace point;
  // we only surface the state so an interactive save can prompt for a choice.
  (binding as EditorSurfaceBinding & { externalConflict?: boolean }).externalConflict = true;
}

/** Read the active lossless doc's confirmed hash for E2E evidence. */
export function getLosslessSnapshotHash(): string | null {
  const binding = getActiveLosslessBinding();
  return binding ? binding.hash : null;
}

// E2E-only hooks for the desktop WebDriver suite: enable the flag, dispatch real
// CodeMirror transactions, and assert binding state. Not present in prod builds.
if (import.meta.env.MODE === 'e2e') {
  const hooks = {
    isActive: () => getActiveLosslessBinding() !== null,
    isDirty: () => getActiveLosslessBinding()?.isDirty() ?? false,
    pipelineState: () => getActiveLosslessBinding()?.pipelineState ?? 'none',
    hash: () => getActiveLosslessBinding()?.hash ?? null,
    save: (interactive: boolean) => saveLosslessActiveDocument({ interactive }),
    close: () => closeLosslessActiveDocument(),
    type: (text: string) => {
      const binding = getActiveLosslessBinding();
      if (!binding) return 'no-binding';
      binding.typeAtCursor(text);
      return 'typed';
    },
  };
  (window as unknown as { __markflowLossless?: typeof hooks }).__markflowLossless = hooks;
}
