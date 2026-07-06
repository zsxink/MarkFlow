import { writeFile } from '../lib/storage';
import { getMarkdown, hasExternalModification, isDocumentDirty, markDocumentPersisted, markExternalModification } from '../lib/editor';
import { showToast } from './toast';
import { suppressNextWatcherRefresh, refreshFileTree } from './fileTree';
import { refreshOutline } from './outline';
import { getActiveFilePath, clearActiveDocument } from './sidebar';
import { reloadActiveDocumentFromDisk, saveActiveDocumentAsNewFile } from './sidebar.fileops';

let externalConflictDialogPromise: Promise<'keep' | 'disk' | 'save-as'> | null = null;
let externalDeletionDialogPromise: Promise<'resave' | 'discard'> | null = null;

function showExternalConflictDialog() {
  if (externalConflictDialogPromise) return externalConflictDialogPromise;

  externalConflictDialogPromise = new Promise<'keep' | 'disk' | 'save-as'>((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay external-conflict-dialog';
    overlay.innerHTML = `
      <div class="modal external-conflict-modal" role="dialog" aria-modal="true" aria-labelledby="external-conflict-title">
        <div class="modal-header">
          <span id="external-conflict-title">检测到外部修改</span>
        </div>
        <div class="external-conflict-body">
          <p>当前文件在磁盘上已发生变化。</p>
          <p>你在编辑器中也有未保存改动，请选择接下来要保留哪一份内容。</p>
        </div>
        <div class="external-conflict-actions">
          <button type="button" class="external-conflict-action secondary" data-action="keep">保留当前</button>
          <button type="button" class="external-conflict-action secondary" data-action="disk">加载磁盘版本</button>
          <button type="button" class="external-conflict-action primary" data-action="save-as">另存为</button>
        </div>
      </div>
    `;

    const finish = (choice: 'keep' | 'disk' | 'save-as') => {
      overlay.remove();
      externalConflictDialogPromise = null;
      resolve(choice);
    };

    overlay.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', () => finish(button.dataset.action as 'keep' | 'disk' | 'save-as'));
    });

    document.body.appendChild(overlay);
  });

  return externalConflictDialogPromise;
}

function showExternalDeletionDialog() {
  if (externalDeletionDialogPromise) return externalDeletionDialogPromise;

  externalDeletionDialogPromise = new Promise<'resave' | 'discard'>((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay external-delete-dialog';
    overlay.innerHTML = `
      <div class="modal external-delete-modal" role="dialog" aria-modal="true" aria-labelledby="external-delete-title">
        <div class="modal-header">
          <span id="external-delete-title">当前文件已被删除</span>
        </div>
        <div class="external-delete-body">
          <p>当前打开的文件已在磁盘上被删除。</p>
          <p>你在编辑器中的内容还在，是否要重新保存当前内容，还是直接删除掉？</p>
        </div>
        <div class="external-delete-actions">
          <button type="button" class="external-delete-action secondary" data-action="discard">删除掉</button>
          <button type="button" class="external-delete-action primary" data-action="resave">重新保存</button>
        </div>
      </div>
    `;

    const finish = (choice: 'resave' | 'discard') => {
      overlay.remove();
      externalDeletionDialogPromise = null;
      resolve(choice);
    };

    overlay.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', () => finish(button.dataset.action as 'resave' | 'discard'));
    });

    document.body.appendChild(overlay);
  });

  return externalDeletionDialogPromise;
}

async function restoreDeletedActiveDocument() {
  const filePath = getActiveFilePath();
  if (!filePath) return false;

  const content = getMarkdown();

  try {
    suppressNextWatcherRefresh(filePath);
    await writeFile(filePath, content);
    markDocumentPersisted(content);
    await refreshFileTree();
    refreshOutline();
    showToast('已重新保存当前文件');
    return true;
  } catch {
    return saveActiveDocumentAsNewFile();
  }
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
