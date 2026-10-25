import { invoke } from '@tauri-apps/api/core';
import { store } from '../../infra/store';
import { normalizePathSegments, getFileName } from '../../utils/paths';
import { getDocumentState, markExternalModification } from '../../editor';
import { getEditor } from '../../editor';
import { getSourceView } from '../../editor';
import {
  attachEditorDocument, detachEditorDocument, releaseEditorDocument,
  resetEditorDocument, flushEditorDirtyCheck, type EditorDocumentContext,
} from '../../editor';
import { settleImageOperations } from '../../infra/images/core';
import { runDocumentOperation } from '../../infra/document-operations';
import { authorizePreviewDirectory } from '../../infra/storage';
import { showToast } from '../toast';
import { hideDegradationBar } from '../degradation-bar';
import { logDebug, logException } from '../../infra/logger';
import { registerDocumentTabHooks } from './hooks';
import { hideImagePreview, showImagePreview } from './image-preview';
import { uiPorts } from '../../infra/ui-ports';

export const MAX_DOCUMENT_TABS = 20;
interface DocumentSession {
  id: string;
  path: string | null;
  title: string;
  /** `document` 会话挂编辑器；`image` 会话只渲染预览面，无编辑器上下文。 */
  kind: 'document' | 'image';
  context: EditorDocumentContext | null;
  pendingExternal: 'modify' | 'delete' | null;
  degradation: HTMLElement | null;
  /** True only for the tab created by `initDocumentSessions` at app startup. */
  startup: boolean;
}
export interface DocumentTab { id: string; path: string | null; title: string; dirty: boolean; kind: 'document' | 'image' }
let sessions: DocumentSession[] = [];
let activeId: string | null = null;
let sequence = 0;
let restoreTail: Promise<boolean> = Promise.resolve(false);
const closedPaths: string[] = [];
const listeners = new Set<() => void>();
let publishing = false;

