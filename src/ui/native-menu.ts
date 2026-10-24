/**
 * Native menu action dispatcher (issue #362).
 *
 * Rust only forwards a stable action id through the `menu:action` event; every
 * behaviour below reuses the implementation that already backs the toolbar,
 * keyboard shortcuts and document sessions. No menu logic is duplicated — a
 * few simple view actions click the existing toolbar button so their state
 * (aria-pressed, mode indicator) stays in sync, while document-level actions
 * call the exported function directly.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import {
  closeAllDocumentTabs,
  closeDocumentTab,
  confirmAllDocumentTabsClose,
  cycleDocumentTab,
  getActiveTabId,
  newDocumentTab,
  onDocumentTabsChanged,
  reopenClosedDocumentTab,
} from './documents/session';
import { clearRecentHistory, loadSettings, onRecentHistoryChanged } from '../infra/storage';
import { classifyError } from '../infra/error';
import { getEditor, getMode } from '../editor';
import { getSourceView } from '../editor';
import { cycleTheme } from '../infra/theme';
import { store } from '../infra/store';
import { getWorkspacePath, closeWorkspaceFolder } from './file-tree/index';
import { activateWorkspaceFolder, openFileInEditor, openWorkspaceFolderFlow, saveActiveDocument, switchSidebarTab } from './sidebar/index';
import { saveActiveDocumentAsNewFile } from './sidebar/fileops';
import { showNewFileDialog } from './new-file-dialog';
import { showLinkDialog } from './link-dialog';
import { exportCurrentDocument, showImageInsertDialog } from './toolbar';
import { showToast } from './toast';
import { logException } from '../infra/logger';

const FEEDBACK_URL = 'https://github.com/zsxink/MarkFlow/issues';

/** Actions that stay usable while a modal dialog is open. */
const MODAL_SAFE_ACTIONS = new Set(['open-logs', 'feedback']);

type MenuHandler = () => unknown;

function click(id: string): void {
  document.getElementById(id)?.click();
}

function openWorkspaceFolder(): Promise<void> {
  return openWorkspaceFolderFlow();
}

function openMarkdownFile(): Promise<void> {
  return (async () => {
    const selected = await open({ multiple: false, filters: [{ name: 'Markdown', extensions: ['md'] }] });
    if (!selected) return;
    await openFileInEditor(selected);
  })();
}

/** Toggle WYSIWYG/source by clicking the opposite toolbar button. */
function toggleEditorMode(): void {
  click(getMode() === 'wysiwyg' ? 'btn-source' : 'btn-wysiwyg');
}

function showSidebarTab(tab: 'files' | 'outline'): void {
  // Expand through the existing toolbar command so the toggle button's icon and
  // aria-pressed stay in sync with the sidebar state.
  const sidebar = document.getElementById('sidebar');
  if (sidebar?.classList.contains('collapsed')) click('sidebar-toggle');
  switchSidebarTab(tab);
}

/**
 * Insert a literal markdown snippet (source mode) or editor text, then place
 * the selection over the placeholder so the user can type over it.
 */
function insertSnippet(snippet: string, selectFrom: number, selectTo: number): void {
  if (getMode() === 'source') {
    const view = getSourceView();
    if (!view) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: snippet },
      selection: { anchor: from + selectFrom, head: from + selectTo },
    });
    view.focus();
    return;
  }
  const editor = getEditor();
  if (!editor) return;
  const from = editor.state.selection.from;
  editor
    .chain()
    .focus()
    .insertContent(snippet)
    .setTextSelection({ from: from + selectFrom, to: from + selectTo })
    .run();
}

function toggleHeading(level: 1 | 2 | 3): void {
  getEditor()?.chain().focus().toggleHeading({ level }).run();
}

async function openSettings(): Promise<void> {
  const { showSettings } = await import('./settings/panel');
  showSettings();
}

