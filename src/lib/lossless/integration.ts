// Lossless Core session integration — P1B 3.4/3.5/3.7.
//
// Routes the app's open / save / reload / close operations to the lossless
// EditorSurfaceBinding when the `losslessCoreSession` flag is on and a file is
// opened through the lossless path. The legacy path is untouched when the flag
// is off (owner isolation, design P1B §5).

import { invoke } from '@tauri-apps/api/core';
import { store } from '../store';
import { setActiveDocumentPath, setMode, resetDocumentRevision } from '../editor.state';
import { EditorSurfaceBinding, type LosslessSaveResult } from './editorSurfaceBinding';
import type { LosslessError, StartupRecoveryItem } from './types';
import {
  disposeActiveLosslessBinding,
  getActiveLosslessBinding,
  isActiveLosslessPath,
  rebindActiveLosslessPath,
  setActiveLosslessBinding,
} from './registry';
import { isLosslessCoreSessionEnabled } from './flag';

// Re-export for callers (main.ts external-modification routing).
export { isActiveLosslessPath } from './registry';

const SOURCE_WRAPPER_ID = 'source-editor-wrapper';
const WYSIWYG_ID = 'wysiwyg-editor';
const RECOVERY_ERROR_CODES = new Set(['save-outcome-unknown', 'external-conflict']);
let lastOpenSafetyError: LosslessError | null = null;

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
  syncModeUI('source');
}

/** Keep toolbar buttons + mode indicator consistent with the actual view.
 *  The legacy click handlers only run on manual clicks; lossless opens and
 *  failure rollbacks change the view without a click, so they must sync too. */
function syncModeUI(mode: 'source' | 'wysiwyg'): void {
  const sourceBtn = document.getElementById('btn-source');
  const wysiwygBtn = document.getElementById('btn-wysiwyg');
  if (sourceBtn) {
    sourceBtn.classList.toggle('active', mode === 'source');
    sourceBtn.setAttribute('aria-pressed', String(mode === 'source'));
  }
  if (wysiwygBtn) {
    wysiwygBtn.classList.toggle('active', mode === 'wysiwyg');
    wysiwygBtn.setAttribute('aria-pressed', String(mode === 'wysiwyg'));
  }
  const indicator = document.getElementById('mode-indicator');
  if (indicator) indicator.textContent = mode === 'wysiwyg' ? '所见即所得' : '源码';
}

/** Roll the view back to the legacy WYSIWYG surface after a lossless open
 *  failure, so the legacy fallback open never shows a hidden WYSIWYG plus an
 *  empty source wrapper. */
function restoreWysiwygView(): void {
  const wrapper = sourceWrapper();
  const wysiwyg = wysiwygEditor();
  if (wrapper) wrapper.hidden = true;
  if (wysiwyg) wysiwyg.hidden = false;
  setMode('wysiwyg');
  syncModeUI('wysiwyg');
}

/** True only for an open failure that must not fall back to a writable legacy owner. */
export function isLosslessOpenRecoveryBlocked(): boolean {
  return lastOpenSafetyError !== null;
}

function asLosslessError(error: unknown): LosslessError {
  const candidate = error as Partial<LosslessError> | null;
  return {
    code: typeof candidate?.code === 'string' ? candidate.code : 'io',
    message: typeof candidate?.message === 'string' ? candidate.message : '无法安全打开无损文档',
  };
}

/**
 * A recovery gate deliberately owns the visible source surface. It offers only
 * explicit durable receipt decisions; it never constructs a writable legacy
 * editor, so a crash cannot turn into an unguarded `write_file` overwrite.
 */
