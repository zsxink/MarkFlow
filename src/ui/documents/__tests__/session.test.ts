import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { undo as undoSource } from '@codemirror/commands';
const mocks = vi.hoisted(() => ({
  files: new Map<string, string>(), stats: new Map<string, { mtime: number; size: number }>(),
  dialog: vi.fn(), save: vi.fn(), toast: vi.fn(), write: vi.fn(), read: vi.fn(), cleanup: vi.fn(),
  authorizePreviewDirectory: vi.fn(),
}));
vi.mock('../../../infra/storage', () => ({
  loadSettings: vi.fn(async () => ({})), getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })),
  cleanupPendingImages: mocks.cleanup, authorizeImageStorage: vi.fn(async () => {}), addRecentFile: vi.fn(async () => {}),
  authorizePreviewDirectory: mocks.authorizePreviewDirectory,
  getFileMetadata: vi.fn(async (path: string) => {
    if (!mocks.files.has(path)) throw new Error('not found');
    return { size: mocks.files.get(path)!.length, lines: 2 };
  }),
  readFile: mocks.read, writeFile: mocks.write, writeFileIfUnchanged: mocks.write,
}));
vi.mock('../../file-tree/index', () => ({ suppressNextWatcherRefresh: vi.fn(), cancelSuppressedWatcherRefresh: vi.fn(), applyFileTreeEvents: vi.fn() }));
vi.mock('../../outline', () => ({ refreshOutline: vi.fn() }));
vi.mock('../../frontmatter-panel', () => ({ mountFrontmatterPanel: vi.fn(), refreshFrontmatterPanel: vi.fn() }));
vi.mock('../../toast', () => ({ showToast: mocks.toast }));
vi.mock('../../dialog', () => ({ showDialog: mocks.dialog }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save, open: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async (_command: string, { path }: { path: string }) => {
  const stats = mocks.stats.get(path);
  if (!stats) throw new Error('file not found');
  return stats;
}), convertFileSrc: (path: string) => `asset://${path}` }));
vi.mock('../../../infra/logger', () => ({ logDebug: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn(), logException: vi.fn() }));
import { getCachedSettings } from '../../../infra/storage';
import { DEFAULT_SETTINGS } from '../../../types/settings';
import { initEditor } from '../../../editor';
import { getMarkdown, switchToSource, switchToWysiwyg, getSavePlan } from '../../../editor';
import { getEditor, setEditor, getDocumentState, getActiveDocPath } from '../../../editor';
import { scheduler } from '../../../infra/task-scheduler';
import { store } from '../../../infra/store';
import { getSourceView, getSourceContent, destroySourceEditor } from '../../../editor';
import { confirmDocumentTransitionInOperation, openFileInEditor, saveActiveDocument } from '../../sidebar/fileops';
import { registerUiPorts, resetUiPorts } from '../../../infra/ui-ports';
import {
  handleActiveDocumentExternalModificationInOperation,
  handleExternalDeletionInOperation,
} from '../../sidebar/conflict';
import {
  activateDocumentTab, closeDocumentTab, getDocumentTabs, getActiveTabId, newDocumentTab,
  reopenClosedDocumentTab, destroyDocumentSessions, confirmAllDocumentTabsClose, closeAllDocumentTabs, routeDocumentExternalChanges,
  rewriteDocumentTabPaths, cycleDocumentTab,
  initDocumentSessions, openDocumentTab, openImagePreviewTab, MAX_DOCUMENT_TABS,
} from '../session';
import { isDocumentOperationPending, runDocumentOperation } from '../../../infra/document-operations';
import { attachImageDraft } from '../../../infra/images/core';

function file(path: string, content: string, mtime = 1) {
  mocks.files.set(path, content);
  mocks.stats.set(path, { mtime, size: content.length });
}
function id(path: string) { return getDocumentTabs().find(tab => tab.path === path)!.id; }
async function sourceReady() { await vi.waitFor(() => expect(getSourceView()).not.toBeNull()); return getSourceView()!; }
beforeEach(async () => {
  mocks.files.clear(); mocks.stats.clear(); vi.clearAllMocks();
  vi.mocked(getCachedSettings).mockReturnValue(DEFAULT_SETTINGS);
  mocks.dialog.mockResolvedValue('keep'); mocks.cleanup.mockResolvedValue(undefined);
  mocks.read.mockImplementation(async (path: string) => {
    if (!mocks.files.has(path)) throw new Error('not found');
    return mocks.files.get(path)!;
  });
  mocks.write.mockImplementation(async (path: string, content: string) => { file(path, content, 2); });
  // The document session reports through injected UI ports; register the real
  // UI implementations so behaviour matches production.
  resetUiPorts();
  registerUiPorts({
    notify: mocks.toast,
    openDocument: openFileInEditor,
    confirmDocumentTransition: confirmDocumentTransitionInOperation,
    handleExternalDeletion: handleExternalDeletionInOperation,
    handleExternalModification: handleActiveDocumentExternalModificationInOperation,
  });
  document.body.innerHTML = '<div id="editor-area"></div><div class="tree-file" data-path="/a.md"></div>';
  store.setState({ mode: 'wysiwyg', activeFilePath: null, dirty: false, readOnly: false, autosaveErrorCount: 0, reconcileError: null });
  await initEditor();
  file('/a.md', 'alpha'); file('/b.md', 'beta'); file('/c.md', '<!-- keep -->\n\ncharlie');
});
afterEach(async () => {
  await destroyDocumentSessions();
  resetUiPorts();
  destroySourceEditor(); getEditor()?.destroy(); setEditor(null); scheduler.cancelAll();
});