export function getActiveTabId(): string | null { return activeId; }
export function getDocumentTabs(): readonly DocumentTab[] {
  return sessions.map(tab => ({
    id: tab.id, path: tab.path, title: tab.path ? getFileName(tab.path) : tab.title,
    dirty: tab.kind === 'image' ? false : tab.id === activeId ? store.getState().dirty : Boolean(tab.context?.projection.dirty),
    kind: tab.kind,
  }));
}
export function onDocumentTabsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function notify() {
  const tab = current();
  document.title = tab ? `${tab.path ? getFileName(tab.path) : tab.title}${store.getState().dirty ? '*' : ''}` : 'MarkFlow';
  for (const listener of listeners) listener();
}
function current() { return sessions.find(tab => tab.id === activeId); }
function canonical(path: string) { return normalizePathSegments(path.replace(/\\/g, '/')); }
function matches(path: string | null, prefix: string) {
  return path !== null && (path === prefix || path.startsWith(`${prefix}/`));
}
function hasCapacity() {
  if (sessions.length < MAX_DOCUMENT_TABS) return true;
  showToast('最多打开 20 个文件，请先关闭一些文件');
  return false;
}
function project() {
  document.querySelectorAll<HTMLElement>('.tree-file').forEach(el => {
    el.classList.toggle('active', el.dataset.path === current()?.path);
  });
  const active = current();
  const empty = activeId === null;
  const area = document.getElementById('editor-area');
  area?.classList.toggle('document-empty', empty);
  // 图片会话激活时预览面接管内容区，编辑器挂载点由 CSS 让位。
  const previewing = active?.kind === 'image' && active.path !== null;
  area?.classList.toggle('preview-active', Boolean(previewing));
  if (previewing) showImagePreview(active!.path!);
  else hideImagePreview();
  let placeholder = document.getElementById('document-empty-state');
  if (empty && area && !placeholder) {
    placeholder = document.createElement('div');
    placeholder.id = 'document-empty-state';
    placeholder.className = 'empty-state document-empty-state';
    const text = document.createElement('p');
    text.textContent = '打开文件或新建标签，开始写作';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-secondary';
    button.textContent = '新建标签';
    button.addEventListener('click', () => { void newDocumentTab(); });
    placeholder.append(text, button);
    area.append(placeholder);
  }
  if (!empty) placeholder?.remove();
  if (empty) getEditor()?.setEditable(false, false);
  // Outline and frontmatter already subscribe to this event. Refreshing them
  // directly too would traverse/render the same document twice on every switch.
  store.emit({ type: 'editor:update' });
  notify();
}
function suspendCurrent() {
  const tab = current();
  if (!tab) return false;
  // 图片会话不持有编辑器文档；挂起时无需（也不得）抓取编辑器状态。
  if (tab.kind === 'image') return false;
  // CM's hasFocus also checks whether the whole window is foreground, unlike
  // PM's predicate. Focus transfer depends on which surface owns the active
  // DOM element, including when a window is restored in the background.
  const activeElement = document.activeElement;
  const focused = Boolean(activeElement && (
    getEditor()?.view.dom.contains(activeElement) || getSourceView()?.contentDOM.contains(activeElement)
  ));
  tab.context = detachEditorDocument();
  tab.path = store.getState().activeFilePath;
  tab.degradation = document.getElementById('degradation-bar');
  tab.degradation?.remove();
  return focused;
}
function restore(tab: DocumentSession, focusEditor = false) {
  activeId = tab.id;
  publishing = true;
  try {
    if (tab.kind === 'image') {
      // 图片会话不挂编辑器：清空切换来源文档的活动路径/脏标记投影，标题只显示文件名。
      store.stageState({ activeFilePath: null, dirty: false });
      store.setState({ activeFilePath: null, dirty: false });
    } else {
      const context = tab.context;
      store.stageState({ ...(context?.projection ?? {}), activeFilePath: tab.path });
      if (context) attachEditorDocument(context, false, focusEditor);
      store.setState({ ...(context?.projection ?? {}), activeFilePath: tab.path });
      tab.context = null;
    }
  } finally { publishing = false; }
  hideDegradationBar();
  if (tab.kind === 'image') {
    // 切换来源可能是源码模式（editor-area overflow: hidden）；预览接管滚动。
    document.getElementById('editor-area')?.classList.toggle('source-mode', false);
  } else if (tab.degradation) {
    tab.degradation.hidden = store.getState().mode !== 'source';
    document.getElementById('editor-area')?.prepend(tab.degradation);
  }
  project();
}
async function checkExternal(tab: DocumentSession) {
  // 图片会话无未保存状态：外部修改/删除不弹确认，激活时按预览加载失败降级。
  if (tab.kind === 'image' || !tab.path) return;
  const state = getDocumentState();
  if (!tab.pendingExternal && state.lastReadStatsKnown) {
    try {
      const stats = await invoke<{ mtime: number; size: number }>('get_file_stats', { path: tab.path });
      if (stats.mtime !== state.lastReadMtime || stats.size !== state.lastReadSize) tab.pendingExternal = 'modify';
    } catch (error) {
      tab.pendingExternal = /not found|no such|不存在/i.test(String(error)) ? 'delete' : 'modify';
    }
  }
  if (!tab.pendingExternal) return;
  const kind = tab.pendingExternal;
  tab.pendingExternal = null;
  markExternalModification();
  if (kind === 'delete') await uiPorts.handleExternalDeletion(tab.path);
  else {
    const result = await uiPorts.handleExternalModification();
    if (result === 'reloaded') showToast('文件已从磁盘重新加载');
    else showToast('已保留当前内容，自动保存已暂停');
  }
  project();
}
async function activateInternal(id: string, check = true) {
  const tab = sessions.find(item => item.id === id);
  if (!tab) return false;
  await settleImageOperations();
  if (id !== activeId) {
    const previous = current();
    const focusEditor = suspendCurrent();
    try { restore(tab, focusEditor); }
    catch (error) {
      if (previous) restore(previous, focusEditor);
      else emptyInternal();
      logException('document.tabs', 'Failed to restore document context', error);
      showToast('标签切换失败，已保留原文档');
      return false;
    }
  }
  if (check) await checkExternal(tab);
  return true;
}
export function activateDocumentTab(id: string): Promise<boolean> {
  return runDocumentOperation(() => activateInternal(id));
}

