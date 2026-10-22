import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { undo as undoSource } from '@codemirror/commands';
const mocks = vi.hoisted(() => ({
  files: new Map<string, string>(), stats: new Map<string, { mtime: number; size: number }>(),
  dialog: vi.fn(), save: vi.fn(), toast: vi.fn(), write: vi.fn(), read: vi.fn(), cleanup: vi.fn(),
}));
vi.mock('./storage', () => ({
  loadSettings: vi.fn(async () => ({})), getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })),
  cleanupPendingImages: mocks.cleanup, authorizeImageStorage: vi.fn(async () => {}), addRecentFile: vi.fn(async () => {}),
  getFileMetadata: vi.fn(async (path: string) => {
    if (!mocks.files.has(path)) throw new Error('not found');
    return { size: mocks.files.get(path)!.length, lines: 2 };
  }),
  readFile: mocks.read, writeFile: mocks.write, writeFileIfUnchanged: mocks.write,
}));
vi.mock('../components/fileTree', () => ({ suppressNextWatcherRefresh: vi.fn(), cancelSuppressedWatcherRefresh: vi.fn(), applyFileTreeEvents: vi.fn() }));
vi.mock('../components/outline', () => ({ refreshOutline: vi.fn() }));
vi.mock('../components/frontmatterPanel', () => ({ mountFrontmatterPanel: vi.fn(), refreshFrontmatterPanel: vi.fn() }));
vi.mock('../components/toast', () => ({ showToast: mocks.toast }));
vi.mock('../components/ui/dialog', () => ({ showDialog: mocks.dialog }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save, open: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async (_command: string, { path }: { path: string }) => {
  const stats = mocks.stats.get(path);
  if (!stats) throw new Error('file not found');
  return stats;
}), convertFileSrc: (path: string) => `asset://${path}` }));
vi.mock('./logger', () => ({ logDebug: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn(), logException: vi.fn() }));
import { initEditor } from './editor.init';
import { getMarkdown, switchToSource, switchToWysiwyg, getSavePlan } from './editor';
import { getEditor, setEditor, getDocumentState, getActiveDocPath } from './editor.state';
import { scheduler } from './taskScheduler';
import { store } from './store';
import { getSourceView, getSourceContent, destroySourceEditor } from './editor.source.facade';
import { openFileInEditor, saveActiveDocument } from '../components/sidebar.fileops';
import {
  activateDocumentTab, closeDocumentTab, getDocumentTabs, getActiveTabId, newDocumentTab,
  reopenClosedDocumentTab, destroyDocumentSessions, confirmAllDocumentTabsClose, closeAllDocumentTabs, routeDocumentExternalChanges,
  rewriteDocumentTabPaths, cycleDocumentTab,
  initDocumentSessions, openDocumentTab, MAX_DOCUMENT_TABS,
} from './documentSessions';
import { isDocumentOperationPending, runDocumentOperation } from './documentOperations';
import { attachImageDraft } from './imageUtils';

function file(path: string, content: string, mtime = 1) {
  mocks.files.set(path, content);
  mocks.stats.set(path, { mtime, size: content.length });
}
function id(path: string) { return getDocumentTabs().find(tab => tab.path === path)!.id; }
async function sourceReady() { await vi.waitFor(() => expect(getSourceView()).not.toBeNull()); return getSourceView()!; }
beforeEach(async () => {
  mocks.files.clear(); mocks.stats.clear(); vi.clearAllMocks();
  mocks.dialog.mockResolvedValue('keep'); mocks.cleanup.mockResolvedValue(undefined);
  mocks.read.mockImplementation(async (path: string) => {
    if (!mocks.files.has(path)) throw new Error('not found');
    return mocks.files.get(path)!;
  });
  mocks.write.mockImplementation(async (path: string, content: string) => { file(path, content, 2); });
  document.body.innerHTML = '<div id="editor-area"></div><div class="tree-file" data-path="/a.md"></div>';
  store.setState({ mode: 'wysiwyg', activeFilePath: null, dirty: false, readOnly: false, autosaveErrorCount: 0, reconcileError: null });
  await initEditor();
  file('/a.md', 'alpha'); file('/b.md', 'beta'); file('/c.md', '<!-- keep -->\n\ncharlie');
});
afterEach(async () => {
  await destroyDocumentSessions();
  destroySourceEditor(); getEditor()?.destroy(); setEditor(null); scheduler.cancelAll();
});

describe('document session lifecycle with the production editor and file operations', () => {
  it('clears the startup blank caret before first file content replaces the live DOM, preserving its state', async () => {
    await initDocumentSessions();
    const blank = getActiveTabId()!;
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
      expect(getDocumentTabs()).toHaveLength(2);
      await activateDocumentTab(blank);
      expect(editor.state).toEqual(saved);
      expect(editor.state.doc).toBe(saved.doc);
      expect(editor.state.doc.textContent).toBe('');
      expect(editor.state.selection.anchor).toBe(1);
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
