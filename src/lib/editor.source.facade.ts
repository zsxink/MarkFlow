/**
 * Thin synchronous facade around the optional CodeMirror source editor.
 * Importing this module does not pull CodeMirror into the startup graph; the
 * implementation is loaded when source mode is first entered.
 */
import type { EditorView } from 'codemirror';

type SourceModule = typeof import('./editor.source');

let sourceModule: SourceModule | null = null;
let sourceModulePromise: Promise<SourceModule> | null = null;
let currentView: EditorView | null = null;
let currentContent = '';
let lifecycleVersion = 0;
let creatingSourceView = false;
let pendingReadOnly: boolean | undefined;

function loadSourceModule(): Promise<SourceModule> {
  if (sourceModule) return Promise.resolve(sourceModule);
  if (!sourceModulePromise) {
    sourceModulePromise = import('./editor.source').then((mod) => {
      sourceModule = mod;
      return mod;
    }).catch((error: unknown) => {
      // A transient chunk-load failure must not poison later attempts.
      sourceModulePromise = null;
      throw error;
    });
  }
  return sourceModulePromise;
}

export async function createSourceEditor(
  container: HTMLElement,
  content: string,
  onUpdate: ((doc: string) => void) | null = null,
  readOnly = false,
): Promise<EditorView | null> {
  const version = ++lifecycleVersion;
  creatingSourceView = true;
  currentContent = content;
  let mod: SourceModule;
  try {
    mod = await loadSourceModule();
  } catch (error) {
    if (version === lifecycleVersion) {
      creatingSourceView = false;
      pendingReadOnly = undefined;
    }
    throw error;
  }
  // Mode can change while the source-mode chunk is loading. Ignore an obsolete
  // request so it cannot mount a hidden editor after returning to WYSIWYG.
  if (version !== lifecycleVersion) return null;
  const effectiveReadOnly = pendingReadOnly ?? readOnly;
  pendingReadOnly = undefined;
  const latestContent = currentContent;
  try {
    const view = mod.createSourceEditor(container, latestContent, (doc) => {
      currentContent = doc;
      onUpdate?.(doc);
    }, effectiveReadOnly);
    currentView = view;
    return view;
  } finally {
    creatingSourceView = false;
  }
}

export function destroySourceEditor(): void {
  lifecycleVersion += 1;
  creatingSourceView = false;
  pendingReadOnly = undefined;
  sourceModule?.destroySourceEditor();
  currentView = null;
  currentContent = '';
}

export function getSourceView(): EditorView | null {
  return currentView;
}

export function getSourceContent(): string {
  return currentView?.state.doc.toString() ?? currentContent;
}

export function setSourceContent(content: string): void {
  currentContent = content;
  sourceModule?.setSourceContent(content);
}

export function setSourceReadOnly(readOnly: boolean): void {
  if (currentView) sourceModule?.setSourceReadOnly(readOnly);
  else if (creatingSourceView) pendingReadOnly = readOnly;
}

export function setSourceSoftWrap(enabled: boolean): void {
  sourceModule?.setSourceSoftWrap(enabled);
}

export function setSourceHighlight(enabled: boolean): void {
  sourceModule?.setSourceHighlight(enabled);
}
