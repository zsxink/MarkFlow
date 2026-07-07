import type { EditorMode } from '../types/editor';
import type { Editor } from '@tiptap/core';
import { getFileName } from './pathUtils';
import { store } from './store';

// ── Module-level state (editor-internal, not in global Store) ────────

export let editor: Editor | null = null;
export let dirtyCheckTimer: ReturnType<typeof setTimeout> | null = null;
export let updateEventTimer: ReturnType<typeof setTimeout> | null = null;
export const assetToOriginalMap = new Map<string, string>();

export const documentState = {
  externallyModified: false,
  programmaticUpdate: false,
  lastPersistedMarkdown: '',
};

// ── Setters (module-local) ──────────────────────────────────────────

export function setEditor(e: Editor | null) { editor = e; }
export function getEditor(): Editor | null { return editor; }
export function setDirtyCheckTimer(t: ReturnType<typeof setTimeout> | null) { dirtyCheckTimer = t; }
export function setUpdateEventTimer(t: ReturnType<typeof setTimeout> | null) { updateEventTimer = t; }

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

// ── Cached gutter styles (migrated to Store) ────────────────────────

export function setCachedSourceGutterStyles(s: Record<string, string> | null) {
  store.setState({ cachedSourceGutterStyles: s });
}

export function getCachedSourceGutterStyles() {
  return store.getState().cachedSourceGutterStyles;
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
