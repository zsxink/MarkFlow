import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { initKeyboard, resolveNativeMenuShortcut, NATIVE_MENU_SHORTCUTS } from '../keyboard';

const onShortcut = vi.fn();

beforeAll(() => initKeyboard({ onShortcut }));
beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

function key(
  key: string,
  modifiers: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; repeat?: boolean } = { ctrlKey: true },
) {
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
    expect(onShortcut).not.toHaveBeenCalled();
  });

  it('ignores keys without a primary modifier', () => {
    expect(resolveNativeMenuShortcut(new KeyboardEvent('keydown', { key: 's' }))).toBeNull();
    expect(resolveNativeMenuShortcut(new KeyboardEvent('keydown', { key: 'b', shiftKey: true }))).toBeNull();
  });
});

describe('DOM keyboard handler', () => {
  it('suppresses the browser default and hands the action to the runner', () => {
    // The menu claims the chord when it can; a keydown that still reaches the
    // DOM means it could not (disabled item, or the webview kept the key), so
    // the fallback must run the command instead of leaving the key dead (#410).
    const cases: Array<[Parameters<typeof key>, string]> = [
      [[ 's' ], 'save'],
      [['n'], 'new-file'],
      [['o'], 'open-file'],
      [['t'], 'new-tab'],
      [['w'], 'close-tab'],
      [['T', { ctrlKey: true, shiftKey: true }], 'reopen-tab'],
      [['b'], 'bold'],
      [['i'], 'italic'],
      [['k'], 'insert-link'],
      [['/', { metaKey: true }], 'toggle-mode'],
      [['\\'], 'toggle-sidebar'],
      [['F', { ctrlKey: true, shiftKey: true }], 'focus-mode'],
      [['S', { ctrlKey: true, shiftKey: true }], 'strike'],
      [['Tab'], 'next-tab'],
      [['Tab', { ctrlKey: true, shiftKey: true }], 'previous-tab'],
      [['1', { metaKey: true }], 'heading-1'],
      [['l'], 'insert-task-list'],
      [['q'], 'quit'],
      [[',', { metaKey: true }], 'settings'],
      [['W', { ctrlKey: true, shiftKey: true }], 'close-window'],
    ];
    for (const [args, action] of cases) {
      onShortcut.mockClear();
      const event = key(...args);
      expect(event.defaultPrevented).toBe(true);
      // Exactly once: a single press must not queue the command twice.
      expect(onShortcut).toHaveBeenCalledTimes(1);
      expect(onShortcut).toHaveBeenCalledWith(action);
    }
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
    expect(onShortcut).not.toHaveBeenCalled();
  });

  it('runs once per press, not once per auto-repeat event', () => {
    const event = key('s', { ctrlKey: true, repeat: true });
    // The default is still suppressed so the webview never adds its own
    // save-page behaviour, but the command must not queue up while held.
    expect(event.defaultPrevented).toBe(true);
    expect(onShortcut).not.toHaveBeenCalled();
  });
});