async function openLogDirectory(): Promise<void> {
  const directory = await invoke<string>('get_log_dir');
  // Local paths go through the backend command: the shell plugin's URL
  // whitelist rejects normalized forward-slash Windows paths (issue #377).
  await invoke('open_in_file_manager', { path: directory });
}

async function openFeedback(): Promise<void> {
  await shellOpen(FEEDBACK_URL);
}

/** Close the window through the existing dirty-document confirmation flow. */
async function closeWindow(): Promise<void> {
  // Same sequence the window's close button drives: confirm unsaved documents,
  // then let the backend grant the close permission for this window.
  if (await confirmAllDocumentTabsClose()) await invoke('confirm_window_close');
}

/** Confirm unsaved documents, then quit the application. */
async function quitApplication(): Promise<void> {
  if (await confirmAllDocumentTabsClose()) await invoke('quit_app');
}

async function clearHistory(): Promise<void> {
  await clearRecentHistory();
  showToast('历史记录已清除');
}

async function openRecentFolder(path: string): Promise<void> {
  await activateWorkspaceFolder(path);
}

const actionHandlers: Record<string, MenuHandler> = {
  // 文件
  'new-file': () => showNewFileDialog('file', getWorkspacePath()),
  'new-folder': () => showNewFileDialog('folder', getWorkspacePath()),
  'new-tab': () => newDocumentTab(),
  'open-file': openMarkdownFile,
  'open-folder': openWorkspaceFolder,
  'close-workspace': closeWorkspaceFolder,
  save: () => saveActiveDocument(),
  'save-as': () => saveActiveDocumentAsNewFile(),
  'export-html': () => exportCurrentDocument('html'),
  'export-pdf': () => exportCurrentDocument('pdf'),
  'export-word': () => exportCurrentDocument('word'),
  'clear-history': clearHistory,
  'close-tab': () => {
    const id = getActiveTabId();
    if (id) void closeDocumentTab(id);
  },
  'close-window': closeWindow,
  quit: quitApplication,

  // 应用 / 文件（macOS 归入应用菜单，Windows 与 Linux 在文件菜单末尾）
  settings: openSettings,

  // 插入
  'insert-link': () => showLinkDialog(),
  'insert-code-block': () => click('btn-codeblock'),
  'insert-image': () => showImageInsertDialog(),
  // Formula delimiters stay literal text: the KaTeX plugin renders `$…$` and
  // `$$…$$` inside text, in both editor modes.
  'insert-math-block': () => insertSnippet('$$公式$$', 2, 4),
  'insert-table': () => {
    if (getMode() === 'source') {
      insertSnippet('| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |', 2, 5);
      return;
    }
    getEditor()?.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run();
  },
  'insert-ul': () => {
    if (getMode() === 'source') insertSnippet('- 列表项', 2, 5);
    else getEditor()?.chain().focus().toggleBulletList().run();
  },
  'insert-ol': () => {
    if (getMode() === 'source') insertSnippet('1. 列表项', 3, 6);
    else getEditor()?.chain().focus().toggleOrderedList().run();
  },
  'insert-task-list': () => {
    if (getMode() === 'source') insertSnippet('- [ ] 任务', 6, 8);
    else getEditor()?.chain().focus().toggleTaskList().run();
  },
  'inline-math': () => insertSnippet('$公式$', 1, 3),

  // 格式
  'heading-1': () => toggleHeading(1),
  'heading-2': () => toggleHeading(2),
  'heading-3': () => toggleHeading(3),
  paragraph: () => getEditor()?.chain().focus().setParagraph().run(),
  bold: () => getEditor()?.chain().focus().toggleBold().run(),
  italic: () => getEditor()?.chain().focus().toggleItalic().run(),
  'inline-code': () => getEditor()?.chain().focus().toggleCode().run(),
  strike: () => getEditor()?.chain().focus().toggleStrike().run(),

  // 视图
  'toggle-mode': toggleEditorMode,
  'toggle-sidebar': () => click('sidebar-toggle'),
  'show-tree': () => showSidebarTab('files'),
  'show-outline': () => showSidebarTab('outline'),
  'focus-mode': () => click('btn-focus'),
  'toggle-theme': () => cycleTheme(),

  // 窗口
  'next-tab': () => cycleDocumentTab(1),
  'previous-tab': () => cycleDocumentTab(-1),
  'reopen-tab': () => reopenClosedDocumentTab(),
  'close-all-tabs': () => closeAllDocumentTabs(),

  // 帮助
  'open-logs': openLogDirectory,
  feedback: openFeedback,
};