/** prepare reads/validates before detaching, so cancellation cannot destroy A. */
export function openDocumentTab(path: string, prepare: () => Promise<(() => void) | null>): Promise<boolean> {
  return runDocumentOperation(async () => {
    path = canonical(path);
    const existing = sessions.find(tab => tab.path === path);
    if (existing) return activateInternal(existing.id);
    if (!hasCapacity()) return false;
    const commit = await prepare();
    if (!commit) return false;
    await settleImageOperations();
    if (!hasCapacity()) return false;
    const previous = current();
    const focusEditor = suspendCurrent();
    const tab: DocumentSession = { id: `document-${++sequence}`, path, title: '', kind: 'document', context: null, pendingExternal: null, degradation: null, startup: false };
    sessions.push(tab);
    activeId = tab.id;
    publishing = true;
    try {
      resetEditorDocument(false);
      store.setState({ mode: 'wysiwyg', activeFilePath: path, dirty: false, readOnly: false, reconcileError: null, autosaveErrorCount: 0 });
      commit();
      if (focusEditor) {
        if (store.getState().mode === 'source') getSourceView()?.focus();
        else getEditor()?.view.focus();
      }
    } catch (error) {
      sessions = sessions.filter(item => item !== tab);
      const failed = detachEditorDocument();
      await releaseEditorDocument(failed);
      if (previous) restore(previous, focusEditor);
      else emptyInternal();
      throw error;
    } finally { publishing = false; }
    project();
    await closeStartupTabIfEmpty();
    return true;
  });
}

/**
 * Open (or activate) an image preview tab. Shares the tab bar, cap and
 * path-dedup semantics with document tabs, but carries no editor context and
 * no dirty state, so closing it never asks for confirmation.
 */
export function openImagePreviewTab(path: string): Promise<boolean> {
  return runDocumentOperation(async () => {
    path = canonical(path);
    const existing = sessions.find(tab => tab.path === path);
    if (existing) return activateInternal(existing.id, false);
    if (!hasCapacity()) return false;
    // $HOME 内路径由静态 asset scope 覆盖；动态授权是补充，失败仅降级为预览占位。
    try { await authorizePreviewDirectory(path); }
    catch (error) { logDebug('document.tabs', 'Failed to authorize preview directory (best-effort)', { path, error: String(error) }); }
    await settleImageOperations();
    suspendCurrent();
    const tab: DocumentSession = { id: `document-${++sequence}`, path, title: '', kind: 'image', context: null, pendingExternal: null, degradation: null, startup: false };
    sessions.push(tab);
    restore(tab);
    await closeStartupTabIfEmpty();
    return true;
  });
}

/**
 * The startup default tab only greets the user. Once a document opened
 * successfully (both the file-tree and Finder entries funnel through
 * `openDocumentTab`) it has served its purpose — retire it while it is still
 * empty. By this point `suspendCurrent` has demoted it to a background tab, so
 * `closeInternal(id, false)` releases its context without moving the user's
 * focus off the freshly opened document.
 */