describe('document session lifecycle with the production editor and file operations', () => {
  it('clears the startup blank caret before first file content replaces the live DOM, then retires the empty startup tab', async () => {
    await initDocumentSessions();
    const editor = getEditor()!;
    await vi.waitFor(() => expect(editor.view.hasFocus()).toBe(true));
    const saved = editor.state;
    const selection = window.getSelection()!;
    const paragraph = editor.view.dom.querySelector('p')!;
    selection.setBaseAndExtent(paragraph, 0, paragraph, 0);
    const update = editor.view.updateState.bind(editor.view);
    let checked = false;
    const replacement = vi.spyOn(editor.view, 'updateState').mockImplementation(state => {
      if (!checked && state.doc !== saved.doc) {
        checked = true;
        expect(selection.rangeCount).toBe(0);
        expect(document.activeElement).not.toBe(editor.view.dom);
      }
      update(state);
    });
    try {
      expect(await openFileInEditor('/a.md')).toBe(true);
      expect(checked).toBe(true);
      expect(editor.view.hasFocus()).toBe(true);
      // The still-empty startup tab is retired by the successful open; the
      // opened document becomes the only active tab.
      expect(getDocumentTabs()).toHaveLength(1);
      expect(getDocumentTabs()[0].path).toBe('/a.md');
      expect(getActiveTabId()).toBe(getDocumentTabs()[0].id);
    } finally { replacement.mockRestore(); }
  });

  it.each(['wysiwyg', 'source'] as const)('restores %s editing focus, model selection and history after a failed open commit', async mode => {
    await openFileInEditor('/a.md');
    const tab = getActiveTabId();
    const editor = getEditor()!;
    editor.commands.insertContentAt(2, 'X');
    editor.commands.setTextSelection(3);
    if (mode === 'source') {
      switchToSource();
      const source = await sourceReady();
      source.dispatch({ changes: { from: 2, insert: 'Y' }, selection: { anchor: 3 } });
      source.focus();
    } else editor.view.focus();
    const saved = editor.state;
    const sourceState = getSourceView()?.state;

    await expect(openDocumentTab('/failed.md', async () => () => { throw new Error('commit failed'); })).rejects.toThrow('commit failed');

    expect(getActiveTabId()).toBe(tab);
    expect(getDocumentTabs()).toHaveLength(1);
    expect(store.getState().mode).toBe(mode);
    expect(editor.state).toEqual(saved);
    expect(editor.state.doc).toBe(saved.doc);
    if (mode === 'source') {
      const source = getSourceView()!;
      expect(document.activeElement).toBe(source.contentDOM);
      expect(source.state.doc).toBe(sourceState!.doc);
      expect(source.state.selection.main.anchor).toBe(3);
      undoSource(source);
      expect(getSourceContent()).toBe('aXlpha');
    } else {
      expect(editor.view.hasFocus()).toBe(true);
      expect(editor.state.selection.anchor).toBe(3);
      editor.commands.undo();
      expect(getMarkdown()).toBe('alpha');
    }
  });

  it('transfers editing focus across WYSIWYG and source sessions without stealing tab-control focus', async () => {
    await openFileInEditor('/a.md');
    getEditor()!.commands.setTextSelection(3);
    await openFileInEditor('/b.md');
    switchToSource();
    const source = await sourceReady();
    source.dispatch({ selection: { anchor: 2 } });
    source.focus();
    const windowFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    try {
      await activateDocumentTab(id('/a.md'));
      expect(getEditor()!.view.hasFocus()).toBe(true);
      expect(getEditor()!.state.selection.anchor).toBe(3);
      await activateDocumentTab(id('/b.md'));
      expect(document.activeElement).toBe(getSourceView()!.contentDOM);
      expect(getSourceView()!.state.selection.main.anchor).toBe(2);

      const tabControl = document.createElement('button');
      document.body.append(tabControl);
      tabControl.focus();
      await activateDocumentTab(id('/a.md'));
      expect(document.activeElement).toBe(tabControl);
      expect(getEditor()!.view.hasFocus()).toBe(false);
    } finally { windowFocus.mockRestore(); }
  });

  it('keeps editing focus on a close neighbour and preserves external control focus on file open', async () => {
    await newDocumentTab();
    const blank = getActiveTabId()!;
    await openFileInEditor('/a.md');
    getEditor()!.view.focus();
    await closeDocumentTab(id('/a.md'));
    expect(getActiveTabId()).toBe(blank);
    expect(getEditor()!.view.hasFocus()).toBe(true);

    const control = document.createElement('input');
    document.body.append(control);
    control.focus();
    await openFileInEditor('/b.md');
    expect(document.activeElement).toBe(control);
  });

  it('preserves three full editor states, mode, undo, selections and opaque raw text without switch confirmation', async () => {
    await openFileInEditor('/a.md');
    getEditor()!.commands.insertContentAt(2, 'X');
    const first = getEditor()!.state;
    await openFileInEditor('/b.md');
    switchToSource();
    const source = await sourceReady();
    source.dispatch({ changes: { from: 1, insert: 'Y' }, selection: { anchor: 2 } });
    await openFileInEditor('/c.md');
    expect(getMarkdown()).toContain('<!-- keep -->');
    const third = getMarkdown();
    await activateDocumentTab(id('/a.md'));
    expect(getEditor()!.state).toEqual(first);
    expect(getEditor()!.state.doc).toBe(first.doc);
    expect(store.getState().dirty).toBe(true);
    getEditor()!.commands.undo();
    expect(getMarkdown()).toBe('alpha');
    await activateDocumentTab(id('/b.md'));
    expect(store.getState().mode).toBe('source');
    expect(getSourceContent()).toBe('bYeta');
    expect(getSourceView()!.state.selection.main.anchor).toBe(2);
    undoSource(getSourceView()!);
    expect(getSourceContent()).toBe('beta');
    await activateDocumentTab(id('/c.md'));
    expect(getMarkdown()).toBe(third);
    expect(mocks.dialog).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.cm-editor')).toHaveLength(0);
  });

  it('deduplicates normalized paths, rolls back failed reads, and refuses to exceed the tab cap', async () => {
    await openFileInEditor('/a.md');
    getEditor()!.commands.insertContentAt(2, 'X');
    await openFileInEditor('/b.md');
    await openFileInEditor('/tmp/../a.md');
    expect(getDocumentTabs()).toHaveLength(2);
    expect(getMarkdown()).toContain('X');
    const active = getActiveTabId();
    await expect(openFileInEditor('/missing.md')).resolves.toBe(false);
    expect(getActiveTabId()).toBe(active);
    expect(getMarkdown()).toContain('X');
    // The requirement pins the ceiling at 20 open documents per window, so the
    // regression asserts that literal rather than echoing the implementation
    // constant back at itself.
    expect(MAX_DOCUMENT_TABS).toBe(20);
    for (let index = 0; index < 18; index++) await newDocumentTab();
    const last = getActiveTabId();
    expect(getDocumentTabs()).toHaveLength(20);
    await expect(openFileInEditor('/c.md')).resolves.toBe(false);
    expect(getDocumentTabs()).toHaveLength(20);
    expect(getActiveTabId()).toBe(last);
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('20'));
    await activateDocumentTab(id('/a.md'));
    expect(getMarkdown()).toContain('X');
  });

  it('closes background tabs without moving the active tab, selects the right neighbour and restores disk versions', async () => {
    await openFileInEditor('/a.md'); await openFileInEditor('/b.md'); await openFileInEditor('/c.md');
    const c = getActiveTabId();
    await closeDocumentTab(id('/b.md'));
    expect(getActiveTabId()).toBe(c);
    await reopenClosedDocumentTab();
    expect(store.getState().activeFilePath).toBe('/b.md');
    await activateDocumentTab(id('/a.md'));
    getEditor()!.commands.insertContentAt(2, 'unsaved');
    await activateDocumentTab(c!);
    mocks.dialog.mockResolvedValue('cancel');
    expect(await closeDocumentTab(id('/a.md'))).toBe(false);
    expect(getActiveTabId()).toBe(c);
    mocks.dialog.mockResolvedValue('discard');
    expect(await closeDocumentTab(id('/a.md'))).toBe(true);
    expect(getActiveTabId()).toBe(c);
    await reopenClosedDocumentTab();
    expect(getMarkdown()).toBe('alpha');
    await activateDocumentTab(c!);
    await closeDocumentTab(c!);
    expect(store.getState().activeFilePath).toBe('/b.md');
  });

  it('keeps tab state coherent when pending-image cleanup fails during close', async () => {
    await openFileInEditor('/a.md');
    attachImageDraft({ draftId: 'draft-A', pendingReferences: new Set(['/pending/A.png']), immediateAbsoluteReferences: new Set() });
    await openFileInEditor('/b.md');
    mocks.cleanup.mockRejectedValue(new Error('cleanup failed'));

    await expect(closeDocumentTab(id('/a.md'))).resolves.toBe(true);
    expect(getDocumentTabs().map(tab => tab.path)).toEqual(['/b.md']);
    expect(getActiveTabId()).toBe(id('/b.md'));
    expect(getMarkdown()).toBe('beta');
  });

  it('resolves active image paths from the restored document before the file-tree highlight updates', async () => {
    file('/one/a.md', '![one](images/photo.png)');
    file('/two/b.md', '![two](images/photo.png)');
    await openFileInEditor('/one/a.md');
    await openFileInEditor('/two/b.md');
    document.querySelectorAll('.tree-file').forEach(node => node.classList.remove('active'));
    const oldTreeNode = document.createElement('div');
    oldTreeNode.className = 'tree-file active';
    oldTreeNode.dataset.path = '/two/b.md';
    document.body.append(oldTreeNode);

    let pathDuringProjection: string | null = null;
    let oldPathDuringProjection: string | undefined;
    const observeActivePath = () => {
      pathDuringProjection = getActiveDocPath();
      oldPathDuringProjection = document.querySelector<HTMLElement>('.tree-file.active')?.dataset.path;
    };
    store.on('file:active', observeActivePath);
    await activateDocumentTab(id('/one/a.md'));
    store.off('file:active', observeActivePath);

    expect(oldPathDuringProjection).toBe('/two/b.md');
    expect(pathDuringProjection).toBe('/one/a.md');
    expect(oldTreeNode.classList.contains('active')).toBe(false);
  });

  it('empties the window coherently when pending-image cleanup fails during close-all', async () => {
    await openFileInEditor('/a.md');
    attachImageDraft({ draftId: 'draft-A', pendingReferences: new Set(['/pending/A.png']), immediateAbsoluteReferences: new Set() });
    await openFileInEditor('/b.md');
    mocks.cleanup.mockRejectedValue(new Error('cleanup failed'));

    await expect(closeAllDocumentTabs()).resolves.toBe(true);
    expect(getDocumentTabs()).toHaveLength(0);
    expect(getActiveTabId()).toBeNull();
    expect(store.getState().activeFilePath).toBeNull();
    expect(getMarkdown()).toBe('');
  });

  it('keeps tabs when save is cancelled or fails and checks each dirty tab before a window can close', async () => {
    await newDocumentTab();
    getEditor()!.commands.insertContent('draft');
    mocks.dialog.mockResolvedValue('save'); mocks.save.mockResolvedValue(null);
    expect(await closeDocumentTab(getActiveTabId()!)).toBe(false);
    expect(getDocumentTabs()).toHaveLength(1);
    await openFileInEditor('/a.md'); getEditor()!.commands.insertContentAt(2, 'X');
    mocks.write.mockRejectedValue(new Error('no permission'));
    expect(await closeDocumentTab(getActiveTabId()!)).toBe(false);
    mocks.dialog.mockResolvedValueOnce('discard').mockResolvedValueOnce('cancel');
    expect(await confirmAllDocumentTabsClose()).toBe(false);
    expect(getDocumentTabs()).toHaveLength(2);
    expect(getMarkdown()).toContain('X');
  });

  it('commits the only tab’s unconfirmed diagram draft before close or whole-window confirmation', async () => {
    file('/diagram.md', '```mermaid\ngraph TD; A-->B\n```');
    await openFileInEditor('/diagram.md');
    expect(store.getState().dirty).toBe(false);
    document.querySelector<HTMLElement>('.mermaid-preview')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const draft = document.querySelector<HTMLTextAreaElement>('.mermaid-popup-editor')!;
    expect(draft).not.toBeNull();
    draft.value = 'graph TD; A-->C';
    mocks.dialog.mockResolvedValue('cancel');
    expect(await closeDocumentTab(getActiveTabId()!)).toBe(false);
    expect(getDocumentTabs()).toHaveLength(1);
    expect(getMarkdown()).toContain('A-->C');
    expect(store.getState().dirty).toBe(true);
    expect(mocks.dialog).toHaveBeenCalledOnce();
    // Window close also flushes a draft without first changing active identity.
    await saveActiveDocument();
    mocks.dialog.mockClear();
    document.querySelector<HTMLElement>('.mermaid-preview')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    document.querySelector<HTMLTextAreaElement>('.mermaid-popup-editor')!.value = 'graph TD; A-->D';
    expect(await confirmAllDocumentTabsClose()).toBe(false);
    expect(getMarkdown()).toContain('A-->D');
    expect(mocks.dialog).toHaveBeenCalledOnce();
  });

  it('empties the last tab without an editable ghost document and does not restore discarded untitled text', async () => {
    await newDocumentTab(); const tab = getActiveTabId()!;
    getEditor()!.commands.insertContent('discarded secret');
    mocks.dialog.mockResolvedValue('discard');
    await closeDocumentTab(tab);
    expect(getDocumentTabs()).toHaveLength(0);
    expect(getEditor()!.isEditable).toBe(false);
    expect(store.getState().dirty).toBe(false);
    expect(store.getState().activeFilePath).toBeNull();
    expect(document.getElementById('document-empty-state')).not.toBeNull();
    expect(await reopenClosedDocumentTab()).toBe(false);
    await newDocumentTab();
    expect(getEditor()!.isEditable).toBe(true);
    expect(getMarkdown()).toBe('');
  });

  it('keeps background changes in memory and detects standalone disk changes on activation', async () => {
    await openFileInEditor('/a.md'); getEditor()!.commands.insertContentAt(2, 'X');
    await openFileInEditor('/b.md');
    file('/a.md', 'external', 7);
    await routeDocumentExternalChanges([{ path: '/a.md', kind: 'modify' }]);
    expect(mocks.dialog).not.toHaveBeenCalled();
    await activateDocumentTab(id('/a.md'));
    expect(getMarkdown()).toContain('X');
    expect(getDocumentState().externallyModified).toBe(true);
    expect(mocks.dialog).toHaveBeenCalled();
    expect(await saveActiveDocument({ interactive: false })).toBe('skipped');
    expect(mocks.files.get('/a.md')).toBe('external');
    await activateDocumentTab(id('/b.md'));
    file('/b.md', 'updated standalone', 9);
    await activateDocumentTab(id('/a.md'));
    await activateDocumentTab(id('/b.md'));
    expect(getMarkdown()).toBe('updated standalone');
  });

  it('routes directory deletion to every matching tab and keeps deleted content without recreating files', async () => {
    file('/notes/a.md', 'one'); file('/notes/b.md', 'two');
    await openFileInEditor('/notes/a.md'); await openFileInEditor('/notes/b.md'); await openFileInEditor('/c.md');
    mocks.files.delete('/notes/a.md'); mocks.files.delete('/notes/b.md');
    mocks.stats.delete('/notes/a.md'); mocks.stats.delete('/notes/b.md');
    await routeDocumentExternalChanges([{ path: '/notes', kind: 'delete' }]);
    expect(mocks.dialog).not.toHaveBeenCalled();
    await activateDocumentTab(id('/notes/a.md'));
    expect(getMarkdown()).toBe('one');
    expect(getDocumentState().externallyModified).toBe(true);
    expect(await saveActiveDocument({ interactive: false })).toBe('skipped');
    expect(mocks.write).not.toHaveBeenCalled();
    await activateDocumentTab(id('/notes/b.md'));
    expect(getMarkdown()).toBe('two');
    expect(mocks.dialog).toHaveBeenCalledTimes(2);
  });

  it('rewrites all matching paths, but not similarly named sibling directories', async () => {
    file('/notes/a.md', 'one'); file('/notes/sub/b.md', 'two'); file('/notes-old/c.md', 'three');
    await openFileInEditor('/notes/a.md'); await openFileInEditor('/notes/sub/b.md'); await openFileInEditor('/notes-old/c.md');
    rewriteDocumentTabPaths('/notes', '/renamed');
    expect(getDocumentTabs().map(tab => tab.path)).toEqual(['/renamed/a.md', '/renamed/sub/b.md', '/notes-old/c.md']);
    expect(store.getState().activeFilePath).toBe('/notes-old/c.md');
  });

  it('keeps renamed background file baselines, undo and relative image references usable at the new path', async () => {
    file('/old/note.md', '# Note\n\n![sample](images/sample.png)');
    await openFileInEditor('/old/note.md');
    const note = getActiveTabId()!;
    await openFileInEditor('/b.md');
    file('/moved/note.md', mocks.files.get('/old/note.md')!);
    mocks.files.delete('/old/note.md'); mocks.stats.delete('/old/note.md');
    rewriteDocumentTabPaths('/old', '/moved');
    await activateDocumentTab(note);
    expect(getDocumentState().lastReadStatsKnown).toBe(true);
    expect(document.querySelector('img')?.getAttribute('src')).toBe('asset:///moved/images/sample.png');
    expect(getMarkdown()).toContain('images/sample.png');
    getEditor()!.commands.insertContentAt(2, 'X');
    expect(await saveActiveDocument()).toBe('saved');
    expect(mocks.files.get('/moved/note.md')).toContain('images/sample.png');
    expect(mocks.files.get('/moved/note.md')).toContain('X');
    getEditor()!.commands.undo();
    expect(getMarkdown()).not.toContain('X');
    // The active file may move again without rebuilding its PM state.
    rewriteDocumentTabPaths('/moved', '/again');
    expect(document.querySelector('img')?.getAttribute('src')).toBe('asset:///again/images/sample.png');
  });

  it('waits for a save and its dialog before switching, keeping write results on the original document', async () => {
    await newDocumentTab(); getEditor()!.commands.insertContent('first draft');
    let release!: (path: string) => void;
    mocks.save.mockReturnValue(new Promise<string>(resolve => { release = resolve; }));
    const saving = saveActiveDocument();
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalled());
    const opening = openFileInEditor('/b.md');
    expect(isDocumentOperationPending()).toBe(true);
    expect(store.getState().activeFilePath).toBeNull();
    release('/saved.md');
    expect(await saving).toBe('saved');
    await opening;
    expect(mocks.files.get('/saved.md')).toContain('first draft');
    expect(getMarkdown()).toBe('beta');
    expect(store.getState().activeFilePath).toBe('/b.md');
    await activateDocumentTab(id('/saved.md'));
    expect(store.getState().dirty).toBe(false);
    expect(getMarkdown()).toContain('first draft');
  });

  it('persists formulas appended in Source after switching a suspended document back to WYSIWYG', async () => {
    await openFileInEditor('/a.md');
    getEditor()!.commands.insertContentAt(2, 'edited');
    expect(await saveActiveDocument()).toBe('saved');
    await openFileInEditor('/b.md');
    await activateDocumentTab(id('/a.md'));
    switchToSource();
    const source = await sourceReady();
    source.dispatch({ changes: { from: source.state.doc.length, insert: '\n\nMath: $E=mc^2$ and block\n\n$$\n\\frac{a}{b}\n$$\n' } });
    expect(store.getState().dirty).toBe(true);
    switchToWysiwyg();
    expect(getSavePlan().kind).toBe('safe-edit');
    expect(await saveActiveDocument()).toBe('saved');
    expect(mocks.files.get('/a.md')).toContain('$E=mc^2$');
    expect(mocks.files.get('/a.md')).toContain('\\frac{a}{b}');
  });

  it('recovers the operation queue after failure and cycles across the ends', async () => {
    await expect(runDocumentOperation(() => { throw new Error('failed'); })).rejects.toThrow('failed');
    await openFileInEditor('/a.md'); await openFileInEditor('/b.md');
    await cycleDocumentTab(1);
    expect(store.getState().activeFilePath).toBe('/a.md');
    await cycleDocumentTab(-1);
    expect(store.getState().activeFilePath).toBe('/b.md');
  });
});

