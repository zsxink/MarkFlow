import { EditorState } from '@tiptap/pm/state';
import type { StoreState } from '../types/events';
import { refreshFrontmatterPanel } from '../components/frontmatterPanel';
import { advanceEditorDocumentVersion, assetToOriginalMap, getDocumentState, getEditor, resetDocumentState, withProgrammaticUpdate, type DocumentState } from './editor.state';
import { detachSourceDocument, attachSourceDocument, destroySourceEditor, type SourceDocumentContext } from './editor.source.facade';
import { attachOpaqueSession, detachOpaqueSession, releaseOpaqueSession, type OpaqueSessionContext } from './editor.markdown.opaque.session';
import { attachImageDraft, detachImageDraft, releaseImageDraft, type ImageDraftContext } from './imageUtils';
import { scheduler } from './taskScheduler';
import { store } from './store';

export type EditorDocumentProjection = Pick<StoreState, 'mode' | 'dirty' | 'readOnly' | 'autosaveErrorCount' | 'reconcileError'>;
export interface EditorDocumentContext {
  prosemirror: EditorState | null;
  source: SourceDocumentContext;
  documentState: DocumentState;
  projection: EditorDocumentProjection;
  assets: Map<string, string>;
  imageDraft: ImageDraftContext;
  opaque: OpaqueSessionContext;
  scroll: { top: number; left: number; sourceTop: number; sourceLeft: number };
}

export function flushEditorDirtyCheck(): void { scheduler.flush('dirty-check'); }
function cancelDocumentTasks(): void {
  for (const key of ['dirty-check', 'editor-update', 'source-update', 'line-numbers']) scheduler.cancel(key);
}
function showMode(mode: EditorDocumentProjection['mode']): void {
  const source = mode === 'source';
  document.getElementById('editor-area')?.classList.toggle('source-mode', source);
  const wysiwyg = document.getElementById('wysiwyg-editor');
  const wrapper = document.getElementById('source-editor-wrapper');
  if (wysiwyg) wysiwyg.hidden = source;
  if (wrapper) wrapper.hidden = !source;
}

/** Commit authored NodeView text before a save/close confirmation reads dirty. */
export function commitEditorDocumentDrafts(): void {
  document.querySelectorAll('.mermaid-popup-editor, .katex-source-editor').forEach(el => {
    el.dispatchEvent(new Event('markflow:commit-draft'));
  });
}

/** Caller first awaits the shared document-operation / image boundary. */
export function detachEditorDocument(): EditorDocumentContext {
  commitEditorDocumentDrafts();
  document.dispatchEvent(new Event('markflow:detach-document'));
  advanceEditorDocumentVersion();
  flushEditorDirtyCheck();
  cancelDocumentTasks();
  const state = store.getState();
  const area = document.getElementById('editor-area');
  const sourceScroller = document.querySelector<HTMLElement>('#source-editor-wrapper .cm-scroller');
  const documentState = getDocumentState();
  if (state.mode === 'wysiwyg' && area) {
    documentState.wysiwygScrollTop = area.scrollTop;
    documentState.wysiwygScrollLeft = area.scrollLeft;
  }
  if (sourceScroller) {
    documentState.sourceScrollTop = sourceScroller.scrollTop;
    documentState.sourceScrollLeft = sourceScroller.scrollLeft;
  }
  const context: EditorDocumentContext = {
    prosemirror: getEditor()?.state ?? null,
    source: detachSourceDocument(),
    documentState: { ...getDocumentState() },
    projection: { mode: state.mode, dirty: state.dirty, readOnly: state.readOnly, autosaveErrorCount: state.autosaveErrorCount, reconcileError: state.reconcileError },
    assets: new Map(assetToOriginalMap),
    imageDraft: detachImageDraft(),
    opaque: detachOpaqueSession(),
    scroll: { top: documentState.wysiwygScrollTop, left: documentState.wysiwygScrollLeft, sourceTop: documentState.sourceScrollTop, sourceLeft: documentState.sourceScrollLeft },
  };
  return context;
}

/** Restore live state first; publish=false lets the coordinator add its path atomically. */
export function attachEditorDocument(context: EditorDocumentContext, publish = true): void {
  advanceEditorDocumentVersion();
  cancelDocumentTasks();
  Object.assign(getDocumentState(), context.documentState);
  assetToOriginalMap.clear();
  for (const [asset, original] of context.assets) assetToOriginalMap.set(asset, original);
  attachImageDraft(context.imageDraft);
  attachOpaqueSession(context.opaque);
  const editor = getEditor();
  if (editor && context.prosemirror) {
    withProgrammaticUpdate(() => editor.view.updateState(context.prosemirror!));
    editor.setEditable(!context.projection.readOnly, false);
  }
  destroySourceEditor();
  const wrapper = document.getElementById('source-editor-wrapper');
  if (wrapper && context.projection.mode === 'source') attachSourceDocument(context.source, wrapper, context.projection.readOnly);
  showMode(context.projection.mode);
  const area = document.getElementById('editor-area');
  if (area) { area.scrollTop = context.scroll.top; area.scrollLeft = context.scroll.left; }
  const scroller = document.querySelector<HTMLElement>('#source-editor-wrapper .cm-scroller');
  if (scroller) { scroller.scrollTop = context.scroll.sourceTop; scroller.scrollLeft = context.scroll.sourceLeft; }
  if (publish) {
    store.setState(context.projection);
    refreshFrontmatterPanel();
    store.emit({ type: 'editor:update' });
  }
}

/** Fresh plugin state also gives every newly opened document a fresh undo stack. */
export function resetEditorDocument(publish = true): void {
  advanceEditorDocumentVersion();
  cancelDocumentTasks();
  destroySourceEditor();
  resetDocumentState();
  assetToOriginalMap.clear();
  attachOpaqueSession({ registry: null, session: null });
  attachImageDraft({ draftId: null, pendingReferences: new Set(), immediateAbsoluteReferences: new Set() });
  const editor = getEditor();
  if (editor) {
    const current = editor.state;
    withProgrammaticUpdate(() => editor.view.updateState(EditorState.create({ schema: current.schema, plugins: current.plugins })));
    editor.setEditable(true, false);
  }
  showMode('wysiwyg');
  const area = document.getElementById('editor-area');
  if (area) { area.scrollTop = 0; area.scrollLeft = 0; }
  if (publish) store.setState({ mode: 'wysiwyg', dirty: false, readOnly: false, autosaveErrorCount: 0, reconcileError: null });
}

export async function releaseEditorDocument(context: EditorDocumentContext): Promise<void> {
  releaseOpaqueSession(context.opaque);
  await releaseImageDraft(context.imageDraft);
  context.assets.clear();
  context.prosemirror = null;
  context.source.state = null;
  context.source.content = '';
  context.source.onUpdate = null;
}
