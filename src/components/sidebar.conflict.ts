import { writeFile } from '../lib/storage';
import { getMarkdownResult, isDocumentDirty, markDocumentPersisted, markExternalModification } from '../lib/editor';
import { showToast } from './toast';
import { showDialog } from './ui/dialog';
import { suppressNextWatcherRefresh, applyFileTreeEvents } from './fileTree';
import { refreshOutline } from './outline';
import { getActiveFilePath } from './activeDocument';
import { reloadActiveDocumentFromDiskInOperation, saveActiveDocumentAsNewFileInOperation } from './sidebar.fileops';
import { runDocumentOperation } from '../lib/documentOperations';
import { discardCurrentDocumentTabInOperation } from '../lib/documentSessions';

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
    body: '<p>当前打开的文件已在磁盘上被删除。</p><p>编辑器中的内容仍保留，可以另存为新文件或明确放弃。</p>',
    buttons: [
      { label: '保留当前', value: 'keep' },
      { label: '放弃内容', value: 'discard' },
      { label: '另存为', value: 'save-as', primary: true },
    ],
    width: '520px',
  }) as Promise<'resave' | 'discard' | 'save-as' | 'keep' | null>;
}

async function restoreDeletedActiveDocument() {
  const filePath = getActiveFilePath();
  if (!filePath) return false;

  const candidate = getMarkdownResult();
  if (!candidate.ok) {
    showToast('Markdown 转换失败，未写入文件');
    return false;
  }
  const content = candidate.markdown;

  try {
    suppressNextWatcherRefresh(filePath);
    await writeFile(filePath, content);
    markDocumentPersisted(content);
    await applyFileTreeEvents([{ path: filePath, kind: 'create', timestamp: Date.now() }]);
    refreshOutline();
    showToast('已重新保存当前文件');
    return true;
  } catch {
    return saveActiveDocumentAsNewFileInOperation();
  }
}

export function handleExternalDeletion(path: string) {
  return runDocumentOperation(() => handleExternalDeletionInOperation(path));
}
export async function handleExternalDeletionInOperation(path: string) {
  const filePath = getActiveFilePath();
  if (!filePath) return 'ignored' as const;
  if (filePath !== path && !filePath.startsWith(`${path}/`)) return 'ignored' as const;

  markExternalModification();
  const choice = await showExternalDeletionDialog();

  if (choice === 'discard') {
    await discardCurrentDocumentTabInOperation();
    return 'discarded' as const;
  }

  if (choice === 'save-as') return await saveActiveDocumentAsNewFileInOperation() ? 'resaved' as const : 'failed' as const;
  if (choice !== 'resave') return 'kept' as const;
  const restored = await restoreDeletedActiveDocument();
  return restored ? 'resaved' as const : 'failed' as const;
}

export function handleActiveDocumentExternalModification() {
  return runDocumentOperation(handleActiveDocumentExternalModificationInOperation);
}
export async function handleActiveDocumentExternalModificationInOperation() {
  const filePath = getActiveFilePath();
  if (!filePath) return 'ignored' as const;

  if (!isDocumentDirty()) {
    const reloaded = await reloadActiveDocumentFromDiskInOperation({ force: true });
    return reloaded ? 'reloaded' as const : 'failed' as const;
  }

  markExternalModification();
  const choice = await showExternalConflictDialog();

  if (choice === 'disk') {
    const reloaded = await reloadActiveDocumentFromDiskInOperation({ force: true });
    return reloaded ? 'reloaded' as const : 'failed' as const;
  }

  if (choice === 'save-as') {
    const saved = await saveActiveDocumentAsNewFileInOperation();
    return saved ? 'saved-as' as const : 'kept' as const;
  }

  return 'kept' as const;
}
