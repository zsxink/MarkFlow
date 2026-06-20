import { initTheme } from './lib/theme';
import { initEditor, markExternalModification } from './lib/editor';
import { initToolbar } from './components/toolbar';
import { initSidebar } from './components/sidebar';
import { initMenu } from './components/menu';
import { initStatusBar } from './components/statusbar';
import { initSettings } from './components/settings';
import { initKeyboard } from './utils/keyboard';
import { getWorkspace, loadSettings, hasCliFile, addRecentFile, openFileInNewWindow } from './lib/storage';
import { setWorkspacePath, refreshFileTree, isSuppressedPath, getWorkspacePath } from './components/fileTree';
import { getActiveFilePath, handleActiveDocumentExternalModification, handleExternalDeletion, openFileInEditor, saveActiveDocument, switchSidebarTab } from './components/sidebar';
import { showToast } from './components/toast';
import { logDebug, logException, logInfo } from './lib/logger';
import { listen } from '@tauri-apps/api/event';
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

  const [loadedSettings, cliFile] = await Promise.all([
    loadSettings().catch((e) => {
      logException('app.settings', 'Failed to load settings during startup', e);
      return {};
    }),
    hasCliFile(),
  ]);
  settings = loadedSettings;

  if (!cliFile) {
    await restoreWorkspace();
  } else {
    logInfo('app.lifecycle', 'Skipping workspace restore (single-file mode)');
  }

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

  // Handle file opened via CLI (first launch, file association)
  listen<string>('open-file-from-cli', async (event) => {
    const filePath = event.payload;
    logInfo('app.lifecycle', 'Opening file from CLI', { path: filePath });
    await addRecentFile(filePath);
    await openFileInEditor(filePath);
  });

  // Handle file opened while app already running (macOS RunEvent::Opened)
  listen<string>('open-file-from-system', async (event) => {
    const filePath = event.payload;
    logInfo('app.lifecycle', 'Opening file from system event', { path: filePath });
    await addRecentFile(filePath);
    await openFileInNewWindow(filePath);
  });

  // Handle file opened in a new window (via open_file_in_new_window Rust command)
  listen<string>('open-file-in-window', async (event) => {
    const filePath = event.payload;
    logInfo('app.lifecycle', 'Opening file in new window', { path: filePath });
    await addRecentFile(filePath);
    await openFileInEditor(filePath);
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
