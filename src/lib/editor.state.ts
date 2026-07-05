import type { Editor } from '@tiptap/core';
import { getFileName } from './pathUtils';

// ── Shared module-level state ──────────────────────────────────────────

export let editor: Editor | null = null;
export let mode: 'wysiwyg' | 'source' = 'wysiwyg';
export let dirtyCheckTimer: ReturnType<typeof setTimeout> | null = null;
export let updateEventTimer: ReturnType<typeof setTimeout> | null = null;
export let activeDocPathOverride: string | null = null;
export let cachedSourceGutterStyles: Record<string, string> | null = null;
export const assetToOriginalMap = new Map<string, string>();

export const documentState = {
  dirty: false,
  externallyModified: false,
  programmaticUpdate: false,
  lastPersistedMarkdown: '',
};

// ── Setters ────────────────────────────────────────────────────────────

export function setEditor(e: Editor | null) { editor = e; }
export function setMode(newMode: 'wysiwyg' | 'source') { mode = newMode; }
export function setDirtyCheckTimer(t: ReturnType<typeof setTimeout> | null) { dirtyCheckTimer = t; }
export function setUpdateEventTimer(t: ReturnType<typeof setTimeout> | null) { updateEventTimer = t; }
export function setActiveDocPathOverride(p: string | null) { activeDocPathOverride = p; }
export function setCachedSourceGutterStyles(s: Record<string, string> | null) { cachedSourceGutterStyles = s; }

// ── Getters / exported API (re-exported from editor.ts as barrel) ──────

export function getEditor(): Editor | null {
  return editor;
}

export function getMode() {
  return mode;
}

export function isDocumentDirty() {
  return documentState.dirty;
}

export function hasExternalModification() {
  return documentState.externallyModified;
}

export function markExternalModification() {
  documentState.externallyModified = true;
}

export function setActiveDocumentPath(path: string | null) {
  activeDocPathOverride = path;
}

// ── Shared utility functions (used across multiple sub-modules) ────────

export function getActiveDocPath(): string | null {
  const el = document.querySelector('.tree-file.active') as HTMLElement | null;
  return el?.dataset?.path || activeDocPathOverride;
}

export function getMermaidExportBaseName() {
  const docPath = getActiveDocPath();
  if (!docPath) return 'mermaid-diagram';
  const fileName = getFileName(docPath);
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${baseName || 'mermaid-diagram'}-mermaid`;
}
