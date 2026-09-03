import type { EditorMode } from '../types/editor';
import type { Editor } from '@tiptap/core';
import { getFileName } from './pathUtils';
import { store } from './store';
import type { MarkdownPipelineMode } from './editor.markdown.types';
import { onPipelineModeChanged } from './editor.markdown.opaque.session';

// ── Module-level state (editor-internal, not in global Store) ────────

let editor: Editor | null = null;
export const assetToOriginalMap = new Map<string, string>();

const documentState = {
  externallyModified: false,
  programmaticUpdate: false,
  programmaticUpdateDepth: 0,
  pipelineMode: 'v3-compatible' as MarkdownPipelineMode,
  lastPersistedMarkdown: '',
  // Revision tracking — incremented on each content edit, used to detect
  // whether new edits arrived during an in-flight save.
  revision: 0,
  // Monotonic identity of the source/file contents.  Unlike `revision` this
  // advances for disk loads and Source edits too, so a session can never
  // mistake a different source for the one it verified at admission.
  sourceRevision: 0,
  // mtime + size snapshot from the last successful read/save, used to detect
  // external modifications before overwriting.
  lastReadMtime: 0,
  lastReadSize: 0,
  // mtime=0 and size=0 are legitimate filesystem values. Keep validity
  // separate so verified saves never mistake an unknown identity for an empty
  // file with a coarse/unsupported timestamp.
  lastReadStatsKnown: false,
  // Trailing newlines at end of the original file (ProseMirror serializer drops them).
  // Captured on setMarkdown, appended back in getMarkdown / dirty comparisons.
  trailingNewlines: 0,
};

// ── Setters (module-local) ──────────────────────────────────────────

export function setEditor(e: Editor | null) { editor = e; }
export function getEditor(): Editor | null { return editor; }
export function getDocumentState() { return documentState; }

/**
 * Runs representation changes without allowing nested editor callbacks to be
 * mistaken for user edits. The finally block is deliberately shared by every
 * programmatic parse and source synchronization path.
 */
export function withProgrammaticUpdate<T>(operation: () => T): T {
  documentState.programmaticUpdateDepth += 1;
  documentState.programmaticUpdate = true;
  try {
    return operation();
  } finally {
    documentState.programmaticUpdateDepth = Math.max(0, documentState.programmaticUpdateDepth - 1);
    documentState.programmaticUpdate = documentState.programmaticUpdateDepth > 0;
  }
}

export function isProgrammaticUpdate(): boolean {
  return documentState.programmaticUpdateDepth > 0;
}

export function getMarkdownPipelineMode(): MarkdownPipelineMode {
  return documentState.pipelineMode;
}

export function setMarkdownPipelineMode(mode: MarkdownPipelineMode): void {
  documentState.pipelineMode = mode;
  // Task 7.6: degrading below `opaque` must drop the live opaque session so no
  // stale holder can survive a kill-switch / mode regression.
  onPipelineModeChanged(mode);
}

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
  // A watcher signal is enough to invalidate a verified session even when a
  // subsequent stat/read fails. The save boundary then returns stale-source
  // instead of treating an unverifiable disk state as unchanged.
  bumpSourceRevision();
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

// ── Revision tracking ────────────────────────────────────────────────

/** Increment the document revision counter. Call on each user edit. */
export function bumpRevision(): number {
  return ++documentState.revision;
}

/** Get the current revision number. */
export function getRevision(): number {
  return documentState.revision;
}

/** Advance the source/file identity after loading or changing raw Source text. */
export function bumpSourceRevision(): number {
  return ++documentState.sourceRevision;
}

export function getSourceRevision(): number {
  return documentState.sourceRevision;
}

// ── mtime + size snapshot ────────────────────────────────────────────

export function getLastReadMtime(): number {
  return documentState.lastReadMtime;
}

export function getLastReadSize(): number {
  return documentState.lastReadSize;
}

export function hasLastReadStats(): boolean {
  return documentState.lastReadStatsKnown;
}

export function setLastReadStats(mtime: number, size: number) {
  documentState.lastReadMtime = mtime;
  documentState.lastReadSize = size;
  documentState.lastReadStatsKnown = true;
}

export function clearLastReadStats() {
  documentState.lastReadMtime = 0;
  documentState.lastReadSize = 0;
  documentState.lastReadStatsKnown = false;
}