describe('startup blank tab auto-close', () => {
  it('marks the initDocumentSessions tab so the first successful open retires it and activates the new document', async () => {
    await initDocumentSessions();
    const startupTab = getActiveTabId()!;
    expect(getDocumentTabs()).toHaveLength(1);
    // openFileInEditor is the shared funnel for both the file tree and the
    // system file browser, so this covers both spec entries at once.
    expect(await openFileInEditor('/a.md')).toBe(true);
    expect(getDocumentTabs()).toHaveLength(1);
    expect(getDocumentTabs()[0]).toMatchObject({ path: '/a.md', id: getActiveTabId() });
    expect(getDocumentTabs()[0].id).not.toBe(startupTab);
    expect(store.getState().activeFilePath).toBe('/a.md');
    expect(getMarkdown()).toBe('alpha');
  });

  it('marks newDocumentTab tabs differently: a manually created blank tab survives an open', async () => {
    await newDocumentTab();
    const manual = getActiveTabId()!;
    await openFileInEditor('/a.md');
    expect(getDocumentTabs()).toHaveLength(2);
    expect(getDocumentTabs().map(tab => tab.id)).toContain(manual);
    expect(getActiveTabId()).toBe(id('/a.md'));
  });

  it('keeps an edited (dirty) startup tab with its content when a document opens', async () => {
    await initDocumentSessions();
    const startupTab = getActiveTabId()!;
    getEditor()!.commands.insertContent('draft');
    await openFileInEditor('/a.md');
    expect(getDocumentTabs()).toHaveLength(2);
    expect(getDocumentTabs().find(tab => tab.id === startupTab)!.dirty).toBe(true);
    await activateDocumentTab(startupTab);
    expect(getMarkdown()).toBe('draft');
  });

  it('keeps the startup blank tab when an open fails before prepare or during commit', async () => {
    await initDocumentSessions();
    const startupTab = getActiveTabId()!;
    expect(await openFileInEditor('/missing.md')).toBe(false);
    expect(getActiveTabId()).toBe(startupTab);
    expect(getDocumentTabs()).toHaveLength(1);
    await expect(openDocumentTab('/broken.md', async () => () => { throw new Error('commit failed'); })).rejects.toThrow('commit failed');
    expect(getActiveTabId()).toBe(startupTab);
    expect(getDocumentTabs()).toHaveLength(1);
    expect(getDocumentTabs()[0].id).toBe(startupTab);
    expect(getMarkdown()).toBe('');
  });

  it('retires the startup blank tab exactly once across consecutive opens', async () => {
    await initDocumentSessions();
    await openFileInEditor('/a.md');
    expect(getDocumentTabs().map(tab => tab.path)).toEqual(['/a.md']);
    await openFileInEditor('/b.md');
    expect(getDocumentTabs().map(tab => tab.path)).toEqual(['/a.md', '/b.md']);
    expect(getActiveTabId()).toBe(id('/b.md'));
  });
});

