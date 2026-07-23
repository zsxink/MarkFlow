import { beforeEach, describe, expect, it, vi } from 'vitest';

const { switchToSource, switchToWysiwyg, getMode, getEditor, showContextMenuStatic, exportRenderedDocument } = vi.hoisted(() => ({ switchToSource: vi.fn(), switchToWysiwyg: vi.fn(), getMode: vi.fn(), getEditor: vi.fn(), showContextMenuStatic: vi.fn(), exportRenderedDocument: vi.fn() }));
vi.mock('../lib/editor', () => ({ switchToSource, switchToWysiwyg, getMode, getEditor }));
vi.mock('./fileTree', () => ({ setWorkspacePath: vi.fn(), refreshFileTree: vi.fn(), getWorkspacePath: vi.fn() }));
vi.mock('./newFileDialog', () => ({ showNewFileDialog: vi.fn() })); vi.mock('./linkDialog', () => ({ showLinkDialog: vi.fn() })); vi.mock('./toast', () => ({ showToast: vi.fn() })); vi.mock('./ui/modal', () => ({ showModal: vi.fn() }));
vi.mock('../lib/storage', () => ({ addRecentFile: vi.fn() })); vi.mock('./sidebar', () => ({ clearActiveDocument: vi.fn(), confirmDocumentTransition: vi.fn(), openFileInEditor: vi.fn(), saveActiveDocument: vi.fn() })); vi.mock('../lib/imageUtils', () => ({ copyLocalFileToStorage: vi.fn(), handleNetworkImage: vi.fn(), getImageSettings: vi.fn(), imagePathToSrc: vi.fn((path: string) => path) })); vi.mock('../lib/editor.state', () => ({ getActiveDocPath: vi.fn(), assetToOriginalMap: new Map() })); vi.mock('../lib/editor.source', () => ({ getSourceView: vi.fn() })); vi.mock('../lib/logger', () => ({ logException: vi.fn() }));
vi.mock('../lib/documentExport', () => ({ exportRenderedDocument })); vi.mock('./ui/contextMenu', () => ({ showContextMenuStatic })); vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
import { initToolbar } from './toolbar';

function buildToolbarHTML() {
  return `<div id="toolbar">
    <button class="toolbar-btn" id="sidebar-toggle" data-tooltip="折叠侧边栏">
      <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>
    </button>
    <button class="toolbar-btn" id="btn-bold" aria-label="粗体" data-tooltip="粗体"></button>
    <button class="toolbar-btn" id="btn-italic" data-tooltip="斜体"></button>
    <button class="toolbar-btn" id="btn-strike" data-tooltip="删除线"></button>
    <button class="toolbar-btn" id="btn-code" data-tooltip="行内代码"></button>
    <span class="toolbar-separator"></span>
    <button class="toolbar-btn active" id="btn-wysiwyg" aria-label="所见即所得"></button>
    <button class="toolbar-btn" id="btn-source" aria-label="源码模式"></button>
    <button class="toolbar-btn" id="btn-focus" data-tooltip="专注模式"></button>
    <span class="toolbar-spacer"></span>
  </div>
  <span id="mode-indicator"></span>`;
}

beforeEach(() => { document.body.innerHTML = buildToolbarHTML(); vi.clearAllMocks(); });
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
    // Add btn-export to the toolbar since some tests reference it
    const toolbar = document.getElementById('toolbar')!;
    const btn = document.createElement('button');
    btn.id = 'btn-export';
    toolbar.appendChild(btn);
    initToolbar(); document.getElementById('btn-export')!.click();
    expect(showContextMenuStatic).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ label: '导出 PDF (.pdf)' }),
      expect.objectContaining({ label: '打印...' }),
      expect.objectContaining({ label: '导出 Word (.docx)' }),
      expect.objectContaining({ label: '导出 HTML (.html)' }),
    ]), expect.any(Object));
  });
  it('keeps mode controls exposed as pressed-state toggles', () => {
    initToolbar();
    expect(document.getElementById('btn-wysiwyg')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.getElementById('btn-source')?.getAttribute('aria-pressed')).toBe('false');
  });
  it('wraps related buttons into role="group" containers on init', () => {
    initToolbar();
    const groups = document.querySelectorAll('#toolbar [role="group"]');
    expect(groups.length).toBeGreaterThan(0);
    // Format group should contain bold, italic, strike, code
    const formatGroup = document.getElementById('toolbar-group-format');
    expect(formatGroup).not.toBeNull();
    expect(formatGroup!.getAttribute('role')).toBe('group');
    expect(formatGroup!.querySelector('#btn-bold')).not.toBeNull();
    expect(formatGroup!.querySelector('#btn-italic')).not.toBeNull();
  });
  it('does not have a duplicate theme button (#btn-theme) in the toolbar', () => {
    expect(document.getElementById('btn-theme')).toBeNull();
    initToolbar();
    expect(document.getElementById('btn-theme')).toBeNull();
  });
});
