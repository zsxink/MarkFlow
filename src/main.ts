import { initTheme } from './lib/theme';
import { initEditor, isDocumentDirty, markExternalModification } from './lib/editor';
import { initToolbar } from './components/toolbar';
import { initSidebar } from './components/sidebar';
import { initMenu } from './components/menu';
import { initStatusBar } from './components/statusbar';
import { initKeyboard } from './utils/keyboard';
import { invoke } from '@tauri-apps/api/core';
import { getWorkspace, loadSettings, addRecentFile } from './lib/storage';
import { setWorkspacePath, refreshFileTree, isSuppressedPath, getWorkspacePath, applyFileTreeEvents } from './components/fileTree';
import { getActiveFilePath, handleActiveDocumentExternalModification, handleExternalDeletion, openFileInEditor, saveActiveDocument, isSavingInProgress, switchSidebarTab } from './components/sidebar';
import { showToast } from './components/toast';
import { setToastReporter } from './lib/error';
import { store } from './lib/store';
import { showUnsavedDialog } from './components/unsavedDialog';
import { logDebug, logException, logInfo } from './lib/logger';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import './styles/variables.css';
import './styles/app.css';
import './styles/toolbar.css';
import './styles/sidebar.css';
import './styles/editor.css';
import './styles/components.css';
import type { FileChangeEvent } from './types/events';
import type { Settings } from './types/settings';
import { DEFAULT_SETTINGS } from './types/settings';

let autoSaveTimer: ReturnType<typeof setInterval> | null = null;
let settings: Settings = { ...DEFAULT_SETTINGS };

document.addEventListener('DOMContentLoaded', async () => {
  if (import.meta.env.MODE === 'e2e') {
    await import('@wdio/tauri-plugin');
  }

  logInfo('app.lifecycle', 'Application boot started');
  setToastReporter((msg) => showToast(msg));

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
  void import('./components/settings').then(m => m.initSettings());
  await initEditor();
  initToolbar();
  initKeyboard();

  // Pull model: fetch CLI file path from backend (replaces event-based model)
  // macOS sends file via RunEvent::Opened which may arrive after DOMContentLoaded
  const loadedSettings = await loadSettings().catch((e) => {
    logException('app.settings', 'Failed to load settings during startup', e);
    return DEFAULT_SETTINGS;
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
  invoke('mark_initial_file_handled').catch((e) =>
    logDebug('app.lifecycle', 'Failed to mark initial file handled (best-effort)', { error: String(e) }),
  );

  // Restore sidebar tab preference
  const wsPath = getWorkspacePath();
  const lastTab = loadedSettings.lastSidebarTab;
  if (lastTab && wsPath) {
    switchSidebarTab(lastTab as 'files' | 'outline');
  }

  store.on('settings:changed', (event) => {
    const fileTreeSettingsChanged = JSON.stringify(settings.fileTreeIgnorePatterns) !== JSON.stringify(event.settings.fileTreeIgnorePatterns)
      || settings.fileTreePageSize !== event.settings.fileTreePageSize
      || settings.fileTreeAutoLoadDepth !== event.settings.fileTreeAutoLoadDepth;
    settings = event.settings;
    startAutoSave();
    if (fileTreeSettingsChanged) {
      const workspace = getWorkspacePath();
      if (workspace) void setWorkspacePath(workspace).then(() => refreshFileTree());
    }
  });

  listen<FileChangeEvent[]>('file-tree-events', async (event) => {
    const changes = event.payload.filter(change => !isSuppressedPath(change.path));
    for (const { path, kind } of changes) {
      const activePath = getActiveFilePath();
      if (activePath && path === activePath && kind === 'modify') {
        const result = await handleActiveDocumentExternalModification();
        if (result === 'reloaded') showToast('文件已从磁盘重新加载');
        else if (result === 'kept') showToast('已保留当前内容，自动保存已暂停');
        else if (result === 'failed') {
          markExternalModification();
          showToast('文件已被外部修改，自动保存已暂停');
        }
      }
      if (kind === 'delete') {
        const result = await handleExternalDeletion(path);
        if (result === 'discarded') showToast('当前文件已删除并已放弃当前内容');
        else if (result === 'cleared') showToast('当前文件已被外部删除');
        else if (result === 'failed') showToast('重新保存失败，当前内容已保留');
      }
    }
    await applyFileTreeEvents(changes);
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
      invoke('save_last_window_state', { x, y, width: w, height: h })
        .catch((e) => logDebug('app.lifecycle', 'Failed to save window state on close (best-effort)', { error: String(e) }));
    } catch (e) {
      logDebug('app.lifecycle', 'Error while saving window state on close (best-effort)', { error: String(e) });
    }
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
  document.getElementById('app')?.setAttribute('data-app-ready', 'true');
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

/** Single autosave tick — extracted for testability. */
export async function runAutoSaveTick() {
  if (isSavingInProgress()) return; // skip — previous save still running
  if (!isDocumentDirty()) return;   // skip — no changes to persist
  const filePath = getActiveFilePath();
  if (filePath) {
    const result = await saveActiveDocument({ interactive: false });
    // Persistent visibility: only count actual write failures as errors;
    // skips (clean doc, in-progress, external mod) are not failures.
    if (result === 'failed') {
      const next = store.getState().autosaveErrorCount + 1;
      store.setState({ autosaveErrorCount: next });
    } else if (result === 'saved') {
      if (store.getState().autosaveErrorCount !== 0) {
        store.setState({ autosaveErrorCount: 0 });
      }
    }
    // 'skipped' — no action needed
  }
}

function startAutoSave() {
  stopAutoSave();
  const enabled = settings.autosave !== false;
  const interval = settings.autosaveInterval || 10000;
  logDebug('app.autosave', 'Updated autosave schedule', { enabled, interval });

  if (enabled) {
    autoSaveTimer = setInterval(runAutoSaveTick, interval);
  }
}

function stopAutoSave() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
}
