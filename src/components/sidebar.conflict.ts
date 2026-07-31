import { hasExternalModification, isDocumentDirty, markExternalModification } from '../lib/editor';
import { showToast } from './toast';
import { showDialog } from './ui/dialog';
import { getActiveFilePath, clearActiveDocument } from './activeDocument';
import { reloadActiveDocumentFromDisk, saveActiveDocumentAsNewFile } from './sidebar.fileops';

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
  showToast('重新保存需要已确认的 Core 会话');
  return saveActiveDocumentAsNewFile();
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