/** Whether a modal dialog is currently open (spec: 模态保护). */
function isModalOpen(): boolean {
  return Boolean(document.querySelector('[aria-modal="true"]'));
}

/**
 * Dispatch one native menu action id.
 * Returns `true` when the id is recognised (including recent-history ids and
 * ids that were suppressed because a modal is open).
 */
export async function dispatchNativeMenuAction(action: string): Promise<boolean> {
  const recentFile = action.startsWith('recent-file:');
  const recentFolder = action.startsWith('recent-folder:');
  const handler = actionHandlers[action];
  if (!handler && !recentFile && !recentFolder) return false;

  if (isModalOpen() && !MODAL_SAFE_ACTIONS.has(action)) return true;

  try {
    if (recentFile) await openFileInEditor(action.slice('recent-file:'.length));
    else if (recentFolder) await openRecentFolder(action.slice('recent-folder:'.length));
    else await handler?.();
  } catch (error) {
    logException('native-menu', 'Native menu action failed', error, { action });
    // Lower-layer handlers mostly toast-and-swallow their own failures; this
    // toast covers errors that still propagate up. An occasional duplicate
    // toast for the same failure is accepted over silent menu actions.
    showToast(`操作失败: ${classifyError(error).message}`);
  }
  // Workspace/document/recent state may have changed; keep the native menu in step.
  await syncNativeMenuState();
  return true;
}

/**
 * Last reported payload, so state sources that fire far more often than the
 * menu actually changes (every dirty flip notifies tab listeners) do not each
 * cost an IPC round-trip plus ~40 main-thread menu updates on the Rust side.
 */
let lastReportedState = '';

/** Report workspace, active document and recent history to the native menu. */
export async function syncNativeMenuState(): Promise<void> {
  try {
    const settings = await loadSettings();
    const payload = {
      hasWorkspace: Boolean(getWorkspacePath()),
      hasDocument: getActiveTabId() !== null,
      recentFiles: settings.recentFiles ?? [],
      recentFolders: settings.recentFolders ?? [],
    };
    const serialized = JSON.stringify(payload);
    if (serialized === lastReportedState) return;
    await invoke('update_menu_state', payload);
    lastReportedState = serialized;
  } catch (error) {
    logException('native-menu', 'Failed to sync native menu state', error);
  }
}

/** @visibleForTesting — allow tests to forget the last reported payload. */
export function resetNativeMenuStateCache(): void {
  lastReportedState = '';
}

/**
 * Subscribe the native menu to window state and action events.
 *
 * Never throws: the menu bridge is an enhancement, so a failure to subscribe
 * (e.g. no Tauri runtime, plugin unavailable) must not abort application boot.
 */
export async function initNativeMenu(): Promise<void> {
  try {
    await listen<string>('menu:action', (event) => {
      void dispatchNativeMenuAction(event.payload);
    });
  } catch (error) {
    logException('native-menu', 'Failed to subscribe to native menu actions', error);
    return;
  }

  // Document tabs, workspace switches and recent-history edits all change what
  // the menu may enable, so every source reports through the same sync.
  onDocumentTabsChanged(() => {
    void syncNativeMenuState();
  });
  store.on('workspace:set', () => {
    void syncNativeMenuState();
  });
  onRecentHistoryChanged(() => {
    void syncNativeMenuState();
  });

  await syncNativeMenuState();
}
