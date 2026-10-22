import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('../components/toast', () => ({ showToast: mocks.toast }));
vi.mock('../components/ui/dialog', () => ({ showDialog: mocks.dialog }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save, open: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async (_command: string, { path }: { path: string }) => {
  const stats = mocks.stats.get(path);
  if (!stats) throw new Error('file not found');
  return stats;
}), convertFileSrc: (path: string) => `asset://${path}` }));
vi.mock('./logger', () => ({ logDebug: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn(), logException: vi.fn() }));
import * as editorApi from './editor';
import { initOutline } from '../components/outline';
import { initEditor } from './editor.init';
import { getEditor, setEditor } from './editor.state';
import { scheduler } from './taskScheduler';
import { store } from './store';
import { destroySourceEditor } from './editor.source.facade';
import { openFileInEditor } from '../components/sidebar.fileops';
import { activateDocumentTab, getDocumentTabs, destroyDocumentSessions } from './documentSessions';

function file(path: string, content: string, mtime = 1) {
  mocks.files.set(path, content);
  mocks.stats.set(path, { mtime, size: content.length });
}
function id(path: string) { return getDocumentTabs().find(tab => tab.path === path)!.id; }
beforeEach(async () => {
  mocks.files.clear(); mocks.stats.clear(); vi.clearAllMocks();
  mocks.dialog.mockResolvedValue('keep'); mocks.cleanup.mockResolvedValue(undefined);
  mocks.read.mockImplementation(async (path: string) => {
    if (!mocks.files.has(path)) throw new Error('not found');
    return mocks.files.get(path)!;
  });
  mocks.write.mockImplementation(async (path: string, content: string) => { file(path, content, 2); });
  document.body.innerHTML = '<div id="editor-area"></div><div id="outline-tree"></div>';
  store.setState({ mode: 'wysiwyg', activeFilePath: null, dirty: false, readOnly: false, autosaveErrorCount: 0, reconcileError: null });
  await initEditor();
  initOutline();
  file('/b.md', 'beta');
});
afterEach(async () => {
  await destroyDocumentSessions();
  destroySourceEditor(); getEditor()?.destroy(); setEditor(null); scheduler.cancelAll();
  vi.restoreAllMocks();
});

describe('document tab projection work', () => {
  it('refreshes the outline and frontmatter once per switch for small and large documents', async () => {
    const outline = document.getElementById('outline-tree')!;
    const outlineWrites = vi.spyOn(outline, 'appendChild');
    const markdownReads = vi.spyOn(editorApi, 'getMarkdown');
    for (const headings of [5, 500]) {
      const text = '---\ntitle: benchmark\n---\n\n' + Array.from({ length: headings }, (_, n) => `## Heading ${n}\n\nA paragraph for section ${n}.\n`).join('\n');
      const path = `/size-${headings}.md`;
      file(path, text);
      await openFileInEditor(path);
      await openFileInEditor('/b.md');
      outlineWrites.mockClear();
      markdownReads.mockClear();
      await activateDocumentTab(id(path));
      expect(outline.querySelectorAll('.outline-item')).toHaveLength(headings);
      expect(document.querySelector('[data-fm-value="title"]')).not.toBeNull();
      expect(outlineWrites).toHaveBeenCalledTimes(headings);
      expect(markdownReads).toHaveBeenCalledTimes(1);
    }
  });
});
