import { getEditor, getMode, switchToSource, switchToWysiwyg } from '../lib/editor';
import { open } from '@tauri-apps/plugin-dialog';
import { setWorkspacePath, refreshFileTree, getWorkspacePath } from './fileTree';
import { showNewFileDialog } from './newFileDialog';
import { showLinkDialog } from './linkDialog';
import { showToast } from './toast';
import { showModal } from './ui/modal';
import { addRecentFile } from '../lib/storage';
import { clearActiveDocument, confirmDocumentTransition, openFileInEditor, saveActiveDocument } from './sidebar';
import { copyLocalFileToStorage, handleNetworkImage, getImageSettings } from '../lib/imageUtils';
import { getActiveDocPath } from '../lib/editor.state';
import { logException } from '../lib/logger';
import { exportRenderedDocument, type ExportFormat } from '../lib/documentExport';
import { showContextMenuStatic } from './ui/contextMenu';

export function initToolbar() {
  initAriaAttributes();
  bindToolbarEvents();
}

function bindToolbarEvents() {
  bind('sidebar-toggle', () => {
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('sidebar-toggle');
    const isCollapsed = sidebar?.classList.toggle('collapsed');

    if (btn) {
      if (isCollapsed) {
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>`;
      } else {
        btn.innerHTML = `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>`;
      }
      btn.setAttribute('aria-pressed', String(!!isCollapsed));
    }
  });

  bind('sidebar-open-folder', async () => {
    if (!(await confirmDocumentTransition())) return;
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      await setWorkspacePath(selected);
      clearActiveDocument();
      await refreshFileTree();
      showToast('文件夹已打开');
    }
  });

  bind('toolbar-open-file', async () => {
    if (!(await confirmDocumentTransition())) return;
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (selected) {
      await addRecentFile(selected);
      await openFileInEditor(selected);
    }
  });

  bind('btn-new', () => {
    showNewFileDialog('file', getWorkspacePath());
  });

  bind('btn-bold', () => getEditor()?.chain().focus().toggleBold().run());
  bind('btn-italic', () => getEditor()?.chain().focus().toggleItalic().run());
  bind('btn-strike', () => getEditor()?.chain().focus().toggleStrike().run());
  bind('btn-code', () => getEditor()?.chain().focus().toggleCode().run());
  bind('btn-h1', () => getEditor()?.chain().focus().toggleHeading({ level: 1 }).run());
  bind('btn-h2', () => getEditor()?.chain().focus().toggleHeading({ level: 2 }).run());
  bind('btn-quote', () => getEditor()?.chain().focus().toggleBlockquote().run());
  bind('btn-link', () => {
    showLinkDialog();
  });
  bind('btn-ul', () => getEditor()?.chain().focus().toggleBulletList().run());
  bind('btn-ol', () => getEditor()?.chain().focus().toggleOrderedList().run());
  bind('btn-hr', () => getEditor()?.chain().focus().setHorizontalRule().run());
  bind('btn-codeblock', () => getEditor()?.chain().focus().toggleCodeBlock().run());

  bind('btn-image', () => showImageInsertDialog());

  bind('btn-wysiwyg', () => {
    switchToWysiwyg();
    setActive('btn-wysiwyg');
    setActive('btn-source', false);
    updateModeIndicator('wysiwyg');
  });

  bind('btn-source', () => {
    switchToSource();
    setActive('btn-source');
    setActive('btn-wysiwyg', false);
    updateModeIndicator('source');
  });

  bind('btn-focus', () => {
    document.getElementById('app')?.classList.toggle('focus-mode');
    const btn = document.getElementById('btn-focus');
    if (btn) {
      const isActive = btn.classList.toggle('active');
      btn.setAttribute('aria-pressed', String(isActive));
    }
  });

  bind('btn-settings', async () => {
    const { showSettings } = await import('./settings');
    showSettings();
  });

  bind('btn-save', async () => {
    await saveActiveDocument();
  });

  bind('btn-export', () => {
    const button = document.getElementById('btn-export');
    if (!button) return;
    const rect = button.getBoundingClientRect();
    showContextMenuStatic([
      { label: '导出 PDF', onClick: () => { void exportCurrentDocument('pdf'); } },
      { label: '导出 Word', onClick: () => { void exportCurrentDocument('word'); } },
      { label: '导出 HTML', onClick: () => { void exportCurrentDocument('html'); } },
    ], { x: rect.left, y: rect.bottom });
  });
}

function initAriaAttributes() {
  // 1. Toolbar container ARIA
  const toolbar = document.getElementById('toolbar');
  if (toolbar) {
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', '工具栏');
  }

  // 2. Button groups — wrap related buttons in role="group" containers
  wrapGroup('toolbar-group-file', '文件操作', [
    'sidebar-open-folder', 'toolbar-open-file', 'btn-new',
    'btn-save', 'btn-export', 'btn-settings',
  ]);
  wrapGroup('toolbar-group-format', '文本格式', [
    'btn-bold', 'btn-italic', 'btn-strike', 'btn-code',
  ]);
  wrapGroup('toolbar-group-block', '块级格式', [
    'btn-h1', 'btn-h2', 'btn-quote', 'btn-link',
    'btn-ul', 'btn-ol', 'btn-hr', 'btn-codeblock', 'btn-image',
  ]);
  wrapGroup('toolbar-group-view', '视图模式', [
    'btn-wysiwyg', 'btn-source', 'btn-focus',
  ]);

  // 3. Toggle buttons — set initial aria-pressed state
  setAriaPressed('sidebar-toggle', false);
  setAriaPressed('btn-wysiwyg', true);   // WYSIWYG is active by default (has 'active' class)
  setAriaPressed('btn-source', false);
  setAriaPressed('btn-focus', false);
}

function wrapGroup(id: string, label: string, buttonIds: string[]) {
  const toolbar = document.getElementById('toolbar');
  if (!toolbar) return;

  const buttons = buttonIds
    .map((bid) => document.getElementById(bid))
    .filter(Boolean) as HTMLElement[];
  if (buttons.length === 0) return;

  const group = document.createElement('span');
  group.id = id;
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);

  // Insert the group element before the first button in this group
  toolbar.insertBefore(group, buttons[0]);

  // Move each button into the group container
  for (const btn of buttons) {
    group.appendChild(btn);
  }
}

function setAriaPressed(id: string, pressed: boolean) {
  const el = document.getElementById(id);
  if (el) {
    el.setAttribute('aria-pressed', String(pressed));
  }
}

async function exportCurrentDocument(format: ExportFormat) {
  const mode = getMode();
  let restoredMode = false;

  if (mode === 'source') {
    switchToWysiwyg();
    restoredMode = true;
  }

  try {
    await exportRenderedDocument(format, getEditor()?.view.dom ?? null, getActiveDocPath());
  } finally {
    if (restoredMode) {
      switchToSource();
    }
  }
}

function bind(id: string, fn: () => void) {
  document.getElementById(id)?.addEventListener('click', fn);
}

function setActive(id: string, active = true) {
  const el = document.getElementById(id);
  if (el) {
    if (active) el.classList.add('active');
    else el.classList.remove('active');
    el.setAttribute('aria-pressed', String(active));
  }
}

function updateModeIndicator(mode: string) {
  const indicator = document.getElementById('mode-indicator');
  if (indicator) {
    indicator.textContent = mode === 'wysiwyg' ? '所见即所得' : '源码';
  }
}

/// Insert image Markdown in either WYSIWYG or source mode
function insertImageSrc(src: string) {
  const mode = getMode();
  if (mode === 'source') {
    const textarea = document.getElementById('source-editor') as HTMLTextAreaElement | null;
    if (!textarea) return;
    // Strip Tauri asset protocol — source markdown should have filesystem paths
    let fsPath = src;
    if (src.startsWith('asset://localhost/')) {
      const urlDecoded = decodeURIComponent(src.slice('asset://localhost/'.length));
      fsPath = urlDecoded;
      // On Windows asset://localhost/C:/ → /C:/ → C:/
      if (fsPath.match(/^\/[A-Za-z]:\//)) fsPath = fsPath.slice(1);
    }
    const pos = textarea.selectionStart;
    const before = textarea.value.substring(0, pos);
    const after = textarea.value.substring(pos);
    const md = `![](${fsPath})`;
    textarea.value = before + md + after;
    textarea.selectionStart = textarea.selectionEnd = pos + md.length;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    getEditor()?.chain().focus().setImage({ src }).run();
  }
}

export function showImageInsertDialog(options?: { alt?: string; src?: string; onReplace?: (src: string, alt: string) => void }) {
  const isEdit = !!options?.onReplace;

  const modal = showModal({
    content: `
      <div class="modal">
        <div class="modal-header">
          <span>${isEdit ? '编辑图片' : '插入图片'}</span>
          <button class="modal-close" id="image-close">✕</button>
        </div>
        <div style="padding:16px 24px;">
          <div class="image-source-tabs">
            <button class="image-source-tab${isEdit ? '' : ' active'}" data-tab="local">本地文件</button>
            <button class="image-source-tab${isEdit ? ' active' : ''}" data-tab="url">网络图片</button>
          </div>
          <div id="image-tab-local" ${isEdit ? 'hidden' : ''}>
            <button class="file-pick-btn" id="image-pick-local">点击选择图片文件</button>
          </div>
          <div id="image-tab-url" ${isEdit ? '' : 'hidden'}>
            <input class="url-input" id="image-url-input" placeholder="https://example.com/image.png" />
          </div>
          <div class="modal-footer" style="padding-top:16px;display:flex;justify-content:flex-end;gap:8px;">
            <button class="btn-secondary" id="image-cancel">取消</button>
            <button class="btn-primary" id="image-confirm">${isEdit ? '替换' : '确定'}</button>
          </div>
        </div>
      </div>
    `,
  });

  let activeTab: 'local' | 'url' = isEdit ? 'url' : 'local';

  // Pre-fill URL in edit mode
  if (isEdit && options?.src) {
    const urlInput = document.getElementById('image-url-input') as HTMLInputElement;
    if (urlInput) urlInput.value = options.src;
  }

  // Tab switching
  document.querySelectorAll('.image-source-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = (tab as HTMLElement).dataset.tab as 'local' | 'url';
      document.querySelectorAll('.image-source-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('image-tab-local')!.hidden = activeTab !== 'local';
      document.getElementById('image-tab-url')!.hidden = activeTab !== 'url';
    });
  });

  const close = () => { modal.hide(); };
  document.getElementById('image-close')!.addEventListener('click', close);
  document.getElementById('image-cancel')!.addEventListener('click', close);

  // Local file picker
  document.getElementById('image-pick-local')!.addEventListener('click', async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }],
    });
    if (!selected) return;
    try {
      const settings = await getImageSettings();
      const docPath = getActiveDocPath();
      const src = await copyLocalFileToStorage(selected as string, docPath, settings);
      insertImageSrc(src);
      close();
    } catch (e) {
      logException('toolbar.image', 'Failed to insert local image', e, { source: 'local' });
      showToast('图片插入失败');
    }
  });

  // URL confirm
  document.getElementById('image-confirm')!.addEventListener('click', async () => {
    if (activeTab === 'url') {
      const url = (document.getElementById('image-url-input') as HTMLInputElement).value.trim();
      if (!url) return;
      try {
        if (isEdit && options?.onReplace) {
          options.onReplace(url, options.alt || '');
          close();
        } else {
          const settings = await getImageSettings();
          const docPath = getActiveDocPath();
          const src = await handleNetworkImage(url, docPath, settings);
          insertImageSrc(src);
          close();
        }
      } catch (e) {
        logException('toolbar.image', 'Failed to insert network image', e, { source: 'url', url });
        showToast(isEdit ? '图片替换失败' : '图片插入失败');
      }
    } else {
      close();
    }
  });

  // Enter key on URL input
  document.getElementById('image-url-input')!.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('image-confirm')!.click();
    }
  });
}
