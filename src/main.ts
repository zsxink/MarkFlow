import { initTheme } from './lib/theme';
import { initEditor, isDocumentDirty, markExternalModification } from './lib/editor';
import { initToolbar } from './components/toolbar';
import { initSidebar } from './components/sidebar';
import { initMenu } from './components/menu';
import { initStatusBar } from './components/statusbar';
import { initSettings } from './components/settings';
import { initKeyboard } from './utils/keyboard';
import { invoke } from '@tauri-apps/api/core';
import { getWorkspace, loadSettings, addRecentFile } from './lib/storage';
import { setWorkspacePath, refreshFileTree, isSuppressedPath, getWorkspacePath } from './components/fileTree';
import { getActiveFilePath, handleActiveDocumentExternalModification, handleExternalDeletion, openFileInEditor, saveActiveDocument, switchSidebarTab } from './components/sidebar';
import { showToast } from './components/toast';
import { showUnsavedDialog } from './components/unsavedDialog';
import { logDebug, logException, logInfo } from './lib/logger';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import './styles/variables.css';
import './styles/main.css';

interface FileChangeEvent {
  path: string;
  kind: string;
  timestamp: number;
}

let autoSaveTimer: ReturnType<typeof setInterval> | null = null;
let settings: Record<string, unknown> = {};

document.addEventListener('DOMContentLoaded', async () => {
  logInfo('app.lifecycle', 'Application boot started');

  // Block contextmenu outside sidebar (sidebar handles its own)
  document.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('#sidebar')) {
      e.preventDefault();
    }
  });

  initTheme();
  initSidebar();
  initMenu();
  initStatusBar();
  initSettings();
  await initEditor();
  initToolbar();
  initKeyboard();

  // Pull model: fetch CLI file path from backend (replaces event-based model)
  // macOS sends file via RunEvent::Opened which may arrive after DOMContentLoaded
  const loadedSettings = await loadSettings().catch((e) => {
    logException('app.settings', 'Failed to load settings during startup', e);
    return {};
  });
  settings = loadedSettings;

  // Poll for CLI file with retries (macOS RunEvent may arrive late)
  let cliFilePath: string | null = null;
  for (let i = 0; i < 5; i++) {
    cliFilePath = await invoke<string | null>('take_cli_file');
    if (cliFilePath) break;
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
  }

  if (!cliFilePath) {
    await restoreWorkspace();
  } else {
    logInfo('app.lifecycle', 'Opening CLI file in current window', { path: cliFilePath });
    await addRecentFile(cliFilePath);
    await openFileInEditor(cliFilePath);
  }

  // Mark that initial file handling is done — subsequent RunEvent::Opened opens new windows
  invoke('mark_initial_file_handled').catch(() => {});

  // Restore sidebar tab preference
  const wsPath = getWorkspacePath();
  const lastTab = (loadedSettings as any)?.lastSidebarTab as string | undefined;
  if (lastTab && wsPath) {
    switchSidebarTab(lastTab as 'files' | 'outline');
  }

  document.addEventListener('settings-changed', (event) => {
    settings = (event as CustomEvent<Record<string, unknown>>).detail || {};
    startAutoSave();
  });

  listen<FileChangeEvent>('file-changed', async (event) => {
    const { path, kind } = event.payload;
    if (isSuppressedPath(path)) return;
    const activePath = getActiveFilePath();
    if (activePath && path === activePath && kind === 'modify') {
      const result = await handleActiveDocumentExternalModification();
      if (result === 'reloaded') {
        showToast('文件已从磁盘重新加载');
      } else if (result === 'kept') {
        showToast('已保留当前内容，自动保存已暂停');
      } else if (result === 'failed') {
        markExternalModification();
        showToast('文件已被外部修改，自动保存已暂停');
      }
    }
    if (kind === 'delete') {
      const result = await handleExternalDeletion(path);
      if (result === 'discarded') {
        showToast('当前文件已删除并已放弃当前内容');
      } else if (result === 'cleared') {
        showToast('当前文件已被外部删除');
      } else if (result === 'failed') {
        showToast('重新保存失败，当前内容已保留');
      }
    }
    if (kind === 'create' || kind === 'delete') {
      refreshFileTree();
    }
  });

  // Pull pending file path if opened via open_file_in_new_window
  try {
    const winLabel = getCurrentWebviewWindow().label;
    const pendingPath = await invoke<string | null>('take_pending_file', { windowLabel: winLabel });
    if (pendingPath) {
      logInfo('app.lifecycle', 'Opening pending file in new window', { path: pendingPath });
      await addRecentFile(pendingPath);
      await openFileInEditor(pendingPath);
    }
  } catch (e) {
    logException('app.lifecycle', 'Failed to pull pending file', e);
  }

  // Save window state on close for next window to inherit
  window.addEventListener('beforeunload', async () => {
    try {
      const win = getCurrentWebviewWindow();
      const pos = await win.outerPosition();
      const size = await win.outerSize();
      const x = pos.x;
      const y = pos.y;
      const w = size.width;
      const h = size.height;
      invoke('save_last_window_state', { x, y, width: w, height: h }).catch(() => {});
    } catch { /* ignore errors on close */ }
  });

  // Intercept close request: prompt to save if document is dirty
  // Close requests are intercepted on the Rust side (WebviewWindow::on_window_event)
  // which prevents the native close and emits a custom "close-requested" event.
  // Uses a flag pattern: 1st close → prevent + emit, 2nd close → let through via confirm.
  listen<null>('close-requested', async () => {
    if (!isDocumentDirty()) {
      await invoke('confirm_window_close');
      return;
    }
    showUnsavedDialog(async () => {
      await invoke('confirm_window_close');
    });
  });

startAutoSave();
});

async function restoreWorkspace() {
  try {
    const lastWorkspace = await getWorkspace();
    if (lastWorkspace) {
      await setWorkspacePath(lastWorkspace);
      await refreshFileTree();
      logInfo('app.workspace', 'Restored workspace', { path: lastWorkspace });
    }
  } catch (e) {
    logException('app.workspace', 'Failed to restore workspace', e);
  }
}

function startAutoSave() {
  stopAutoSave();
  const enabled = settings.autosave !== false;
  const interval = (settings.autosaveInterval as number) || 10000;
  logDebug('app.autosave', 'Updated autosave schedule', { enabled, interval });

  if (enabled) {
    autoSaveTimer = setInterval(async () => {
      const filePath = getActiveFilePath();
      if (filePath) {
        await saveActiveDocument({ interactive: false });
      }
    }, interval);
  }
}

function stopAutoSave() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
}