async function closeStartupTabIfEmpty() {
  const startup = sessions.find(tab =>
    tab.startup && tab.path === null && !tab.context?.projection.dirty);
  if (startup) await closeInternal(startup.id, false);
}
export function newDocumentTab(startup = false): Promise<boolean> {
  return runDocumentOperation(async () => {
    if (!hasCapacity()) return false;
    await settleImageOperations();
    suspendCurrent();
    activeId = `document-${++sequence}`;
    const title = `未命名 ${sequence}`;
    sessions.push({ id: activeId, path: null, title, kind: 'document', context: null, pendingExternal: null, degradation: null, startup });
    publishing = true;
    try {
      resetEditorDocument(false);
      store.setState({ mode: 'wysiwyg', activeFilePath: null, dirty: false, readOnly: false, reconcileError: null, autosaveErrorCount: 0 });
    } finally { publishing = false; }
    hideDegradationBar();
    project();
    getEditor()?.view.focus();
    return true;
  });
}
function emptyInternal() {
  activeId = null;
  resetEditorDocument(false);
  hideDegradationBar();
  publishing = true;
  try { store.setState({ activeFilePath: null, mode: 'wysiwyg', dirty: false, readOnly: false, reconcileError: null, autosaveErrorCount: 0 }); }
  finally { publishing = false; }
  project();
}
async function closeInternal(id: string, confirm = true) {
  const tab = sessions.find(item => item.id === id);
  if (!tab) return true;
  const originalId = activeId;
  const activeElement = document.activeElement;
  const focusEditor = Boolean(activeElement && (
    getEditor()?.view.dom.contains(activeElement) || getSourceView()?.contentDOM.contains(activeElement)
  ));
  const index = sessions.indexOf(tab);
  // 图片会话无未保存内容，关闭前不需要确认或激活切换。
  if (confirm && tab.kind !== 'image') {
    await activateInternal(id, false);
    flushEditorDirtyCheck();
    if (!(await uiPorts.confirmDocumentTransition())) {
      if (originalId && originalId !== id) await activateInternal(originalId, false);
      return false;
    }
  }
  if (activeId === id) {
    await settleImageOperations();
    suspendCurrent();
  }
  sessions.splice(sessions.indexOf(tab), 1);
  if (tab.path) {
    closedPaths.push(tab.path);
    if (closedPaths.length > 10) closedPaths.shift();
  }
  if (tab.context) {
    try { await releaseEditorDocument(tab.context); }
    catch (error) { logException('document.tabs', 'Failed to release closed document resources', error); }
    finally { tab.context = null; }
  }
  tab.degradation = null;
  if (originalId && originalId !== id && sessions.some(item => item.id === originalId)) {
    // Closing a background tab never changes the user's active tab.
    if (activeId !== originalId) restore(sessions.find(item => item.id === originalId)!, focusEditor);
  } else {
    const next = sessions[index] ?? sessions[index - 1];
    if (next) restore(next, focusEditor);
    else emptyInternal();
  }
  notify();
  return true;
}
export function closeDocumentTab(id: string): Promise<boolean> {
  return runDocumentOperation(() => closeInternal(id));
}
/** Explicitly confirmed discard; caller already owns the operation boundary. */
export async function discardCurrentDocumentTabInOperation() {
  if (activeId) return closeInternal(activeId, false);
  return true;
}
export function reopenClosedDocumentTab(): Promise<boolean> {
  // Serialise restore requests too, but let openFileInEditor own its operation
  // boundary. This avoids re-entrant queues and consuming the same entry twice.
  const restoreLatest = async () => {
    const path = closedPaths[closedPaths.length - 1];
    if (!path) return false;
    const opened = await uiPorts.openDocument(path);
    if (opened) {
      const index = closedPaths.lastIndexOf(path);
      if (index >= 0) closedPaths.splice(index, 1);
    }
    return opened;
  };
  const result = restoreTail.then(restoreLatest, restoreLatest);
  restoreTail = result;
  return result;
}
export function cycleDocumentTab(direction: number): Promise<boolean> {
  return runDocumentOperation(() => {
    if (!sessions.length) return false;
    const index = sessions.findIndex(tab => tab.id === activeId);
    return activateInternal(sessions[(index + direction + sessions.length) % sessions.length].id);
  });
}
export function confirmAllDocumentTabsClose(): Promise<boolean> {
  return runDocumentOperation(async () => {
    const originalId = activeId;
    for (const tab of sessions) {
      if (tab.kind === 'image') continue;
      await activateInternal(tab.id, false);
      flushEditorDirtyCheck();
      if (!(await uiPorts.confirmDocumentTransition())) return false;
    }
    if (originalId) await activateInternal(originalId, false);
    return true;
  });
}
export function closeAllDocumentTabs(): Promise<boolean> {
  return runDocumentOperation(async () => {
    for (const tab of sessions) {
      if (tab.kind === 'image') continue;
      await activateInternal(tab.id, false);
      flushEditorDirtyCheck();
      if (!(await uiPorts.confirmDocumentTransition())) return false;
    }
    await settleImageOperations();
    suspendCurrent();
    for (const tab of sessions) if (tab.context) {
      try { await releaseEditorDocument(tab.context); }
      catch (error) { logException('document.tabs', 'Failed to release closed document resources', error); }
      finally { tab.context = null; }
    }
    sessions = [];
    emptyInternal();
    return true;
  });
}
export function closeDocumentTabsMatchingPath(path: string): Promise<boolean> {
  return runDocumentOperation(async () => {
    for (const tab of [...sessions]) if (matches(tab.path, path) && !(await closeInternal(tab.id))) return false;
    return true;
  });
}
/** Path operations update every snapshot, even when the active path differs. */
export function rewriteDocumentTabPaths(from: string, to: string): void {
  for (const tab of sessions) {
    if (!matches(tab.path, from)) continue;
    tab.path = to + tab.path!.slice(from.length);
    // A filesystem move preserves file identity. Retain the disk baseline for
    // activation/save validation and the authored image mappings for lossless
    // serialization. Image NodeViews resolve their display URL at the new path.
  }
  // 图片会话的投影保持无活动文件路径；其预览 src 由 project() 同步刷新。
  if (current()?.kind === 'document') store.setState({ activeFilePath: current()!.path });
  project();
}
export function hasOpenDocumentTabs() { return sessions.length > 0; }
export function isPathOpenInOtherDocument(path: string): boolean {
  return sessions.some(tab => tab.id !== activeId && tab.path === canonical(path));
}
export function routeDocumentExternalChanges(changes: readonly { path: string; kind: string; toPath?: string }[]): Promise<void> {
  return runDocumentOperation(async () => {
    for (const change of changes) {
      if (change.kind === 'rename' && change.toPath) {
        rewriteDocumentTabPaths(change.path, change.toPath);
        continue;
      }
      if (change.kind !== 'modify' && change.kind !== 'delete') continue;
      for (const tab of sessions) {
        if (!matches(tab.path, change.path)) continue;
        if (tab.kind === 'image') continue; // 无 dirty/确认语义；激活时按预览加载失败降级
        tab.pendingExternal = change.kind === 'delete' ? 'delete' : (tab.pendingExternal ?? 'modify');
        if (tab.context) {
          tab.context.documentState.externallyModified = true;
          tab.context.documentState.sourceRevision += 1;
        } else markExternalModification();
      }
    }
    const tab = current();
    if (tab?.pendingExternal) await checkExternal(tab);
    notify();
  });
}