describe('image preview tabs', () => {
  // 工具栏全部图标化后，按钮以 aria-label 寻址（与 title 一致）。
  const byLabel = (root: HTMLElement, label: string) =>
    root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

  it('opens a preview tab, dedupes by path, and reports kind without dirty', async () => {
    await openFileInEditor('/a.md');
    expect(await openImagePreviewTab('/img/photo.PNG')).toBe(true);
    expect(mocks.authorizePreviewDirectory).toHaveBeenCalledWith('/img/photo.PNG');
    const tabs = getDocumentTabs();
    expect(tabs.map(tab => tab.path)).toEqual(['/a.md', '/img/photo.PNG']);
    expect(tabs[1]).toMatchObject({ kind: 'image', dirty: false });
    expect(getActiveTabId()).toBe(tabs[1].id);
    expect(store.getState().activeFilePath).toBeNull();
    expect(document.getElementById('image-preview')).not.toBeNull();
    expect(document.querySelector('#image-preview img')?.getAttribute('src')).toBe('asset:///img/photo.PNG');

    // 重复打开同一路径（含未规范化的相对段）激活既有标签，不新建。
    expect(await openImagePreviewTab('/img/../img/photo.PNG')).toBe(true);
    expect(getDocumentTabs()).toHaveLength(2);
    expect(getActiveTabId()).toBe(tabs[1].id);
    // 同路径的文档标签也复用同一去重语义：再次打开激活既有 image 标签。
    expect(await openFileInEditor('/img/photo.PNG')).toBe(true);
    expect(getDocumentTabs()).toHaveLength(2);
    expect(getActiveTabId()).toBe(tabs[1].id);
    expect(mocks.read).not.toHaveBeenCalledWith('/img/photo.PNG');
  });

  it('preserves the document editor context across document and image switches', async () => {
    await openFileInEditor('/a.md');
    getEditor()!.commands.insertContentAt(2, 'X');
    const before = getEditor()!.state;
    await openImagePreviewTab('/img/pic.webp');
    expect(getDocumentTabs().map(tab => tab.kind)).toEqual(['document', 'image']);
    await activateDocumentTab(id('/a.md'));
    expect(getEditor()!.state).toEqual(before);
    expect(getEditor()!.state.doc).toBe(before.doc);
    expect(getMarkdown()).toContain('X');
    expect(document.getElementById('image-preview')).toBeNull();
    await activateDocumentTab(id('/img/pic.webp'));
    expect(document.getElementById('image-preview')).not.toBeNull();
    await activateDocumentTab(id('/a.md'));
    expect(getMarkdown()).toContain('X');
  });

  it('counts image tabs toward the tab cap and closes them without a save confirmation', async () => {
    await initDocumentSessions();
    // 首次成功打开即退役空白启动标签，20 个图片标签正好占满容量。
    for (let index = 0; index < 20; index++) await openImagePreviewTab(`/img/${index}.png`);
    expect(getDocumentTabs()).toHaveLength(20);
    expect(await openImagePreviewTab('/img/overflow.png')).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('20'));
    expect(getDocumentTabs()).toHaveLength(20);

    const image = id('/img/3.png');
    expect(await closeDocumentTab(image)).toBe(true);
    expect(mocks.dialog).not.toHaveBeenCalled();
    expect(getDocumentTabs()).toHaveLength(19);
    // 关闭的图片标签可重开，走统一分流后仍是 image 会话。
    expect(await reopenClosedDocumentTab()).toBe(true);
    expect(getDocumentTabs().find(tab => tab.path === '/img/3.png')).toMatchObject({ kind: 'image', dirty: false });
  });

  it('never marks an image tab dirty and skips external-change confirmations for it', async () => {
    // 经统一分流入口（最近文件/文件树同源）打开图片。
    expect(await openFileInEditor('/img/pic.webp')).toBe(true);
    await routeDocumentExternalChanges([{ path: '/img/pic.webp', kind: 'delete' }]);
    expect(mocks.dialog).not.toHaveBeenCalled();
    await activateDocumentTab(id('/img/pic.webp'));
    expect(mocks.dialog).not.toHaveBeenCalled();
    expect(getDocumentTabs().find(tab => tab.path === '/img/pic.webp')!.dirty).toBe(false);
    expect(await confirmAllDocumentTabsClose()).toBe(true);
    expect(mocks.dialog).not.toHaveBeenCalled();
  });

  it('renders an accessible four-button icon toolbar with the initial fit state', async () => {
    await openImagePreviewTab('/img/photo.PNG');
    const preview = document.getElementById('image-preview')!;
    for (const label of ['缩小', '放大', '适应窗口', '原始尺寸 (1:1)']) {
      const button = byLabel(preview, label);
      expect(button, label).not.toBeNull();
      expect(button!.getAttribute('title')).toBe(label);
    }
    // 未加载完成时适配比例退化为 1，高亮落在「适应窗口」。
    expect(preview.querySelector('.image-preview-pct')!.textContent).toBe('100%');
    expect(byLabel(preview, '适应窗口')!.getAttribute('aria-pressed')).toBe('true');
    expect(byLabel(preview, '原始尺寸 (1:1)')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('steps zoom ×1.25 from the fit ratio with a live readout and highlight handover', async () => {
    await openImagePreviewTab('/img/square.png');
    const preview = document.getElementById('image-preview')!;
    const viewport = preview.querySelector<HTMLElement>('.image-preview-viewport')!;
    const img = preview.querySelector<HTMLImageElement>('img')!;
    const pct = preview.querySelector<HTMLElement>('.image-preview-pct')!;
    // 视口 728×728、图片 1000×1000（留白 48）→ 适配比例恰为 68%（规格场景）。
    Object.defineProperty(viewport, 'clientWidth', { value: 728, configurable: true });
    Object.defineProperty(viewport, 'clientHeight', { value: 728, configurable: true });
    Object.defineProperty(img, 'naturalWidth', { value: 1000, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 1000, configurable: true });
    img.dispatchEvent(new Event('load'));
    expect(pct.textContent).toBe('68%');

    byLabel(preview, '放大')!.click();
    expect(pct.textContent).toBe('85%');
    expect(byLabel(preview, '适应窗口')!.getAttribute('aria-pressed')).toBe('false');
    expect(img.classList.contains('manual')).toBe(true);

    byLabel(preview, '缩小')!.click();
    expect(pct.textContent).toBe('68%');

    // 1:1 = 精确 100% 像素：高亮迁移，内联宽度等于天然宽度。
    byLabel(preview, '原始尺寸 (1:1)')!.click();
    expect(pct.textContent).toBe('100%');
    expect(byLabel(preview, '原始尺寸 (1:1)')!.getAttribute('aria-pressed')).toBe('true');
    expect(img.style.width).toBe('1000px');
    // 回到适应窗口：高亮恢复，内联尺寸清除、类切回 fit。
    byLabel(preview, '适应窗口')!.click();
    expect(byLabel(preview, '适应窗口')!.getAttribute('aria-pressed')).toBe('true');
    expect(img.classList.contains('fit')).toBe(true);
    expect(img.style.width).toBe('');
  });

  it('clamps stepped zoom exactly at the 10% and 800% band edges', async () => {
    await openImagePreviewTab('/img/band.png');
    const preview = document.getElementById('image-preview')!;
    const pct = preview.querySelector<HTMLElement>('.image-preview-pct')!;
    // 无布局环境下 fit 基数退化为 1，从 100% 起步。
    byLabel(preview, '缩小')!.click();
    expect(pct.textContent).toBe('80%');
    for (let index = 0; index < 40; index++) byLabel(preview, '放大')!.click();
    expect(pct.textContent).toBe('800%');
    for (let index = 0; index < 60; index++) byLabel(preview, '缩小')!.click();
    expect(pct.textContent).toBe('10%');
  });

  it('drives the failure placeholder purely through the .failed container class', async () => {
    await openImagePreviewTab('/img/gone.png');
    const preview = document.getElementById('image-preview')!;
    const img = preview.querySelector<HTMLImageElement>('img')!;
    // 成功路径初始无 .failed：修复「占位符常显」的误报回归。
    expect(preview.classList.contains('failed')).toBe(false);
    img.dispatchEvent(new Event('error'));
    expect(preview.classList.contains('failed')).toBe(true);
    img.dispatchEvent(new Event('load'));
    expect(preview.classList.contains('failed')).toBe(false);
  });

  it('pans an overflowing preview by mouse drag and ignores other pointer types', async () => {
    await openImagePreviewTab('/img/huge.png');
    const preview = document.getElementById('image-preview')!;
    const viewport = preview.querySelector<HTMLElement>('.image-preview-viewport')!;
    const img = preview.querySelector<HTMLImageElement>('img')!;
    // 原生图片拖拽幽灵会吃掉平移手势，必须禁用。
    expect(img.draggable).toBe(false);
    // happy-dom 无真实布局：视口度量用 Object.defineProperty 覆写模拟溢出。
    Object.defineProperty(viewport, 'scrollWidth', { value: 600, configurable: true });
    Object.defineProperty(viewport, 'clientWidth', { value: 200, configurable: true });
    Object.defineProperty(viewport, 'scrollHeight', { value: 400, configurable: true });
    Object.defineProperty(viewport, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(viewport, 'scrollLeft', { value: 0, writable: true, configurable: true });
    Object.defineProperty(viewport, 'scrollTop', { value: 0, writable: true, configurable: true });
    // load 触发一次渲染，重算 .can-pan。
    img.dispatchEvent(new Event('load'));
    expect(viewport.classList.contains('can-pan')).toBe(true);

    viewport.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 7, pointerType: 'mouse', clientX: 100, clientY: 100 }));
    expect(viewport.classList.contains('panning')).toBe(true);
    viewport.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, pointerType: 'mouse', clientX: 70, clientY: 90 }));
    // 位移取反映射到滚动偏移：向左拖 30px → scrollLeft +30。
    expect(viewport.scrollLeft).toBe(30);
    expect(viewport.scrollTop).toBe(10);
    viewport.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'mouse' }));
    expect(viewport.classList.contains('panning')).toBe(false);

    // 触摸/触控板指针不进入拖拽平移，原生滚动不受影响。
    viewport.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 8, pointerType: 'touch', clientX: 100, clientY: 100 }));
    viewport.dispatchEvent(new PointerEvent('pointermove', { pointerId: 8, pointerType: 'touch', clientX: 40, clientY: 40 }));
    viewport.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8, pointerType: 'touch' }));
    expect(viewport.scrollLeft).toBe(30);
    expect(viewport.classList.contains('panning')).toBe(false);
  });

  it('does not pan when the image fits inside the viewport', async () => {
    await openImagePreviewTab('/img/small.png');
    const preview = document.getElementById('image-preview')!;
    const viewport = preview.querySelector<HTMLElement>('.image-preview-viewport')!;
    Object.defineProperty(viewport, 'scrollWidth', { value: 200, configurable: true });
    Object.defineProperty(viewport, 'clientWidth', { value: 200, configurable: true });
    Object.defineProperty(viewport, 'scrollHeight', { value: 300, configurable: true });
    Object.defineProperty(viewport, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(viewport, 'scrollLeft', { value: 0, writable: true, configurable: true });
    Object.defineProperty(viewport, 'scrollTop', { value: 0, writable: true, configurable: true });
    preview.querySelector('img')!.dispatchEvent(new Event('load'));
    expect(viewport.classList.contains('can-pan')).toBe(false);
    viewport.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 50 }));
    viewport.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10 }));
    viewport.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse' }));
    expect(viewport.classList.contains('panning')).toBe(false);
    expect(viewport.scrollLeft).toBe(0);
  });

  it('resets the zoom mode and alt text when switching directly between image tabs', async () => {
    await openImagePreviewTab('/img/one.png');
    await openImagePreviewTab('/img/two.png');
    const preview = document.getElementById('image-preview')!;
    const img = preview.querySelector('img')!;
    const fit = byLabel(preview, '适应窗口')!;
    const actual = byLabel(preview, '原始尺寸 (1:1)')!;
    expect(img.alt).toBe('two.png');
    actual.click();
    expect(actual.getAttribute('aria-pressed')).toBe('true');
    expect(img.classList.contains('manual')).toBe(true);
    // 图片→图片直接切换复用预览容器，缩放态与 alt 必须随之复位。
    await activateDocumentTab(id('/img/one.png'));
    expect(img.alt).toBe('one.png');
    expect(img.getAttribute('src')).toBe('asset:///img/one.png');
    expect(fit.getAttribute('aria-pressed')).toBe('true');
    expect(actual.getAttribute('aria-pressed')).toBe('false');
    expect(img.classList.contains('fit')).toBe(true);
    expect(img.classList.contains('manual')).toBe(false);
    expect(preview.querySelector('.image-preview-pct')!.textContent).toBe('100%');
  });

  it('rewrites image tab paths with the workspace and refreshes the preview source', async () => {
    await openImagePreviewTab('/old/photo.jpg');
    rewriteDocumentTabPaths('/old', '/renamed');
    expect(getDocumentTabs().map(tab => tab.path)).toEqual(['/renamed/photo.jpg']);
    expect(document.querySelector('#image-preview img')?.getAttribute('src')).toBe('asset:///renamed/photo.jpg');
  });
});


