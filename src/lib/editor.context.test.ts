import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { undo as undoSource } from '@codemirror/commands';
const storageMocks = vi.hoisted(() => ({ cleanup: vi.fn(async () => {}), write: vi.fn(async () => {}) }));
vi.mock('./storage', () => ({ loadSettings: vi.fn(async () => ({})), getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })), cleanupPendingImages: storageMocks.cleanup, readSingleDir: vi.fn(async () => []), writeImageToStorage: storageMocks.write }));
vi.mock('./mermaid', () => ({ renderMermaid: vi.fn(async () => '<svg></svg>') }));
vi.mock('./logger', () => ({ logDebug: vi.fn(), logWarn: vi.fn(), logException: vi.fn() }));
import { initEditor } from './editor.init';
import { getMarkdown, getMarkdownResult, getSavePlan, markDocumentPersisted, setMarkdown, switchToSource, switchToWysiwyg } from './editor';
import { getDocumentState, getEditor, setEditor, assetToOriginalMap, markExternalModification, getRevision, getSourceRevision } from './editor.state';
import { attachEditorDocument, detachEditorDocument, resetEditorDocument, releaseEditorDocument } from './editor.context';
import { createSourceEditor, getSourceView, getSourceContent, destroySourceEditor } from './editor.source.facade';
import { getOpaqueRegistry, getOpaqueSession } from './editor.markdown.opaque.session';
import { scheduler } from './taskScheduler';
import { attachImageDraft, getActiveImageDraftId, copyImageToStorage, settleImageOperations, DEFAULT_IMAGE_SETTINGS } from './imageUtils';
import { store } from './store';

beforeEach(async () => {
  document.body.innerHTML = '<div id="editor-area"></div>';
  store.setState({ mode: 'wysiwyg', dirty: false, readOnly: false, autosaveErrorCount: 0, reconcileError: null });
  await initEditor();
});
afterEach(() => {
  vi.restoreAllMocks();
  destroySourceEditor();
  getEditor()?.destroy();
  setEditor(null);
  scheduler.cancelAll();
});

