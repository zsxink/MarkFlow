import { beforeEach, describe, expect, it, vi } from 'vitest';

const { switchToSource, switchToWysiwyg, getMode, getEditor, showContextMenuStatic, exportRenderedDocument } = vi.hoisted(() => ({ switchToSource: vi.fn(), switchToWysiwyg: vi.fn(), getMode: vi.fn(), getEditor: vi.fn(), showContextMenuStatic: vi.fn(), exportRenderedDocument: vi.fn() }));
vi.mock('../lib/editor', () => ({ switchToSource, switchToWysiwyg, getMode, getEditor }));
vi.mock('../lib/theme', () => ({ cycleTheme: vi.fn() }));
vi.mock('./fileTree', () => ({ setWorkspacePath: vi.fn(), refreshFileTree: vi.fn(), getWorkspacePath: vi.fn() }));
vi.mock('./newFileDialog', () => ({ showNewFileDialog: vi.fn() })); vi.mock('./linkDialog', () => ({ showLinkDialog: vi.fn() })); vi.mock('./toast', () => ({ showToast: vi.fn() })); vi.mock('./ui/modal', () => ({ showModal: vi.fn() }));
vi.mock('../lib/storage', () => ({ addRecentFile: vi.fn() })); vi.mock('./sidebar', () => ({ clearActiveDocument: vi.fn(), confirmDocumentTransition: vi.fn(), openFileInEditor: vi.fn(), saveActiveDocument: vi.fn() })); vi.mock('../lib/imageUtils', () => ({ copyLocalFileToStorage: vi.fn(), handleNetworkImage: vi.fn(), getImageSettings: vi.fn() })); vi.mock('../lib/editor.state', () => ({ getActiveDocPath: vi.fn() })); vi.mock('../lib/logger', () => ({ logException: vi.fn() }));
vi.mock('../lib/documentExport', () => ({ exportRenderedDocument })); vi.mock('./ui/contextMenu', () => ({ showContextMenuStatic })); vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
import { initToolbar } from './toolbar';

beforeEach(() => { document.body.innerHTML = '<button id="btn-wysiwyg"></button><button id="btn-source"></button><span id="mode-indicator"></span><button id="btn-export"></button>'; vi.clearAllMocks(); });
describe('toolbar', () => {
  it('switches modes and updates active state and indicator', () => {
    initToolbar();
    document.getElementById('btn-source')!.click();
    expect(switchToSource).toHaveBeenCalledOnce();
    expect(document.getElementById('btn-source')!.classList.contains('active')).toBe(true);
    expect(document.getElementById('mode-indicator')!.textContent).toBe('源码');
    document.getElementById('btn-wysiwyg')!.click();
    expect(switchToWysiwyg).toHaveBeenCalledOnce();
    expect(document.getElementById('mode-indicator')!.textContent).toBe('所见即所得');
  });
  it('opens an export menu with all supported formats', () => {
    initToolbar(); document.getElementById('btn-export')!.click();
    expect(showContextMenuStatic).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ label: '导出 PDF' }), expect.objectContaining({ label: '导出 Word' }), expect.objectContaining({ label: '导出 HTML' })]), expect.any(Object));
  });
  it('keeps mode controls exposed as pressed-state toggles', () => {
    initToolbar();
    expect(document.getElementById('btn-wysiwyg')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.getElementById('btn-source')?.getAttribute('aria-pressed')).toBe('false');
  });
});
