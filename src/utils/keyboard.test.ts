import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), close: vi.fn(), reopen: vi.fn(), cycle: vi.fn(), save: vi.fn(), openFile: vi.fn(), confirm: vi.fn(), newFile: vi.fn(), openDialog: vi.fn() }));
vi.mock('../lib/documentSessions', () => ({ newDocumentTab: mocks.create, closeDocumentTab: mocks.close, getActiveTabId: () => 'active', reopenClosedDocumentTab: mocks.reopen, cycleDocumentTab: mocks.cycle }));
vi.mock('../lib/editor', () => ({ getEditor: () => null, getMode: () => 'wysiwyg', switchToSource: vi.fn(), switchToWysiwyg: vi.fn() }));
vi.mock('../components/sidebar', () => ({ saveActiveDocument: mocks.save, openFileInEditor: mocks.openFile, confirmDocumentTransition: mocks.confirm }));
vi.mock('../components/newFileDialog', () => ({ showNewFileDialog: mocks.newFile }));
vi.mock('../components/fileTree', () => ({ getWorkspacePath: () => '/workspace' }));
vi.mock('../components/toast', () => ({ showToast: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.openDialog }));
import { initKeyboard } from './keyboard';
beforeAll(() => initKeyboard());
beforeEach(() => { vi.clearAllMocks(); document.body.innerHTML = ''; mocks.openDialog.mockResolvedValue('/workspace/note.md'); });
function key(key: string, modifiers: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean } = { ctrlKey: true }) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers });
  document.dispatchEvent(event);
  return event;
}
describe('document tab keyboard commands', () => {
  it('supports Control and Command tab create/close/restore and prevents browser actions', () => {
    expect(key('t').defaultPrevented).toBe(true); expect(mocks.create).toHaveBeenCalledOnce();
    expect(key('w', { metaKey: true }).defaultPrevented).toBe(true); expect(mocks.close).toHaveBeenCalledWith('active');
    key('T', { metaKey: true, shiftKey: true }); expect(mocks.reopen).toHaveBeenCalledOnce();
    key('Tab'); expect(mocks.cycle).toHaveBeenCalledWith(1);
    key('Tab', { ctrlKey: true, shiftKey: true }); expect(mocks.cycle).toHaveBeenCalledWith(-1);
  });
  it('suppresses commands while settings or a confirmation modal is open', () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    key('t'); key('w'); key('t', { ctrlKey: true, shiftKey: true }); key('Tab');
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.close).not.toHaveBeenCalled(); expect(mocks.reopen).not.toHaveBeenCalled(); expect(mocks.cycle).not.toHaveBeenCalled();
  });
  it('preserves workspace new-file, open-file and save entry points without switch confirmation', async () => {
    key('n'); expect(mocks.newFile).toHaveBeenCalledWith('file', '/workspace');
    key('s'); expect(mocks.save).toHaveBeenCalled();
    key('o'); await vi.waitFor(() => expect(mocks.openFile).toHaveBeenCalledWith('/workspace/note.md'));
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
