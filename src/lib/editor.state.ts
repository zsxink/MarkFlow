import type { EditorMode } from '../types/editor';
import type { Editor } from '@tiptap/core';
import { getFileName } from './pathUtils';
import { store } from './store';

// ── Module-level state (editor-internal, not in global Store) ────────

let editor: Editor | null = null;
export const assetToOriginalMap = new Map<string, string>();

/**
 * Origin of a content-affecting transaction. P0S (zero-edit write safety) needs
 * programmatic transactions that carry NO user intent (hydration, read-only/
 * editable synchronization, reload) to be distinguishable from real user edits.
 * Only `userTransaction` increments `userRevision` / drives dirty.
 */
export type TransactionOrigin =
  | 'userTransaction' // real user document edit (typing, paste, commands, undo…)
  | 'hydration'       // setMarkdown/setContent when opening or switching documents
  | 'readOnlySync'    // setEditable/setReadOnly synchronization, no doc change
  | 'reloadSync'      // reload-from-disk / conflict resolution round-trip
  | 'unknown';        // no explicit origin recorded — treated as programmatic by default

const documentState = {
  externallyModified: false,
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
 * transactions. Programmatic hydration / read-only / reload sync must NOT call
 * this — use `markProgrammaticContent()` or nothing instead.
 */
export function bumpRevision(): number {
  return ++documentState.userRevision;
}

/** Get the current user revision counter. */
export function getRevision(): number {
  return documentState.userRevision;
}

/**
 * Mark a programmatic (non-user) content update. Does NOT increment
 * userRevision, so a hydration / read-only / reload sync can never make a
 * clean document dirty. `origin` is recorded for diagnostics only.
 */
export function markProgrammaticContent(origin: TransactionOrigin): void {
  documentState.programmaticUpdate = true;
  // Diagnostics only — revision model is userRevision/persistedRevision.
  void origin;
}

/**
 * Reset revision state on document (re)hydration. Both counters go to 0,
 * which is the definition of "clean" (userRevision === persistedRevision).
 */
export function resetDocumentRevision(): void {
  documentState.userRevision = 0;
  documentState.persistedRevision = 0;
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
