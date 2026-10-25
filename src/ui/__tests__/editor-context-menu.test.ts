import { beforeEach, describe, expect, it, vi } from 'vitest';

const { showContextMenuStatic, getMode, getEditor, getSourceView, getState } = vi.hoisted(() => ({
  showContextMenuStatic: vi.fn(),
  getMode: vi.fn(() => 'wysiwyg'),
  getEditor: vi.fn(() => undefined),
  getSourceView: vi.fn(() => undefined),
  getState: vi.fn(() => ({ readOnly: false })),
}));

vi.mock('../editor', () => ({ getEditor, getMode, getSourceView }));
vi.mock('../infra/store', () => ({ store: { getState } }));
vi.mock('../link-dialog', () => ({ showLinkDialog: vi.fn() }));
vi.mock('../toolbar', () => ({ showImageInsertDialog: vi.fn() }));
vi.mock('../toast', () => ({ showToast: vi.fn() }));
vi.mock('../shortcut-hints', () => ({ shortcutLabel: (chord: string) => chord }));
vi.mock('../context-menu', () => ({ showContextMenuStatic }));

import { showEditorContextMenu } from '../editor-context-menu';

function fire(target: Element): MouseEvent {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 8, clientY: 8 });
  target.dispatchEvent(event);
  showEditorContextMenu(event);
  return event;
}

function mountApp(): void {
  document.body.innerHTML = `
    <div id="toolbar"><button id="btn-bold"></button></div>
    <div id="sidebar"><button id="tree-rename"></button><input id="tree-rename-input" type="text"></div>
    <main id="editor-area">
      <div class="ProseMirror"><p id="para">正文</p></div>
      <textarea id="raw-block-textarea"></textarea>
      <img id="pic" alt="">
      <div class="mermaid-preview"><span id="mermaid-span"></span></div>
    </main>
    <footer id="statusbar"><span id="word-count"></span></footer>
    <div class="modal-settings">
      <span class="settings-label" id="settings-label">设置</span>
      <input id="settings-input" type="text">
      <input id="settings-number" type="number">
      <select id="settings-select"><option>1</option></select>
    </div>`;
}

beforeEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('editor fallback context menu (#444)', () => {
  it('shows the editor menu inside #editor-area', () => {
    mountApp();
    const event = fire(document.getElementById('para')!);
    expect(showContextMenuStatic).toHaveBeenCalledOnce();
    const items = showContextMenuStatic.mock.calls[0][0] as Array<{ label: string }>;
    expect(items[0].label).toBe('新增链接…');
    expect(event.defaultPrevented).toBe(true);
  });

  it('shows nothing on toolbar, statusbar, settings non-inputs, and sidebar', () => {
    mountApp();
    for (const id of ['btn-bold', 'word-count', 'settings-label', 'settings-select', 'tree-rename']) {
      const event = fire(document.getElementById(id)!);
      expect(showContextMenuStatic, id).not.toHaveBeenCalled();
      expect(event.defaultPrevented, id).toBe(false);
    }
  });

  it('shows nothing on img and mermaid-preview inside #editor-area', () => {
    mountApp();
    fire(document.getElementById('pic')!);
    fire(document.getElementById('mermaid-span')!);
    expect(showContextMenuStatic).not.toHaveBeenCalled();
  });

  it('shows the text-control edit menu for inputs anywhere', () => {
    mountApp();
    for (const id of ['settings-input', 'settings-number', 'raw-block-textarea', 'tree-rename-input']) {
      const event = fire(document.getElementById(id)!);
      expect(showContextMenuStatic, id).toHaveBeenCalledOnce();
      const items = showContextMenuStatic.mock.calls[0][0] as Array<{ label: string }>;
      expect(items[0].label).toBe('剪切');
      expect(event.defaultPrevented, id).toBe(true);
      showContextMenuStatic.mockClear();
    }
  });
});
