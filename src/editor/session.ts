// ── Document lifecycle ────────────────────────────────────────────────
// Loads a document into the editor (with stage-two admission), applies
// frontmatter patches, records persisted state, and resets scroll. Serialization
// and save planning live in `serialize.ts`, mode switching in `mode.ts`, caret
// anchoring in `caret.ts`.

import { scheduler } from '../infra/task-scheduler';
import { store } from '../infra/store';
import { uiPorts } from '../infra/ui-ports';
import { getCachedSettings } from '../infra/storage';
import { decideAdmission, admissionReasonLabel } from './markdown/admission';
import { admissionLimitsFromSettings } from './markdown/eligibility';
import { endOpaqueSession, getOpaqueSession } from './markdown/opaque/session';
import { normalizeImageMarkdown } from './serializer';
import {
  assetToOriginalMap,
  bumpRevision,
  bumpSourceRevision,
  clearLastReadStats,
  getDocumentState,
  getEditor,
  getMode,
  getRevision,
  getSourceRevision,
  hasLastReadStats,
  getLastReadMtime,
  getLastReadSize,
  setLastReadStats,
  setMarkdownPipelineMode,
  withProgrammaticUpdate,
} from './state';
import { setSourceContent } from './source-facade';
import { placeCaretAfterContentLoad } from './caret';
import { enterSourceMode } from './mode';
import { getMarkdown, getMarkdownResult } from './serialize';

// ── Serialization / save plan (defined in `serialize.ts`) ─────────────
export {
  appendTrailingNewlines,
  getMarkdown,
  getMarkdownResult,
  getPipelineMode,
  getSavePlan,
  restoreWysiwygTrailingNewlines,
  type SavePlan,
} from './serialize';

// ── Mode switching (defined in `mode.ts`) ─────────────────────────────
export { degradeToSourceOnly, switchToSource, switchToWysiwyg } from './mode';

// ── Caret anchoring (defined in `caret.ts`) ───────────────────────────
export { placeCaretAfterContentLoad } from './caret';

// ── Shared state / barrel re-exports for API compatibility ────────────
export {
  getEditor,
  getMode,
  setMode,
  isDocumentDirty,
  hasExternalModification,
  markExternalModification,
  setActiveDocumentPath,
  bumpRevision,
  getRevision,
  getLastReadMtime,
  getLastReadSize,
  hasLastReadStats,
  setLastReadStats,
  clearLastReadStats,
  getSourceRevision,
} from './state';
export { getWordCount, getLineCount, getCursorPos } from './stats';
export { initEditor } from './init';
export { ensureContinuationParagraph } from './continuation';
export { DEFAULT_IMAGE_SETTINGS } from '../infra/images/core';

// ── Scroll reset ──────────────────────────────────────────────────────