async function showStartupRecoverySurface(path: string, error: LosslessError): Promise<void> {
  const wrapper = sourceWrapper();
  const wysiwyg = wysiwygEditor();
  if (!wrapper) return;
  wrapper.replaceChildren();
  wrapper.hidden = false;
  if (wysiwyg) wysiwyg.hidden = true;
  setMode('source');
  syncModeUI('source');

  const panel = document.createElement('section');
  panel.dataset.testid = 'lossless-startup-recovery';
  panel.setAttribute('role', 'alert');
  const title = document.createElement('h2');
  title.textContent = '此文件需要先完成保存恢复';
  const detail = document.createElement('p');
  detail.textContent = `${error.code}: ${error.message}`;
  const hint = document.createElement('p');
  hint.textContent = '为避免覆盖未知磁盘内容，已阻止切换到可写旧编辑器。请选择下方明确恢复操作后重新打开文件。';
  panel.append(title, detail, hint);
  try {
    const items = await invoke<StartupRecoveryItem[]>('list_startup_recovery');
    // macOS may expose /var and /private/var spellings differently between
    // the picker and canonical receipt path. If exact matching finds none,
    // retain every structured recovery item rather than hiding the only
    // available explicit action behind a path-spelling mismatch.
    const matching = items.filter((entry) => entry.path === path);
    for (const item of matching.length > 0 ? matching : items) {
      const row = document.createElement('div');
      row.dataset.recoveryOperationId = item.saveOperationId;
      const text = document.createElement('p');
      text.textContent = `状态：${item.state}${item.recoveryPath ? '；已保留恢复副本' : ''}`;
      if (item.requiresQuarantine) {
        const quarantine = document.createElement('button');
        quarantine.type = 'button';
        quarantine.textContent = '隔离不可读收据并继续';
        quarantine.addEventListener('click', () => {
          quarantine.disabled = true;
          void invoke('resolve_startup_recovery', {
            req: {
              saveOperationId: item.saveOperationId,
              action: 'quarantine-invalid-receipt',
            },
          }).then(
            () => { text.textContent = '不可读收据已隔离保留。请重新打开文件。'; },
            (resolveError) => {
              text.textContent = `无法隔离不可读收据：${asLosslessError(resolveError).message}`;
              quarantine.disabled = false;
            },
          );
        });
        row.append(text, quarantine);
        panel.append(row);
        continue;
      }
      const accept = document.createElement('button');
      accept.type = 'button';
      accept.textContent = '确认保留已写入版本';
      const discard = document.createElement('button');
      discard.type = 'button';
      discard.textContent = '保留当前磁盘版本';
      const resolve = async (action: 'accept-written' | 'discard-recovery') => {
        accept.disabled = true;
        discard.disabled = true;
        try {
          await invoke('resolve_startup_recovery', {
            req: { saveOperationId: item.saveOperationId, action },
          });
          text.textContent = '恢复决定已记录。请重新打开文件。';
        } catch (resolveError) {
          text.textContent = `无法记录恢复决定：${asLosslessError(resolveError).message}`;
          accept.disabled = false;
          discard.disabled = false;
        }
      };
      accept.addEventListener('click', () => void resolve('accept-written'));
      discard.addEventListener('click', () => void resolve('discard-recovery'));
      row.append(text, accept, discard);
      panel.append(row);
    }
  } catch {
    // The blocking message remains useful even if listing itself is unavailable.
  }
  wrapper.append(panel);
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
  lastOpenSafetyError = null;
  try {
    await disposeActiveLosslessBinding();
    setActiveDocumentPath(path);
    const container = sourceWrapper();
    if (!container) return false;
    showSourceForLossless();

    const binding = await EditorSurfaceBinding.open(path, container, defaultEol, (_state) => {
      store.emit({ type: 'editor:update' });
      // `blocked` is a persistent recovery state, not a write failure. The
      // autosave coordinator records real I/O errors only (spec 3.5).
    });
    setActiveLosslessBinding(binding, path);
    // Lossless dirty is authoritative on the binding; keep the store in sync.
    store.setState({ dirty: binding.isDirty() });
    resetDocumentRevision();
    return true;
  } catch (err) {
    await disposeActiveLosslessBinding();
    const losslessError = asLosslessError(err);
    if (RECOVERY_ERROR_CODES.has(losslessError.code)) {
      lastOpenSafetyError = losslessError;
      await showStartupRecoverySurface(path, losslessError);
    } else {
      // Ordinary unsupported/open failures preserve the legacy fallback.
      restoreWysiwygView();
    }
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
  if (flush.status === 'blocked') return 'blocked';
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
  options: { discard?: boolean } = {},
): Promise<boolean> {
  const binding = getActiveLosslessBinding();
  if (!binding || !isActiveLosslessPath(path)) return false;
  // Reload is destructive to the optimistic CM mirror. A caller must have
  // completed an explicit discard/replace decision before it may proceed.
  if (binding.isDirty() && !options.discard) return false;
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
    if (saved === 'saved') rebindActiveLosslessPath(binding, targetPath);
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
