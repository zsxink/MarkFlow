import type { EditorMode } from '../types/editor';
import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { getFileName } from './pathUtils';
import { store } from './store';
import { activeLosslessDirty, isActiveLosslessPath } from './lossless/registry';

// ── Module-level state (editor-internal, not in global Store) ────────

let editor: Editor | null = null;
export const assetToOriginalMap = new Map<string, string>();

// ── Document identity (P0S corrective P0) ─────────────────────────────
// Monotonically-increasing token identifying the current document instance.
// Bumped on every hydration/reload (resetDocumentRevision). An in-flight save
// captures the generation when it starts and only updates active-document state
// if the generation still matches when it completes — so a save that finishes
// after a document switch can never mark the NEW document persisted/clean.
let documentGeneration = 0;

/**
 * Origin of a content-affecting transaction. P0S (zero-edit write safety) needs
 * programmatic transactions that carry NO user intent (hydration, read-only/
 * editable synchronization, reload) to be distinguishable from real user edits.
 * User transactions and conservative `unknown` fallbacks drive dirty.
 */
export type TransactionOrigin =
  | 'userTransaction' // real user document edit (typing, paste, commands, undo…)
  | 'hydration'       // setMarkdown/setContent when opening or switching documents
  | 'readOnlySync'    // setEditable/setReadOnly synchronization, no doc change
  | 'reloadSync'      // reload-from-disk / conflict resolution round-trip
  | 'modeSync'        // Source -> WYSIWYG projection of an already-counted edit
  | 'assetResolution' // render-only image src rewrite; Markdown source is unchanged
  | 'unknown';        // no explicit origin recorded — treated as user intent conservatively

export const TRANSACTION_ORIGIN_META = 'markflowTransactionOrigin';

const documentState = {
  externallyModified: false,
  // Deprecated compatibility field. Transaction classification is now carried
  // by ProseMirror transaction meta and read synchronously in `onTransaction`.
  programmaticUpdate: false,
  /**
   * Legacy field retained for backward-compatible bookkeeping on save/hydration.
   * P0S: dirty is revision-driven (userRevision > persistedRevision) and never
   * derived from comparing this string to a serializer round-trip.
   */
  lastPersistedMarkdown: '',
  // ── P0S revision model ─────────────────────────────────────────────
  // userRevision counts only real user content transactions. Hydration and
  // programmatic sync NEVER increment it. Dirty = userRevision > persistedRevision.
  // Legacy serializer-round-trip comparison is gone.
  userRevision: 0,
  persistedRevision: 0,
  // mtime + size snapshot from the last successful read/save, used to detect
  // external modifications before overwriting.
  lastReadMtime: 0,
  lastReadSize: 0,
  // Trailing newlines at end of the original file (ProseMirror serializer drops them).
  // Captured on setMarkdown, re-appended in getMarkdown so legacy save round-trips
  // as close as the serializer allows. This is a legacy serializer compensation,
  // NOT a claim of byte fidelity — see P0S spec.
  trailingNewlines: 0,
};

// ── Setters (module-local) ──────────────────────────────────────────

export function setEditor(e: Editor | null) { editor = e; }
export function getEditor(): Editor | null { return editor; }
export function getDocumentState() { return documentState; }

// ── Mode (migrated to Store) ─────────────────────────────────────────

export function setMode(newMode: EditorMode) {
  store.setState({ mode: newMode });
}

export function getMode() {
  return store.getState().mode;
}

// ── Dirty flag (migrated to Store) ──────────────────────────────────

export function isDocumentDirty() {
  return store.getState().dirty;
}

// ── External modification flag (module-local) ───────────────────────

export function hasExternalModification() {
  return documentState.externallyModified;
}

export function markExternalModification() {
  documentState.externallyModified = true;
}

// ── Active document path (migrated to Store) ────────────────────────

export function setActiveDocumentPath(path: string | null) {
  store.setState({ activeFilePath: path });
}

export function getActiveDocPath(): string | null {
  const el = document.querySelector('.tree-file.active') as HTMLElement | null;
  return el?.dataset?.path || store.getState().activeFilePath;
}

// ── Shared utilities ────────────────────────────────────────────────

