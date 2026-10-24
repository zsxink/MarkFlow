/**
 * Global keyboard handling.
 *
 * The native menu bar (`src-tauri/src/menu.rs`) declares the application
 * shortcuts and normally claims them before the webview sees the key: the OS
 * dispatches the menu action and `src/ui/native-menu.ts` executes it.
 *
 * What stays here:
 *  - the canonical mirror of the native accelerator table, so the DOM can
 *    recognise those events and suppress the browser's default behaviour
 *    (e.g. Ctrl/Cmd+S saving the page, Ctrl+W closing the window);
 *  - the fallback for chords the menu did not claim. A `keydown` reaching the
 *    DOM for a menu-owned accelerator means the item was disabled or the
 *    platform kept the key, and the shortcut would otherwise do nothing
 *    (issue #410). The command then runs through the injected runner, which
 *    de-duplicates against the native path.
 *
 * Keep `NATIVE_MENU_SHORTCUTS` in sync with the accelerators declared in
 * `src-tauri/src/menu.rs` (its unit tests assert they stay unique).
 */

/** A keyboard shortcut owned by a native menu item. */
export interface NativeMenuShortcut {
  /** Lower-cased `KeyboardEvent.key`. */
  key: string;
  /** Menu action id dispatched by the native menu. */
  action: string;
  shift?: boolean;
  alt?: boolean;
  /** Require Control specifically (native `Ctrl+…`, not `Cmd+…`). */
  controlOnly?: boolean;
  /**
   * The menu item is a ⬜ placeholder, so no command exists for it. The DOM
   * handler must not suppress the key: a disabled menu item never fires, and
   * swallowing the accelerator would silently break the browser default (find,
   * print, page zoom) that still worked before the menu bar existed.
   */
  placeholder?: boolean;
}

/** Native menu accelerators, mirroring `src-tauri/src/menu.rs`. */
export const NATIVE_MENU_SHORTCUTS: readonly NativeMenuShortcut[] = [
  // 应用菜单 (macOS) / 文件 (Windows, Linux)
  { key: ',', action: 'settings' },
  // 文件
  { key: 'n', action: 'new-file' },
  { key: 'n', shift: true, action: 'new-folder' },
  { key: 't', action: 'new-tab' },
  { key: 't', shift: true, action: 'reopen-tab' },
  { key: 'o', action: 'open-file' },
  { key: 'p', action: 'quick-switch', placeholder: true },
  { key: 's', action: 'save' },
  { key: 'w', action: 'close-tab' },
  { key: 'w', shift: true, action: 'close-window' },
  { key: 'q', action: 'quit' },
  // 编辑
  { key: 'f', action: 'find', placeholder: true },
  { key: 'f', alt: true, action: 'replace', placeholder: true },
  // 插入
  { key: 'k', action: 'insert-link' },
  { key: 'l', action: 'insert-task-list' },
  // 格式
  { key: '1', action: 'heading-1' },
  { key: '2', action: 'heading-2' },
  { key: '3', action: 'heading-3' },
  { key: '4', action: 'heading-4', placeholder: true },
  { key: '5', action: 'heading-5', placeholder: true },
  { key: '6', action: 'heading-6', placeholder: true },
  { key: '0', action: 'paragraph' },
  { key: 'b', action: 'bold' },
  { key: 'i', action: 'italic' },
  { key: '`', action: 'inline-code' },
  { key: 's', shift: true, action: 'strike' },
  // 视图
  { key: '/', action: 'toggle-mode' },
  { key: '\\', action: 'toggle-sidebar' },
  { key: 'f', shift: true, action: 'focus-mode' },
  { key: '=', action: 'zoom-in', placeholder: true },
  { key: '-', action: 'zoom-out', placeholder: true },
  { key: 'i', alt: true, action: 'devtools' },
  // 窗口
  { key: 'tab', controlOnly: true, action: 'next-tab' },
  { key: 'tab', controlOnly: true, shift: true, action: 'previous-tab' },
];

/**
 * Resolve the native menu action a key event belongs to, or `null` when the
 * native menu does not own it. Cmd (macOS) and Ctrl (elsewhere) are equivalent
 * except for accelerators that explicitly require Control.
 *
 * Placeholder (⬜) accelerators resolve to `null`: their menu item is disabled,
 * so nothing would run and the browser default must stay intact.
 */
export function resolveNativeMenuShortcut(event: KeyboardEvent): string | null {
  const primary = event.ctrlKey || event.metaKey;
  if (!primary) return null;
  const key = event.key.toLowerCase();
  for (const shortcut of NATIVE_MENU_SHORTCUTS) {
    if (shortcut.key !== key) continue;
    if (Boolean(shortcut.shift) !== event.shiftKey) continue;
    if (Boolean(shortcut.alt) !== event.altKey) continue;
    if (shortcut.controlOnly && !event.ctrlKey) continue;
    if (shortcut.placeholder) return null;
    return shortcut.action;
  }
  return null;
}

/** Runs the command a native accelerator would have triggered. */
export type ShortcutRunner = (action: string) => void;

export interface KeyboardOptions {
  /**
   * Executes the command for a shortcut whose native accelerator did not fire.
   *
   * AppKit matches menu key equivalents before the webview receives the event,
   * so a `keydown` that reaches this handler is proof the menu did not claim
   * the chord: the item is disabled, or the platform/webview kept it. Ignoring
   * it here leaves the shortcut completely dead (issue #410: ⌘S with a
   * workspace and a document open did nothing at all), so the command runs
   * from the DOM instead. The dispatcher de-duplicates against the native
   * path, keeping "each key press runs the command once".
   */
  onShortcut?: ShortcutRunner;
}

/**
 * Register the global keydown handler.
 *
 * Native accelerators stay the primary path — when the menu claims the chord
 * the webview never sees the event. What remains here is the fallback for the
 * chords the menu did not take, plus suppressing the browser default so the
 * webview never applies its own action (Ctrl/Cmd+S saving the page, Ctrl+W
 * closing the window).
 *
 * Known platform caveat: `Ctrl+Tab` / `Ctrl+Shift+Tab` are focus-traversal keys
 * in some webviews. If the webview still delivers that keydown, the fallback
 * below covers tab cycling; if it swallows the event entirely, nothing here can
 * help and the native accelerator has to be the one that works.
 */
export function initKeyboard(options: KeyboardOptions = {}): void {
  const { onShortcut } = options;
  document.addEventListener('keydown', (event) => {
    const action = resolveNativeMenuShortcut(event);
    if (!action) return;
    // Suppress the browser default even for repeats: the menu path, when it
    // fires, does not go through the webview at all.
    event.preventDefault();
    // Holding a chord must not queue a burst of commands; one press, one run.
    if (event.repeat) return;
    onShortcut?.(action);
  });
}
