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

/** Save the active lossless document, or return null when not a lossless doc. */
export async function saveLosslessActiveDocument(options: {
  interactive?: boolean;
} = {}): Promise<LosslessSaveResult | null> {
  const binding = getActiveLosslessBinding();
  if (!binding) return null;
  return binding.save(options);
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
