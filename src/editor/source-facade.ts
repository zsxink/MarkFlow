/**
 * Thin synchronous facade around the optional CodeMirror source editor.
 * Importing this module does not pull CodeMirror into the startup graph; the
 * implementation is loaded when source mode is first entered.
 */
import type { EditorView } from 'codemirror';
import type { EditorState } from '@codemirror/state';

type SourceModule = typeof import('./source');

let sourceModule: SourceModule | null = null;
let sourceModulePromise: Promise<SourceModule> | null = null;
let currentView: EditorView | null = null;
let currentContent = '';
let lifecycleVersion = 0;
let creatingSourceView = false;
let pendingReadOnly: boolean | undefined;
let activeOnUpdate: ((doc: string) => void) | null = null;

function loadSourceModule(): Promise<SourceModule> {
  if (sourceModule) return Promise.resolve(sourceModule);
  if (!sourceModulePromise) {
    sourceModulePromise = import('./source').then((mod) => {
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
  activeOnUpdate = onUpdate;
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
      activeOnUpdate?.(doc);
    }, effectiveReadOnly);
    currentView = view;
    return view;
  } finally {
    creatingSourceView = false;
  }
}

export function destroySourceEditor(): void {
  activeOnUpdate = null;
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

export interface SourceDocumentContext {
  state: EditorState | null;
  content: string;
  onUpdate: ((doc: string) => void) | null;
}
export function detachSourceDocument(): SourceDocumentContext {
  const context = { state: currentView?.state ?? null, content: getSourceContent(), onUpdate: activeOnUpdate };
  destroySourceEditor();
  activeOnUpdate = null;
  return context;
}
export function attachSourceDocument(context: SourceDocumentContext, container: HTMLElement, readOnly: boolean): void {
  currentContent = context.content;
  activeOnUpdate = context.onUpdate;
  if (context.state && sourceModule) {
    lifecycleVersion += 1;
    currentView = sourceModule.restoreSourceEditor(container, context.state);
    sourceModule.setSourceReadOnly(readOnly);
    return;
  }
  void createSourceEditor(container, context.content, context.onUpdate, readOnly).catch(() => {});
}
