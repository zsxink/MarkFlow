import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getEditor: vi.fn(),
  switchToSource: vi.fn(),
  switchToWysiwyg: vi.fn(),
  getMode: vi.fn(() => 'wysiwyg'),
  isCoreBackedSourceModeEnabled: vi.fn(() => false),
  executeFormattingAction: vi.fn(),
  executeUndo: vi.fn(),
  executeRedo: vi.fn(),
  showLinkDialog: vi.fn(),
  getSourceView: vi.fn(),
  saveActiveDocument: vi.fn(),
}));

vi.mock('../lib/editor', () => ({
  getEditor: mocks.getEditor,
  switchToSource: mocks.switchToSource,
  switchToWysiwyg: mocks.switchToWysiwyg,
  getMode: mocks.getMode,
}));
vi.mock('../lib/coreSession', () => ({
  isCoreBackedSourceModeEnabled: mocks.isCoreBackedSourceModeEnabled,
}));
vi.mock('../editor-adapter/formatCommandLayer', () => ({
  executeFormattingAction: mocks.executeFormattingAction,
  executeUndo: mocks.executeUndo,
  executeRedo: mocks.executeRedo,
}));
vi.mock('../components/linkDialog', () => ({
  showLinkDialog: mocks.showLinkDialog,
}));
vi.mock('../lib/editor.source', () => ({
  getSourceView: mocks.getSourceView,
}));
vi.mock('../components/sidebar', () => ({
  saveActiveDocument: mocks.saveActiveDocument,
  openFileInEditor: vi.fn(),
  confirmDocumentTransition: vi.fn(),
}));
vi.mock('../components/newFileDialog', () => ({ showNewFileDialog: vi.fn() }));
vi.mock('../components/fileTree', () => ({ getWorkspacePath: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('../lib/storage', () => ({ addRecentFile: vi.fn() }));

import { initKeyboard } from './keyboard';

function dispatchCtrl(key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  document.dispatchEvent(event);
  return event;
}

describe('keyboard shortcuts', () => {
  beforeAll(() => {
    initKeyboard();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMode.mockReturnValue('wysiwyg');
    mocks.isCoreBackedSourceModeEnabled.mockReturnValue(false);
    mocks.getEditor.mockReturnValue(null);
    mocks.getSourceView.mockReturnValue({
      state: {
        selection: { main: { from: 1, to: 5 } },
        sliceDoc: vi.fn(() => 'link'),
      },
    });
  });

  it('dispatches Ctrl+B through Core command in Core-backed source mode', () => {
    const legacyRun = vi.fn();
    mocks.getMode.mockReturnValue('source');
    mocks.isCoreBackedSourceModeEnabled.mockReturnValue(true);
    mocks.getEditor.mockReturnValue({
      chain: () => ({ focus: () => ({ toggleBold: () => ({ run: legacyRun }) }) }),
    });

    const event = dispatchCtrl('b');

    expect(event.defaultPrevented).toBe(true);
    expect(mocks.executeFormattingAction).toHaveBeenCalledWith({ type: 'toggle_strong' });
    expect(legacyRun).not.toHaveBeenCalled();
  });

  it('keeps legacy bold shortcut outside Core-backed source mode', () => {
    const legacyRun = vi.fn();
    mocks.getMode.mockReturnValue('wysiwyg');
    mocks.isCoreBackedSourceModeEnabled.mockReturnValue(true);
    mocks.getEditor.mockReturnValue({
      chain: () => ({ focus: () => ({ toggleBold: () => ({ run: legacyRun }) }) }),
    });

    dispatchCtrl('b');

    expect(legacyRun).toHaveBeenCalledOnce();
    expect(mocks.executeFormattingAction).not.toHaveBeenCalled();
  });

  it('uses the link dialog hook for Core-backed source link shortcut', async () => {
    mocks.getMode.mockReturnValue('source');
    mocks.isCoreBackedSourceModeEnabled.mockReturnValue(true);

    dispatchCtrl('k');

    expect(mocks.showLinkDialog).toHaveBeenCalledWith(expect.objectContaining({
      selectedText: 'link',
      onConfirm: expect.any(Function),
    }));

    const [{ onConfirm }] = mocks.showLinkDialog.mock.calls[0];
    await onConfirm({ href: 'https://example.com/', text: 'link' });

    expect(mocks.executeFormattingAction).toHaveBeenCalledWith({
      type: 'insert_link',
      href: 'https://example.com/',
      title: null,
      text: 'link',
    });
  });

  it('routes Ctrl+Shift+S only to strikethrough and does not save', () => {
    mocks.getMode.mockReturnValue('source');
    mocks.isCoreBackedSourceModeEnabled.mockReturnValue(true);

    dispatchCtrl('s', { shiftKey: true });

    expect(mocks.saveActiveDocument).not.toHaveBeenCalled();
    expect(mocks.executeFormattingAction).toHaveBeenCalledWith({
      type: 'toggle_strikethrough',
    });
  });

  it('routes undo and redo shortcuts through Core history in Core-backed source mode', () => {
    mocks.getMode.mockReturnValue('source');
    mocks.isCoreBackedSourceModeEnabled.mockReturnValue(true);

    dispatchCtrl('z');
    dispatchCtrl('z', { shiftKey: true });
    dispatchCtrl('y');

    expect(mocks.executeUndo).toHaveBeenCalledOnce();
    expect(mocks.executeRedo).toHaveBeenCalledTimes(2);
  });
});