// These events are projections of the active session. Full restoration publishes
// atomically; transient callbacks during attach must not overwrite its identity.
store.on('file:active', event => {
  if (!publishing && current()) current()!.path = event.path;
  if (!publishing) notify();
});
store.on('editor:dirty', () => { if (!publishing) notify(); });

// Register the tab implementations so `active-document.ts` can delegate to the
// tab model without importing this module (which would close an import cycle).
registerDocumentTabHooks({
  hasOpenDocumentTabs,
  rewriteDocumentTabPaths,
  closeDocumentTabsMatchingPath,
  discardCurrentDocumentTabInOperation,
});

export function initDocumentSessions(): Promise<boolean> { return newDocumentTab(true); }

/** Test/lifecycle teardown. It intentionally does not persist sensitive drafts. */
export async function destroyDocumentSessions() {
  await runDocumentOperation(async () => {
    suspendCurrent();
    for (const tab of sessions) if (tab.context) {
      try { await releaseEditorDocument(tab.context); } catch (error) { logException('document.tabs', 'Failed to release document resources', error); }
    }
    sessions = [];
    closedPaths.length = 0;
    emptyInternal();
  });
}

store.on('editor:mode', event => {
  const notice = document.getElementById('degradation-bar');
  if (notice) notice.hidden = event.mode !== 'source';
});
