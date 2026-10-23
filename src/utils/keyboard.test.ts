import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  close: vi.fn(),
  reopen: vi.fn(),
  cycle: vi.fn(),
  save: vi.fn(),
  openFile: vi.fn(),
  newFile: vi.fn(),
  getEditor: vi.fn<() => unknown>(() => null),
  openDialog: vi.fn(),
}));

vi.mock('../lib/documentSessions', () => ({
  newDocumentTab: mocks.create,
  closeDocumentTab: mocks.close,
  getActiveTabId: () => 'active',
  reopenClosedDocumentTab: mocks.reopen,
  cycleDocumentTab: mocks.cycle,
}));
vi.mock('../lib/editor', () => ({
  getEditor: mocks.getEditor,
  getMode: () => 'wysiwyg',
  switchToSource: vi.fn(),
  switchToWysiwyg: vi.fn(),
}));
vi.mock('../components/sidebar', () => ({
  saveActiveDocument: mocks.save,
  openFileInEditor: mocks.openFile,
  confirmDocumentTransition: vi.fn(),
}));
vi.mock('../components/newFileDialog', () => ({ showNewFileDialog: mocks.newFile }));
vi.mock('../components/fileTree', () => ({ getWorkspacePath: () => '/workspace' }));
vi.mock('../components/toast', () => ({ showToast: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.openDialog }));

const { initKeyboard, resolveNativeMenuShortcut, NATIVE_MENU_SHORTCUTS } = await import('./keyboard');

beforeAll(() => initKeyboard());
beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

function key(key: string, modifiers: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } = { ctrlKey: true }) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers });
  document.dispatchEvent(event);
  return event;
}

describe('native menu shortcut ownership', () => {
  it('maps every native accelerator to a menu action id', () => {
    const byKey = new Map(NATIVE_MENU_SHORTCUTS.map((shortcut) => [
      `${shortcut.controlOnly ? 'ctrl' : 'mod'}+${shortcut.shift ? 'shift+' : ''}${shortcut.alt ? 'alt+' : ''}${shortcut.key}`,
      shortcut.action,
    ]));
    expect(byKey.get('mod+f')).toBe('find');
    expect(byKey.get('mod+s')).toBe('save');
    expect(byKey.get('mod+n')).toBe('new-file');
    expect(byKey.get('mod+shift+n')).toBe('new-folder');
    expect(byKey.get('mod+o')).toBe('open-file');
    expect(byKey.get('mod+t')).toBe('new-tab');
    expect(byKey.get('mod+w')).toBe('close-tab');
    expect(byKey.get('mod+shift+t')).toBe('reopen-tab');
    expect(byKey.get('mod+shift+w')).toBe('close-window');
    expect(byKey.get('mod+b')).toBe('bold');
    expect(byKey.get('mod+i')).toBe('italic');
    expect(byKey.get('mod+k')).toBe('insert-link');
    expect(byKey.get('mod+/')).toBe('toggle-mode');
    expect(byKey.get('mod+\\')).toBe('toggle-sidebar');
    expect(byKey.get('mod+shift+f')).toBe('focus-mode');
    expect(byKey.get('mod+shift+s')).toBe('strike');
    expect(byKey.get('mod+0')).toBe('paragraph');
    expect(byKey.get('mod+1')).toBe('heading-1');
    expect(byKey.get('mod+f')).toBe('find');
    expect(byKey.get('mod+6')).toBe('heading-6');
    expect(byKey.get('ctrl+tab')).toBe('next-tab');
    expect(byKey.get('ctrl+shift+tab')).toBe('previous-tab');
  });

  it('accepts both Control and Command for non-control-only accelerators', () => {
    const ctrl = new KeyboardEvent('keydown', { key: 's', ctrlKey: true });
    const meta = new KeyboardEvent('keydown', { key: 's', metaKey: true });
    expect(resolveNativeMenuShortcut(ctrl)).toBe('save');
    expect(resolveNativeMenuShortcut(meta)).toBe('save');
  });

  it('requires the Control modifier for tab cycling accelerators', () => {
    const ctrlTab = new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true });
    const cmdTab = new KeyboardEvent('keydown', { key: 'Tab', metaKey: true });
    expect(resolveNativeMenuShortcut(ctrlTab)).toBe('next-tab');
    expect(resolveNativeMenuShortcut(cmdTab)).toBeNull();
  });

  it('requires matching shift and alt modifiers', () => {
    expect(resolveNativeMenuShortcut(new KeyboardEvent('keydown', { key: 't', ctrlKey: true })))
      .toBe('new-tab');
    expect(resolveNativeMenuShortcut(new KeyboardEvent('keydown', { key: 't', ctrlKey: true, shiftKey: true })))
      .toBe('reopen-tab');
    // Focus mode owns Ctrl+Shift+F. Ctrl+F (查找) and Ctrl+Alt+F (替换) are ⬜
    // placeholders, so their accelerators are not claimed (see below).
    expect(resolveNativeMenuShortcut(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, shiftKey: true })))
      .toBe('focus-mode');
  });

  it('does not claim accelerators that belong to disabled (⬜) menu items', () => {
    // A disabled menu item never fires, so suppressing these keys would only
    // break the browser/page defaults that worked before the native menu.
    for (const event of [
      key('f'),
      key('p'),
      key('4'),
      key('5'),
      key('6'),
      key('='),
      key('-'),
      key('f', { ctrlKey: true, altKey: true }),
    ]) {
      expect(resolveNativeMenuShortcut(event)).toBeNull();
      expect(event.defaultPrevented).toBe(false);
    }
  });

  it('ignores keys without a primary modifier', () => {
    expect(resolveNativeMenuShortcut(new KeyboardEvent('keydown', { key: 's' }))).toBeNull();
    expect(resolveNativeMenuShortcut(new KeyboardEvent('keydown', { key: 'b', shiftKey: true }))).toBeNull();
  });
});

describe('DOM keyboard handler does not duplicate native menu commands', () => {
  it('prevents browser defaults for native accelerators without executing commands', () => {
    for (const event of [
      key('s'),
      key('n'),
      key('o'),
      key('t'),
      key('w'),
      key('T', { ctrlKey: true, shiftKey: true }),
      key('b'),
      key('i'),
      key('k'),
      key('/'),
      key('\\'),
      key('F', { ctrlKey: true, shiftKey: true }),
      key('S', { ctrlKey: true, shiftKey: true }),
      key('Tab'),
      key('Tab', { ctrlKey: true, shiftKey: true }),
      key('1', { metaKey: true }),
    ]) {
      expect(event.defaultPrevented).toBe(true);
    }

    // The native menu (and its frontend dispatcher) owns the commands.
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.newFile).not.toHaveBeenCalled();
    expect(mocks.openFile).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
    expect(mocks.reopen).not.toHaveBeenCalled();
    expect(mocks.cycle).not.toHaveBeenCalled();
    expect(mocks.openDialog).not.toHaveBeenCalled();
  });

  it('leaves non-native keys untouched', () => {
    for (const event of [
      key('z'),
      key('x'),
      key('a'),
      key('e'),
      key('Enter'),
      key('ArrowDown'),
    ]) {
      expect(event.defaultPrevented).toBe(false);
    }
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('does not run menu commands even while a modal is open', () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    key('t');
    key('w');
    key('Tab');
    key('s');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
    expect(mocks.cycle).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
