import type { EditorMode } from '../types/editor';
import type { Editor } from '@tiptap/core';
import { getFileName } from './pathUtils';
import { store } from './store';

// ── Module-level state (editor-internal, not in global Store) ────────

let editor: Editor | null = null;
let dirtyCheckTimer: ReturnType<typeof setTimeout> | null = null;
let updateEventTimer: ReturnType<typeof setTimeout> | null = null;
export const assetToOriginalMap = new Map<string, string>();

const documentState = {
  externallyModified: false,
  programmaticUpdate: false,
  lastPersistedMarkdown: '',
  // Revision tracking — incremented on each content edit, used to detect
  // whether new edits arrived during an in-flight save.
  revision: 0,
  // mtime + size snapshot from the last successful read/save, used to detect
  // external modifications before overwriting.
  lastReadMtime: 0,
  lastReadSize: 0,
};

// ── Setters (module-local) ──────────────────────────────────────────

export function setEditor(e: Editor | null) { editor = e; }
export function getEditor(): Editor | null { return editor; }
export function setDirtyCheckTimer(t: ReturnType<typeof setTimeout> | null) { dirtyCheckTimer = t; }
export function getDirtyCheckTimer(): ReturnType<typeof setTimeout> | null { return dirtyCheckTimer; }
export function setUpdateEventTimer(t: ReturnType<typeof setTimeout> | null) { updateEventTimer = t; }
export function getUpdateEventTimer(): ReturnType<typeof setTimeout> | null { return updateEventTimer; }
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

// ── Revision tracking ────────────────────────────────────────────────

/** Increment the document revision counter. Call on each user edit. */
export function bumpRevision(): number {
  return ++documentState.revision;
}

/** Get the current revision number. */
export function getRevision(): number {
  return documentState.revision;
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