export function resetEditorScroll() {
  Object.assign(getDocumentState(), {
    wysiwygScrollTop: 0,
    wysiwygScrollLeft: 0,
    sourceScrollTop: 0,
    sourceScrollLeft: 0,
  });
  document.getElementById('editor-area')?.scrollTo({ top: 0, behavior: 'auto' });
  document.querySelector<HTMLElement>('#source-editor-wrapper .cm-scroller')
    ?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

export function markDocumentPersisted(
  markdown: string,
  persistedRevision?: number,
  persistedSourceRevision?: number,
) {
  // The disk baseline is exact authored text, including EOF newline count.
  // Source owns that count; stripping it here would make a subsequent
  // Source→WYSIWYG save restore stale metadata.
  const preserveLiteralSource = Boolean(getOpaqueSession()?.localizedFallback);
  getDocumentState().lastPersistedMarkdown = preserveLiteralSource
    ? markdown
    : normalizeImageMarkdown(markdown);

  // If a revision was captured at save-start, only clear dirty when no newer
  // edits arrived during the write.  Without a revision (legacy callers) we
  // always clear dirty for backward compatibility.
  if ((persistedRevision !== undefined && persistedRevision !== getRevision())
    || (persistedSourceRevision !== undefined && persistedSourceRevision !== getSourceRevision())) {
    // A user/source edit or a newer disk event arrived during the write. The
    // disk baseline records this write, but the live identity remains unsafe.
    store.setState({ dirty: true });
    return;
  }

  // Content-based sanity check: compare actual current content against what
  // was just persisted.  This handles edge cases where the revision counter
  // incremented (e.g. from a debounced onUpdate) but the current editor
  // content hasn't materially changed (just the debounce timer caught up).
  const current = getMarkdownResult();
  // A failed conversion is never considered persisted or clean.
  if (!current.ok) {
    store.setState({ dirty: true });
    return;
  }
  const currentMd = preserveLiteralSource
    ? current.markdown
    : normalizeImageMarkdown(current.markdown);
  // A successful save clears the persistent autosave-failure banner, regardless
  // of whether the save came from autosave or an interactive (Ctrl+S) save.
  const currentWasPersisted = currentMd === getDocumentState().lastPersistedMarkdown;
  const session = getOpaqueSession();
  if (currentWasPersisted && persistedRevision === getRevision()
    && getDocumentState().externallyModified && session) {
    // A confirmed overwrite / Save As resolved the external source identity.
    // Keep the admission fingerprint, RAW slots and PM history intact: only
    // the identity token changes to the source that was successfully saved.
    session.sourceRevision = getSourceRevision();
  }
  store.setState({
    dirty: !currentWasPersisted,
    autosaveErrorCount: 0,
    ...(currentWasPersisted ? { reconcileError: null } : {}),
  });
  getDocumentState().externallyModified = false;
}

// ── Document load ─────────────────────────────────────────────────────

export interface MarkdownLoadOptions {
  /**
   * `start` (default): a freshly loaded document gets the caret at its first
   * text position. `preserve`: keep the nearest valid position for an in-place
   * re-render of the same document.
   */
  caret?: 'start' | 'preserve';
}

export function setMarkdown(content: string, options: MarkdownLoadOptions = {}) {
  const ed = getEditor();
  if (!ed) return;

  const previousCaret = ed.state?.selection?.from ?? 1;
  ed.setEditable(!store.getState().readOnly, false);
  // Cancel any pending dirty-check from a previous document's onUpdate.
  // Without this, a stale task captures old content and, when it fires
  // 400 ms later, compares it against the new baseline — incorrectly
  // marking the freshly loaded document dirty.
  scheduler.cancel('dirty-check');
  // Opening/switching a document ends any previous opaque session so old slots
  // from the prior document can never resolve in this one.
  endOpaqueSession();
  const sourceRevision = bumpSourceRevision();
  clearLastReadStats();
  assetToOriginalMap.clear();
  // Capture trailing newlines before ProseMirror strips them
  const match = content.match(/\n+$/);
  getDocumentState().trailingNewlines = match ? match[0].length : 0;
  // Keep the persisted/admission source byte-faithful. Image normalization
  // belongs to an actual write candidate, not an open-time baseline: it would
  // otherwise erase CRLF spelling before an untouched save decision.
  // When Source is active it is the authoritative surface.  In particular, do
  // not place opaque sentinels in CM6 and do not retain an opaque session that
  // would make a later Source save read stale WYSIWYG content.
  if (getMode() === 'source') {
    setMarkdownPipelineMode('source-only');
    setSourceContent(content);
    markLoadedClean(content);
    return;
  }
  // Stage-two admission: only fully-supported documents advance to WYSIWYG
  // (`gated`); `eligible-with-opaque` documents advance to `opaque` with a
  // verified session; `source-only` documents stay in Source with a stable
  // reason, never destroying the CM6 editor or rewriting disk. The
  // verification re-parse is programmatic, so it must not register as a user
  // edit, bump the revision, or mark the document dirty. Admission bounds are
  // read per load so a settings change applies to the next opened document.
  const admissionLimits = admissionLimitsFromSettings(getCachedSettings());
  const admission = withProgrammaticUpdate(() =>
    decideAdmission(ed, content, { sourceRevision, userRevisionAtAdmission: getRevision() }, admissionLimits),
  );
  if (admission.mode === 'source-only') {
    setMarkdownPipelineMode('source-only');
    uiPorts.notify(`已保留源码模式：${admissionReasonLabel(admission.reason, admission.size, admissionLimits, admission.complexity)}`);
    enterSourceMode(content);
    // Same baseline reset as the parse-failure branch: a document admitted to
    // source-only is loaded clean and must not inherit a prior document's dirty
    // state or stale lastPersistedMarkdown.
    markLoadedClean(content);
    return;
  }
  setMarkdownPipelineMode(admission.mode);
  // Opening/reloading establishes a source baseline. Do not reserialize it
  // here: v3 canonicalization is representation work, not a user edit.
  // This is the on-disk baseline, not the admission render baseline. Keep the
  // normalized file text intact (including CRLF/EOF newline count) so an
  // untouched WYSIWYG open remains `unchanged` and never rewrites mtime.
  markLoadedClean(content);
  // Whole-document replace: re-anchor the caret (and the browser selection)
  // instead of inheriting whatever ProseMirror mapped the old one to.
  placeCaretAfterContentLoad(ed, options.caret ?? 'start', previousCaret);
}

/** A freshly loaded document is clean: reset baseline, dirty flag and banner. */
function markLoadedClean(content: string): void {
  getDocumentState().lastPersistedMarkdown = content;
  getDocumentState().externallyModified = false;
  store.setState({ dirty: false, autosaveErrorCount: 0, reconcileError: null });
  uiPorts.refreshFrontmatter(content);
}

/** Applies a user-authored frontmatter patch through the normal admission path. */
export function applyFrontmatterMarkdown(content: string): void {
  if (store.getState().readOnly || content === getMarkdown()) return;
  const persistedBaseline = getDocumentState().lastPersistedMarkdown;
  // `setMarkdown` also serves document loads and clears the remembered disk
  // identity. A frontmatter edit is only a new in-memory representation of this
  // same file, so keep the identity captured when it was read; otherwise
  // verified saves reject the edit as an unknown/stale source.
  const diskStats = hasLastReadStats()
    ? { mtime: getLastReadMtime(), size: getLastReadSize() }
    : null;
  // Advance the user revision before admission so the rebuilt opaque session
  // captures it as its baseline. Advancing it afterwards makes reconciliation
  // mistake this programmatic re-admission for an untracked WYSIWYG edit.
  bumpRevision();
  setMarkdown(content, { caret: 'preserve' });
  if (diskStats) setLastReadStats(diskStats.mtime, diskStats.size);
  // `setMarkdown` is also the document-load path and therefore establishes a
  // clean baseline. A panel patch is a user edit, so retain the disk baseline.
  getDocumentState().lastPersistedMarkdown = persistedBaseline;
  store.setState({ dirty: normalizeImageMarkdown(content) !== persistedBaseline });
  store.emit({ type: 'editor:update' });
}

