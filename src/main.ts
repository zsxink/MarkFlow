import { initTheme } from './lib/theme';
import { initEditor, markExternalModification } from './lib/editor';
import { initToolbar } from './components/toolbar';
import { initSidebar } from './components/sidebar';
import { initStatusBar } from './components/statusbar';
import { initSettings } from './components/settings';
import { initKeyboard } from './utils/keyboard';
import { getWorkspace, loadSettings } from './lib/storage';
import { setWorkspacePath, refreshFileTree, isSuppressedPath } from './components/fileTree';
import { getActiveFilePath, handleExternalDeletion, saveActiveDocument } from './components/sidebar';
import { showToast } from './components/toast';
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
  // Block contextmenu outside sidebar (sidebar handles its own)
  document.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('#sidebar')) {
      e.preventDefault();
    }
  });

  initTheme();
  initSidebar();
  initStatusBar();
  initSettings();
  await initEditor();
  initToolbar();
  initKeyboard();

  const [loadedSettings] = await Promise.all([
    loadSettings().catch((e) => { console.error('Failed to load settings:', e); return {}; }),
    restoreWorkspace(),
  ]);
  settings = loadedSettings;

  document.addEventListener('settings-changed', (event) => {
    settings = (event as CustomEvent<Record<string, unknown>>).detail || {};
    startAutoSave();
  });

  listen<FileChangeEvent>('file-changed', (event) => {
    const { path, kind } = event.payload;
    if (isSuppressedPath(path)) return;
    const activePath = getActiveFilePath();
    if (activePath && path === activePath && kind === 'modify') {
      markExternalModification();
      showToast('文件已被外部修改，自动保存已暂停');
    }
    if (kind === 'delete' && handleExternalDeletion(path)) {
      markExternalModification();
      showToast('当前文件已被外部删除，自动保存已暂停');
    }
    if (kind === 'create' || kind === 'delete') {
      refreshFileTree();
    }
  });

  startAutoSave();
});

async function restoreWorkspace() {
  try {
    const lastWorkspace = await getWorkspace();
    if (lastWorkspace) {
      await setWorkspacePath(lastWorkspace);
      await refreshFileTree();
    }
  } catch (e) {
    console.error('Failed to restore workspace:', e);
  }
}

function startAutoSave() {
  stopAutoSave();
  const enabled = settings.autosave !== false;
  const interval = (settings.autosaveInterval as number) || 10000;

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
