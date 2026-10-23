/**
 * Global keyboard handling.
 *
 * The native menu bar (`src-tauri/src/menu.rs`) owns the application
 * shortcuts: the OS consumes the key, dispatches the menu action, and
 * `src/utils/nativeMenu.ts` executes it. The DOM handler therefore must not
 * execute the same command a second time (keyboard-shortcuts spec: 前端不得重复
 * 处理同一按键事件).
 *
 * What stays here:
 *  - the canonical mirror of the native accelerator table, so the DOM can
 *    recognise those events and suppress the browser's default behaviour
 *    (e.g. Ctrl/Cmd+S saving the page, Ctrl+W closing the window) without
 *    running the command;
 *  - nothing else: every global shortcut in MarkFlow is a native accelerator.
 *    Shortcuts the native menu does not own must be added back here.
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

/**
 * Register the global keydown handler. Only browser defaults for native-menu
 * accelerators are handled here; the commands themselves belong to the native
 * menu and its frontend dispatcher.
 *
 * Known platform caveat: `Ctrl+Tab` / `Ctrl+Shift+Tab` are focus-traversal keys
 * in some webviews. If a platform consumes them before the native accelerator
 * fires, tab cycling needs a DOM fallback again — re-add it here rather than in
 * a second handler, so the command still runs exactly once.
 */
export function initKeyboard(): void {
  document.addEventListener('keydown', (event) => {
    if (!resolveNativeMenuShortcut(event)) return;
    // The native accelerator runs the command; suppressing the default keeps
    // the webview from also applying its own browser shortcut. Never execute
    // the command here — that would double-run native menu actions.
    event.preventDefault();
  });
}
