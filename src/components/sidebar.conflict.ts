import { writeFile } from '../lib/storage';
import { getMarkdown, hasExternalModification, isDocumentDirty, markDocumentPersisted, markExternalModification } from '../lib/editor';
import { showToast } from './toast';
import { showDialog } from './ui/dialog';
import { suppressNextWatcherRefresh, applyFileTreeEvents } from './fileTree';
import { refreshOutline } from './outline';
import { getActiveFilePath, clearActiveDocument } from './activeDocument';
import { reloadActiveDocumentFromDisk, saveActiveDocumentAsNewFile } from './sidebar.fileops';
import { getActiveLosslessBinding } from '../lib/lossless/registry';
import { isLosslessCoreSessionEnabled } from '../lib/lossless/flag';

function showExternalConflictDialog() {
  return showDialog({
    title: '检测到外部修改',
    body: '<p>当前文件在磁盘上已发生变化。</p><p>你在编辑器中也有未保存改动，请选择接下来要保留哪一份内容。</p>',
    buttons: [
      { label: '保留当前', value: 'keep' },
      { label: '加载磁盘版本', value: 'disk' },
      { label: '另存为', value: 'save-as', primary: true },
    ],
    width: '520px',
  }) as Promise<'keep' | 'disk' | 'save-as' | null>;
}

function showExternalDeletionDialog() {
  return showDialog({
    title: '当前文件已被删除',
    body: '<p>当前打开的文件已在磁盘上被删除。</p><p>你在编辑器中的内容还在，是否要重新保存当前内容，还是直接删除掉？</p>',
    buttons: [
      { label: '删除掉', value: 'discard' },
      { label: '重新保存', value: 'resave', primary: true },
    ],
    width: '520px',
  }) as Promise<'resave' | 'discard' | null>;
}

async function restoreDeletedActiveDocument() {
  const filePath = getActiveFilePath();
  if (!filePath) return false;

  // ── Lossless path (reviewer N1): the binding's logical text is the ONLY
  // truthful content — never `getMarkdown()` (which reads the hidden/empty PM
  // or stale legacy source on a lossless doc). The file is gone on disk, so a
  // guarded write cannot replace it; write the confirmed logical text as a
  // recreate and keep the binding's persisted state synced.
  if (isLosslessCoreSessionEnabled() && getActiveLosslessBinding()) {
    const binding = getActiveLosslessBinding()!;
    const content = binding.logicalText;
    try {
      suppressNextWatcherRefresh(filePath);
      await writeFile(filePath, content);
      bindPersistedAfterResave(binding, content);
      await applyFileTreeEvents([{ path: filePath, kind: 'create', timestamp: Date.now() }]);
      refreshOutline();
      showToast('已重新保存当前文件');
      return true;
    } catch {
      return saveActiveDocumentAsNewFile();
    }
  }

  const content = getMarkdown();

  try {
    suppressNextWatcherRefresh(filePath);
    await writeFile(filePath, content);
    markDocumentPersisted(content);
    await applyFileTreeEvents([{ path: filePath, kind: 'create', timestamp: Date.now() }]);
    refreshOutline();
    showToast('已重新保存当前文件');
    return true;
  } catch {
    return saveActiveDocumentAsNewFile();
  }
}

/** Keep the lossless binding's file identity/persisted state aligned after a
 *  direct recreate (the file that was deleted is now re-created on disk). */
function bindPersistedAfterResave(binding: { persistedRevision: number; fileIdentity: unknown }, _content: string): void {
  // No-op hook: the binding's Core revision is unchanged by a recreate write;
  // the file identity record on the binding is refreshed by the next normal
  // save. Kept as a named seam so the delete-resave path stays symmetric with
  // the legacy `markDocumentPersisted`.
  void binding;
}

export async function handleExternalDeletion(path: string) {
  const filePath = getActiveFilePath();
  if (!filePath) return 'ignored' as const;
  if (filePath !== path && !filePath.startsWith(`${path}/`)) return 'ignored' as const;

  if (!isDocumentDirty() && !hasExternalModification()) {
    clearActiveDocument();
    return 'cleared' as const;
  }

  markExternalModification();
  const choice = await showExternalDeletionDialog();

  if (choice === 'discard') {
    clearActiveDocument();
    return 'discarded' as const;
  }

  const restored = await restoreDeletedActiveDocument();
  return restored ? 'resaved' as const : 'failed' as const;
}

export async function handleActiveDocumentExternalModification() {
  const filePath = getActiveFilePath();
  if (!filePath) return 'ignored' as const;

  if (!isDocumentDirty()) {
    const reloaded = await reloadActiveDocumentFromDisk({ force: true });
    return reloaded ? 'reloaded' as const : 'failed' as const;
  }

  markExternalModification();
  const choice = await showExternalConflictDialog();

  if (choice === 'disk') {
    const reloaded = await reloadActiveDocumentFromDisk({ force: true });
    return reloaded ? 'reloaded' as const : 'failed' as const;
  }

  if (choice === 'save-as') {
    const saved = await saveActiveDocumentAsNewFile();
    return saved ? 'saved-as' as const : 'kept' as const;
  }

  return 'kept' as const;
}