export function getMermaidExportBaseName() {
  const docPath = getActiveDocPath();
  if (!docPath) return 'mermaid-diagram';
  const fileName = getFileName(docPath);
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${baseName || 'mermaid-diagram'}-mermaid`;
}

export function getPlantUmlExportBaseName() {
  const docPath = getActiveDocPath();
  if (!docPath) return 'plantuml-diagram';
  const fileName = getFileName(docPath);
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${baseName || 'plantuml-diagram'}-plantuml`;
}

// ── Revision tracking (P0S) ─────────────────────────────────────────

/**
 * Increment the USER revision counter. Call only for real user document
 * transactions. Programmatic hydration / read-only / reload sync must carry
 * `TRANSACTION_ORIGIN_META` on the transaction instead.
 */
export function bumpRevision(): number {
  return ++documentState.userRevision;
}

/** Get the current user revision counter. */
export function getRevision(): number {
  return documentState.userRevision;
}

/**
 * Get the current document generation token. Compare against the generation
 * captured at save-start to detect that the active document has changed while
 * an asynchronous save was in flight (P0S corrective P0).
 */
export function getDocumentGeneration(): number {
  return documentGeneration;
}

/** Attach an explicit origin to the transaction that changes the document. */
export function setTransactionOrigin(
  transaction: Transaction,
  origin: TransactionOrigin,
): Transaction {
  transaction.setMeta(TRANSACTION_ORIGIN_META, origin);
  return transaction;
}

/** Read an explicit origin, falling back to `unknown` for unclassified work. */
export function getTransactionOrigin(transaction: Transaction): TransactionOrigin {
  const origin = transaction.getMeta(TRANSACTION_ORIGIN_META);
  switch (origin) {
    case 'userTransaction':
    case 'hydration':
    case 'readOnlySync':
    case 'reloadSync':
    case 'modeSync':
    case 'assetResolution':
    case 'unknown':
      return origin;
    default:
      return 'unknown';
  }
}

/**
 * Classify a doc-changing transaction at dispatch time. Unknown transactions
 * are user edits by default so an unlabelled command cannot lose data. The one
 * safe fallback is Tiptap's `preventUpdate` marker, which its programmatic
 * `setContent(..., false)` command sets on the same transaction.
 */
export function isUserContentTransaction(transaction: Transaction): boolean {
  if (!transaction.docChanged) return false;
  const origin = getTransactionOrigin(transaction);
  if (origin === 'userTransaction') return true;
  if (origin !== 'unknown') return false;
  return transaction.getMeta('preventUpdate') !== true;
}

/**
 * Reset revision state on document (re)hydration. Both counters go to 0,
 * which is the definition of "clean" (userRevision === persistedRevision).
 */
export function resetDocumentRevision(): void {
  documentState.userRevision = 0;
  documentState.persistedRevision = 0;
  // Each hydration/reload is a NEW document instance: bump the generation so an
  // in-flight save that completes after a document switch can detect that the
  // active document is no longer the one it started saving (P0S corrective P0).
  documentGeneration++;
}

/**
 * Mark the currently-persisted revision after a successful save.
 * If newer user edits arrived while saving, dirty is retained (returns false);
 * otherwise dirty is cleared (returns true).
 */
export function markDocumentPersistedRevision(persistedAtSave: number): boolean {
  if (persistedAtSave !== documentState.userRevision) {
    // Newer edits landed during the write — keep dirty.
    return false;
  }
  documentState.persistedRevision = documentState.userRevision;
  return true;
}

/** True when the document has confirmed user changes not yet persisted. */
export function hasUnpersistedUserChanges(): boolean {
  // Lossless Core path: dirty is revision-driven on the active binding.
  const activePath = getActiveDocPath();
  if (isActiveLosslessPath(activePath ?? '')) {
    return activeLosslessDirty(activePath);
  }
  // Legacy path: userRevision vs persistedRevision.
  return documentState.userRevision > documentState.persistedRevision;
}

// ── mtime + size snapshot ────────────────────────────────────────────

export function getLastReadMtime(): number {
  return documentState.lastReadMtime;
}

export function getLastReadSize(): number {
  return documentState.lastReadSize;
}

export function setLastReadStats(mtime: number, size: number) {
  documentState.lastReadMtime = mtime;
  documentState.lastReadSize = size;
}