describe('document editor contexts', () => {
  it('synchronously clears only the outgoing editor caret after saving the exact PM state', () => {
    setMarkdown('first');
    const editor = getEditor()!;
    editor.commands.insertContentAt(2, 'X');
    editor.commands.setTextSelection(3);
    editor.view.focus();
    const saved = editor.state;
    const selection = window.getSelection()!;
    const text = editor.view.dom.querySelector('p')!.firstChild!;
    selection.setBaseAndExtent(text, 2, text, 2);
    const blur = vi.spyOn(editor.view.dom, 'blur');
    const clear = vi.spyOn(selection, 'removeAllRanges');

    const context = detachEditorDocument();

    expect(blur).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
    expect(document.activeElement).not.toBe(editor.view.dom);
    expect(selection.rangeCount).toBe(0);
    expect(context.prosemirror).toBe(saved);
    expect(context.prosemirror!.selection.anchor).toBe(3);
    resetEditorDocument();
    attachEditorDocument(context, true, true);
    // Tiptap emits a non-history focus metadata transaction on refocus.
    expect(editor.state).toEqual(saved);
    expect(editor.state.doc).toBe(saved.doc);
    expect(editor.view.hasFocus()).toBe(true);
    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe('first');
  });

  it('leaves external input focus and external DOM selection alone on detach', () => {
    const input = document.createElement('input');
    const outside = document.createElement('p');
    outside.textContent = 'external';
    document.body.append(input, outside);
    input.focus();
    input.value = 'other';
    input.setSelectionRange(1, 3);
    const selection = window.getSelection()!;
    selection.setBaseAndExtent(outside.firstChild!, 1, outside.firstChild!, 4);
    const clear = vi.spyOn(selection, 'removeAllRanges');

    detachEditorDocument();

    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(3);
    expect(clear).not.toHaveBeenCalled();
    expect(selection.toString()).toBe('xte');
  });

  it('clears the old editor range even after a file-tree control takes focus', () => {
    const editor = getEditor()!;
    const treeControl = document.createElement('button');
    document.body.append(treeControl);
    treeControl.focus();
    const paragraph = editor.view.dom.querySelector('p')!;
    const selection = window.getSelection()!;
    selection.setBaseAndExtent(paragraph, 0, paragraph, 0);

    detachEditorDocument();

    expect(document.activeElement).toBe(treeControl);
    expect(selection.rangeCount).toBe(0);
  });

  it('clears a focused source caret before destroying the source view without changing its state', async () => {
    const wrapper = document.getElementById('source-editor-wrapper')!;
    const view = (await createSourceEditor(wrapper, 'source'))!;
    store.setState({ mode: 'source' });
    view.dispatch({ changes: { from: 1, insert: 'X' }, selection: { anchor: 2 } });
    view.focus();
    const state = view.state;
    const blur = vi.spyOn(view.contentDOM, 'blur');
    const selection = window.getSelection()!;
    const text = view.contentDOM.querySelector('.cm-line')!.firstChild!;
    selection.setBaseAndExtent(text, 2, text, 2);
    const clear = vi.spyOn(selection, 'removeAllRanges');
    const destroy = vi.spyOn(view, 'destroy').mockImplementation(() => {
      expect(blur).toHaveBeenCalledOnce();
      expect(clear).toHaveBeenCalledOnce();
      expect(selection.rangeCount).toBe(0);
    });

    const context = detachEditorDocument();
    expect(context.source.state).toBe(state);
    destroy.mockRestore();
    view.destroy();
    attachEditorDocument(context, true, true);
    expect(document.activeElement).toBe(getSourceView()!.contentDOM);
    expect(getSourceView()!.state.selection.main.anchor).toBe(2);
    undoSource(getSourceView()!);
    expect(getSourceContent()).toBe('source');
  });

  it('flushes pending edits and preserves the exact PM history, selection and document metadata', () => {
    setMarkdown('first');
    getEditor()!.commands.insertContentAt(2, 'X');
    const edited = getEditor()!.state;
    getDocumentState().lastReadMtime = 42;
    assetToOriginalMap.set('asset://a', './a.png');
    const first = detachEditorDocument();
    expect(first.projection.dirty).toBe(true);
    expect(scheduler.hasPending('dirty-check')).toBe(false);
    resetEditorDocument();
    setMarkdown('second');
    getEditor()!.commands.insertContentAt(2, 'Y');
    const second = detachEditorDocument();
    attachEditorDocument(first);
    expect(getEditor()!.state).toBe(edited);
    expect(getDocumentState().lastReadMtime).toBe(42);
    expect(assetToOriginalMap.get('asset://a')).toBe('./a.png');
    getEditor()!.commands.undo();
    expect(getEditor()!.state.doc.textContent).toBe('first');
    attachEditorDocument(second);
    getEditor()!.commands.undo();
    expect(getEditor()!.state.doc.textContent).toBe('second');
  });

  it('keeps suspended opaque registries valid until their context is released', async () => {
    setMarkdown('body');
    const registry = getOpaqueRegistry();
    expect(registry).not.toBeNull();
    const first = detachEditorDocument();
    resetEditorDocument();
    setMarkdown('other');
    detachEditorDocument();
    attachEditorDocument(first);
    expect(getOpaqueRegistry()).toBe(registry);
    expect(getMarkdown()).toBe('body');
    const released = detachEditorDocument();
    await releaseEditorDocument(released);
    expect(released.opaque.registry).toBeNull();
  });

  it('destroys the CM view and restores its state with exact authored text and history', async () => {
    const wrapper = document.getElementById('source-editor-wrapper')!;
    const view = await createSourceEditor(wrapper, 'source\n\n', () => store.setState({ dirty: true }));
    store.setState({ mode: 'source' });
    view!.dispatch({ changes: { from: 1, insert: 'X' }, selection: { anchor: 2 } });
    const sourceState = view!.state;
    const first = detachEditorDocument();
    expect(getSourceView()).toBeNull();
    expect(wrapper.querySelector('.cm-editor')).toBeNull();
    resetEditorDocument();
    attachEditorDocument(first);
    expect(getSourceView()!.state.doc === sourceState.doc).toBe(true);
    expect(getSourceView()!.state.selection.main.anchor).toBe(2);
    expect(getSourceContent()).toBe('sXource\n\n');
    undoSource(getSourceView()!);
    expect(getSourceContent()).toBe('source\n\n');
    expect(store.getState().dirty).toBe(true);
  });

  it('owns pending image drafts per context and only cleans the released draft', async () => {
    storageMocks.cleanup.mockClear();
    attachImageDraft({ draftId: 'draft-A', pendingReferences: new Set(['/pending/A.png']), immediateAbsoluteReferences: new Set() });
    const first = detachEditorDocument();
    resetEditorDocument();
    attachImageDraft({ draftId: 'draft-B', pendingReferences: new Set(['/pending/B.png']), immediateAbsoluteReferences: new Set() });
    const second = detachEditorDocument();
    attachEditorDocument(first);
    expect(getActiveImageDraftId()).toBe('draft-A');
    expect(storageMocks.cleanup).not.toHaveBeenCalled();
    await releaseEditorDocument(second);
    expect(storageMocks.cleanup).toHaveBeenCalledWith('draft-B');
    expect(getActiveImageDraftId()).toBe('draft-A');
  });

  it('awaits complete immediate image writes before allowing a context snapshot', async () => {
    let finish!: () => void;
    const writing = new Promise<void>(resolve => { finish = resolve; });
    storageMocks.write.mockReturnValueOnce(writing);
    const operation = copyImageToStorage('data', 'picture.png', null, { ...DEFAULT_IMAGE_SETTINGS, storageMode: 'custom', customPath: '/images' });
    let settled = false;
    const boundary = settleImageOperations().then(() => { settled = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();
    const reference = await operation;
    await boundary;
    const context = detachEditorDocument();
    expect(context.imageDraft.immediateAbsoluteReferences.has(reference)).toBe(true);
  });

  it('commits a diagram textarea draft before snapshotting the PM state', () => {
    setMarkdown('```mermaid\ngraph TD; A-->B\n```');
    const preview = document.querySelector<HTMLElement>('.mermaid-preview');
    expect(preview).not.toBeNull();
    preview!.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    const textarea = document.querySelector<HTMLTextAreaElement>('.mermaid-popup-editor');
    expect(textarea).not.toBeNull();
    textarea!.value = 'graph TD; A-->C';
    const first = detachEditorDocument();
    expect(first.prosemirror!.doc.textContent).toContain('A-->C');
    expect(first.projection.dirty).toBe(true);
    expect(document.querySelector('.mermaid-popup-editor')).toBeNull();
  });

  it('commits formula drafts before snapshotting', () => {
    setMarkdown('before $x$ after');
    const formula = document.querySelector<HTMLElement>('[title="双击编辑公式源码"]');
    expect(formula).not.toBeNull();
    formula!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const textarea = document.querySelector<HTMLTextAreaElement>('.katex-source-editor');
    expect(textarea).not.toBeNull();
    textarea!.value = 'x^2';
    const first = detachEditorDocument();
    expect(first.prosemirror!.doc.textContent).toContain('$x^2$');
    expect(first.projection.dirty).toBe(true);
  });

  it('invalidates a pending lazy CM mount on detach', async () => {
    const wrapper = document.getElementById('source-editor-wrapper')!;
    const mounting = createSourceEditor(wrapper, 'still loading');
    store.setState({ mode: 'source' });
    const first = detachEditorDocument();
    resetEditorDocument();
    expect(await mounting).toBeNull();
    expect(wrapper.querySelector('.cm-editor')).toBeNull();
    expect(first.source.content).toBe('still loading');
  });

  it('keeps conflicted local edits readable and available in Source while blocking an unconfirmed WYS save', async () => {
    setMarkdown('body');
    getEditor()!.commands.insertContentAt(2, 'X');
    markExternalModification();
    expect(getSavePlan()).toMatchObject({ kind: 'conflict', write: false, code: 'stale-source' });
    expect(getMarkdownResult()).toMatchObject({ ok: true, markdown: 'bXody' });
    switchToSource();
    await vi.waitFor(() => expect(getSourceView()).not.toBeNull());
    expect(getSourceContent()).toBe('bXody');
    expect(getDocumentState().lastPersistedMarkdown).toBe('body');
    expect(getDocumentState().externallyModified).toBe(true);
    expect(getSavePlan()).toEqual({ kind: 'legacy' });
  });

  it.each(['confirmed overwrite', 'Save As'])('allows subsequent WYS edits after successful %s without rebuilding history', (kind) => {
    setMarkdown('body');
    getEditor()!.commands.insertContentAt(2, 'X');
    markExternalModification();
    expect(getSavePlan()).toMatchObject({ kind: 'conflict', code: 'stale-source' });
    const candidate = getMarkdownResult();
    expect(candidate.ok).toBe(true);
    if (!candidate.ok) throw new Error('Expected the local save candidate');
    const state = getEditor()!.state;
    const session = getOpaqueSession();
    if (kind === 'Save As') store.setState({ activeFilePath: '/work/copy.md' });
    markDocumentPersisted(candidate.markdown, getRevision(), getSourceRevision());
    expect(getEditor()!.state).toBe(state);
    expect(getOpaqueSession()).toBe(session);
    expect(getDocumentState().externallyModified).toBe(false);
    expect(store.getState().dirty).toBe(false);
    expect(store.getState().reconcileError).toBeNull();
    getEditor()!.commands.insertContentAt(3, 'Y');
    expect(getSavePlan()).toMatchObject({ kind: 'safe-edit', write: true, markdown: 'bXYody' });
    getEditor()!.commands.undo();
    expect(getEditor()!.state.doc.textContent).toBe('body');
  });

  it('does not rebase a conflicted session when newer edits arrived during its save', () => {
    setMarkdown('body');
    markExternalModification();
    const persistedRevision = getRevision();
    getEditor()!.commands.insertContentAt(2, 'X');
    markDocumentPersisted('body', persistedRevision);
    expect(getDocumentState().externallyModified).toBe(true);
    expect(getSavePlan()).toMatchObject({ kind: 'conflict', code: 'stale-source' });
  });

  it('preserves a newer external event arriving after the save source snapshot', () => {
    setMarkdown('body');
    getEditor()!.commands.insertContentAt(2, 'X');
    markExternalModification();
    const expectedSourceRevision = getSourceRevision();
    const candidate = getMarkdownResult();
    if (!candidate.ok) throw new Error('Expected local candidate');
    const session = getOpaqueSession();
    const sessionSourceRevision = session!.sourceRevision;
    markExternalModification();
    markDocumentPersisted(candidate.markdown, getRevision(), expectedSourceRevision);
    expect(store.getState().dirty).toBe(true);
    expect(getDocumentState().externallyModified).toBe(true);
    expect(getOpaqueSession()).toBe(session);
    expect(session!.sourceRevision).toBe(sessionSourceRevision);
    expect(getSavePlan()).toMatchObject({ kind: 'conflict', code: 'stale-source' });
  });

  it('keeps both representation scroll positions after mode changes and tab suspension', async () => {
    setMarkdown('body');
    const area = document.getElementById('editor-area')!;
    area.scrollTop = 120;
    area.scrollLeft = 15;
    switchToSource();
    await vi.waitFor(() => expect(getSourceView()).not.toBeNull());
    getSourceView()!.scrollDOM.scrollTop = 250;
    getSourceView()!.scrollDOM.scrollLeft = 30;
    switchToWysiwyg();
    expect(area.scrollTop).toBe(120);
    const first = detachEditorDocument();
    expect(first.scroll).toEqual({ top: 120, left: 15, sourceTop: 250, sourceLeft: 30 });
    resetEditorDocument();
    attachEditorDocument(first);
    expect(area.scrollTop).toBe(120);
    switchToSource();
    await vi.waitFor(() => expect(getSourceView()).not.toBeNull());
    expect(getSourceView()!.scrollDOM.scrollTop).toBe(250);
    expect(getSourceView()!.scrollDOM.scrollLeft).toBe(30);
  });

  it('starts a fresh writable editor after a read-only context', () => {
    getEditor()!.setEditable(false, false);
    store.setState({ readOnly: true });
    detachEditorDocument();
    resetEditorDocument(false);
    expect(getEditor()!.isEditable).toBe(true);
    expect(getEditor()!.state.doc.textContent).toBe('');
    expect(getDocumentState().lastPersistedMarkdown).toBe('');
  });

  it('allows the coordinator to publish the projection only after all internal state is restored', () => {
    setMarkdown('first');
    store.setState({ dirty: true, autosaveErrorCount: 3, readOnly: true });
    const first = detachEditorDocument();
    resetEditorDocument();
    const listener = vi.fn();
    store.on('editor:mode', listener);
    attachEditorDocument(first, false);
    expect(listener).not.toHaveBeenCalled();
    expect(getEditor()!.state).toBe(first.prosemirror);
    expect(store.getState().dirty).toBe(false);
    store.off('editor:mode', listener);
  });
});
