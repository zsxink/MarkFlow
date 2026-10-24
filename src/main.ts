import { initTheme } from './infra/theme';
import { initEditor, isDocumentDirty } from './editor';
import { initToolbar } from './ui/toolbar';
import { initWindowControls } from './ui/window-controls';
import { initSidebar } from './ui/sidebar/index';
import { initMenu } from './ui/menu';
import { initStatusBar } from './ui/status-bar';
import { initKeyboard } from './utils/keyboard';
import { initNativeMenu } from './ui/native-menu';
import { invoke } from '@tauri-apps/api/core';
import { getWorkspace, loadSettings, addRecentFile } from './infra/storage';
import { setWorkspacePath, refreshFileTree, isSuppressedPath, getWorkspacePath, applyFileTreeEvents } from './ui/file-tree/index';
import { getActiveFilePath, openFileInEditor, saveActiveDocument, isSavingInProgress, switchSidebarTab } from './ui/sidebar/index';
import { shouldSuppressAutosave } from './editor';
import { showToast } from './ui/toast';
import { setToastReporter } from './infra/error';
import { store } from './infra/store';
import { initDocumentSessions, confirmAllDocumentTabsClose, routeDocumentExternalChanges, getActiveTabId, onDocumentTabsChanged } from './ui/documents/session';
import { isDocumentOperationPending } from './infra/document-operations';
import { initDocumentTabs } from './ui/document-tabs';
import './styles/document-tabs.css';
import { logDebug, logException, logInfo } from './infra/logger';
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
import { showEditorContextMenu } from './ui/editor-context-menu';
import { registerUiPorts } from './infra/ui-ports';
import { showDialog } from './ui/dialog';
import { showMermaidContextMenu } from './ui/mermaid-context-menu';
import { showPlantumlContextMenu } from './ui/plantuml-context-menu';
import { showTableContextMenu } from './ui/table-context-menu';
import { showImageContextMenu } from './ui/image-context-menu';
import { mountFrontmatterPanel, refreshFrontmatterPanel } from './ui/frontmatter-panel';
import { showDegradationBar, hideDegradationBar } from './ui/degradation-bar';
import { confirmDocumentTransitionInOperation } from './ui/sidebar/fileops';
import { handleActiveDocumentExternalModificationInOperation, handleExternalDeletionInOperation } from './ui/sidebar/conflict';

let autoSaveTimer: ReturnType<typeof setInterval> | null = null;
let settings: Settings = { ...DEFAULT_SETTINGS };

document.addEventListener('DOMContentLoaded', async () => {
  if (import.meta.env.MODE === 'e2e') {
    await import('@wdio/tauri-plugin');
  }

  logInfo('app.lifecycle', 'Application boot started');
  setToastReporter((msg) => showToast(msg));

  // Engine/render/export layers never import the UI layer; they call these
  // ports instead. This is the single assembly point.
  registerUiPorts({
    notify: (message, duration) => showToast(message, duration),
    confirm: (options) => showDialog(options),
    openDocument: (path) => openFileInEditor(path),
    showDiagramContextMenu: (x, y, state) => {
      // The diagram name decides which saver/menu variant applies; both menu
      // modules share the same state shape.
      if (/plantuml|puml/i.test(state.defaultName)) showPlantumlContextMenu(x, y, state);
      else showMermaidContextMenu(x, y, state);
    },
    showTableContextMenu: (x, y, state) => showTableContextMenu(x, y, state),
    showImageContextMenu: (x, y, state) => showImageContextMenu(x, y, state),
    refreshFrontmatter: (markdown) => refreshFrontmatterPanel(markdown),
    mountFrontmatter: (container) => mountFrontmatterPanel(container),
    showDegradationBar: (info) => showDegradationBar(info),
    hideDegradationBar: () => hideDegradationBar(),
    confirmDocumentTransition: () => confirmDocumentTransitionInOperation(),
    handleExternalModification: () => handleActiveDocumentExternalModificationInOperation(),
    handleExternalDeletion: (path) => handleExternalDeletionInOperation(path),
  });

  // Specialized editor/file-tree handlers stop propagation before this default menu.
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showEditorContextMenu(e);
  });

  initTheme();
  initSidebar();
  initMenu();
  initStatusBar();
  void import('./ui/settings/panel').then(m => m.initSettings());
  await initEditor();
  await initDocumentSessions();
  initDocumentTabs();
  onDocumentTabsChanged(() => {
    void getCurrentWebviewWindow().setTitle(document.title).catch(error => logDebug('document.tabs', 'Failed to update window title', { error: String(error) }));
  });
  initToolbar();
  initWindowControls();
  initKeyboard();
  await initNativeMenu();

  await listen<string>('file-open-requested', async (event) => { await openFileInEditor(event.payload); });

  // Pull model: fetch CLI file path from backend (replaces event-based model)
  // macOS sends file via RunEvent::Opened which may arrive after DOMContentLoaded
  const loadedSettings: Settings = await loadSettings().catch((e) => {
    logException('app.settings', 'Failed to load settings during startup', e);
    return DEFAULT_SETTINGS;
  });
  settings = loadedSettings;
  // Notify all listeners (including diagram node views) that settings are ready.
  // initEditor() runs before loadSettings(), so node views captured empty defaults.
  store.emit({ type: 'settings:changed', settings: loadedSettings });

  // Poll for CLI file with retries (macOS RunEvent may arrive late)
  let cliFiles: string[] = [];
  for (let i = 0; i < 5 && getCurrentWebviewWindow().label === 'main'; i++) {
    cliFiles = await invoke<string[]>('take_cli_files');
    if (cliFiles?.length) break;
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
  }

  if (!cliFiles?.length) {
    await restoreWorkspace();
  } else {
    for (const path of cliFiles) await openFileInEditor(path);
  }

  // Register this listener-ready window so native opens can route around a closed main window.
  invoke('mark_initial_file_handled').catch((e) =>
    logDebug('app.lifecycle', 'Failed to mark window ready for file opens (best-effort)', { error: String(e) }),
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
    await routeDocumentExternalChanges(changes);
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
  // Uses a per-window permission pattern: 1st close → prevent + emit, 2nd close → let through via confirm.
  listen<{ windowLabel: string }>('close-requested', async (event) => {
    // Ignore events targeted at a different window (defense in depth)
    if (event.payload.windowLabel !== getCurrentWebviewWindow().label) {
      return;
    }
    if (await confirmAllDocumentTabsClose()) await invoke('confirm_window_close');
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
  if (isDocumentOperationPending() || isSavingInProgress()) return; // skip — previous save still running
  if (!isDocumentDirty()) return;   // skip — no changes to persist
  if (shouldSuppressAutosave(store.getState().reconcileError)) return;
  const filePath = getActiveFilePath();
  const owner = getActiveTabId();
  if (filePath) {
    const result = await saveActiveDocument({ interactive: false });
    if (owner !== getActiveTabId()) return;
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