describe('configurable default source mode', () => {
  it('opens over-threshold documents in Source but allows normal WYSIWYG switching', async () => {
    vi.mocked(getCachedSettings).mockReturnValue({ ...DEFAULT_SETTINGS, wysiwygMaxBytes: 4, sourceMaxBytes: 100 });
    await openFileInEditor('/a.md');
    expect(store.getState().mode).toBe('source');
    await sourceReady();
    expect(getSourceContent()).toBe('alpha');
    expect(document.getElementById('degradation-bar')?.title).toContain('高级');
    switchToWysiwyg();
    expect(store.getState().mode).toBe('wysiwyg');
    expect(getMarkdown()).toContain('alpha');
    expect(document.getElementById('degradation-bar')?.hidden).toBe(true);
    expect(store.getState().dirty).toBe(false);
  });
  it('uses line count only for default mode and never for an open confirmation', async () => {
    vi.mocked(getCachedSettings).mockReturnValue({ ...DEFAULT_SETTINGS, maxLines: 1 });
    await openFileInEditor('/a.md');
    expect(store.getState().mode).toBe('source');
    expect(mocks.dialog).not.toHaveBeenCalled();
    await sourceReady();
    switchToWysiwyg();
    expect(store.getState().mode).toBe('wysiwyg');
  });
  it('cancels source overflow before reading and opens it editable after confirmation', async () => {
    vi.mocked(getCachedSettings).mockReturnValue({ ...DEFAULT_SETTINGS, wysiwygMaxBytes: 2, sourceMaxBytes: 4 });
    mocks.dialog.mockResolvedValueOnce('cancel');
    expect(await openFileInEditor('/a.md')).toBe(false);
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.dialog.mockResolvedValueOnce('force');
    expect(await openFileInEditor('/a.md')).toBe(true);
    expect(store.getState()).toMatchObject({ mode: 'source', readOnly: false });
    await sourceReady();
    expect(getSourceContent()).toBe('alpha');
  });
  it('isolates notice dismissal and mode across tabs while settings affect later opens', async () => {
    vi.mocked(getCachedSettings).mockReturnValue({ ...DEFAULT_SETTINGS, wysiwygMaxBytes: 4, sourceMaxBytes: 100 });
    file('/b.md','bravo');
    await openFileInEditor('/a.md');
    (document.querySelector('.degradation-close') as HTMLButtonElement).click();
    await openFileInEditor('/b.md');
    expect(document.getElementById('degradation-bar')).not.toBeNull();
    await activateDocumentTab(id('/a.md'));
    expect(document.getElementById('degradation-bar')).toBeNull();
    vi.mocked(getCachedSettings).mockReturnValue(DEFAULT_SETTINGS);
    expect(store.getState().mode).toBe('source');
    file('/new.md', 'new');
    await openFileInEditor('/new.md');
    expect(store.getState().mode).toBe('wysiwyg');
    await activateDocumentTab(id('/b.md'));
    expect(document.getElementById('degradation-bar')).not.toBeNull();
    expect(store.getState().mode).toBe('source');
  });
  it('projects active filename and unsaved star and clears the last title', async () => {
    await openFileInEditor('/a.md');
    expect(document.title).toBe('a.md');
    store.setState({ dirty: true });
    expect(document.title).toBe('a.md*');
    store.setState({ dirty: false });
    expect(document.title).toBe('a.md');
    await openFileInEditor('/b.md');
    expect(document.title).toBe('b.md');
    await closeAllDocumentTabs();
    expect(document.title).toBe('MarkFlow');
  });
});
