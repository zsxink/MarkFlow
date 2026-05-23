import { getEditor, switchToSource, switchToWysiwyg, getMarkdown } from '../lib/editor';
import { cycleTheme } from '../lib/theme';
import { open } from '@tauri-apps/plugin-dialog';
import { setWorkspacePath, refreshFileTree, getWorkspacePath, suppressNextWatcherRefresh } from './fileTree';
import { showNewFileDialog } from './newFileDialog';
import { showToast } from './toast';
import { writeFile, loadSettings } from '../lib/storage';
import { getActiveFilePath } from './sidebar';
import { copyLocalFileToStorage, handleNetworkImage, type ImageSettings } from '../lib/imageUtils';

export function initToolbar() {
  bindToolbarEvents();
}

function bindToolbarEvents() {
  const editor = getEditor();

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
    }
  });

  bind('sidebar-open-folder', async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      await setWorkspacePath(selected);
      await refreshFileTree();
      showToast('文件夹已打开');
    }
  });

  bind('btn-new', () => {
    showNewFileDialog('file', getWorkspacePath());
  });

  bind('btn-bold', () => editor?.chain().focus().toggleBold().run());
  bind('btn-italic', () => editor?.chain().focus().toggleItalic().run());
  bind('btn-strike', () => editor?.chain().focus().toggleStrike().run());
  bind('btn-code', () => editor?.chain().focus().toggleCode().run());
  bind('btn-h1', () => editor?.chain().focus().toggleHeading({ level: 1 }).run());
  bind('btn-h2', () => editor?.chain().focus().toggleHeading({ level: 2 }).run());
  bind('btn-quote', () => editor?.chain().focus().toggleBlockquote().run());
  bind('btn-link', () => {
    const url = prompt('输入链接 URL:');
    if (url && editor) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  });
  bind('btn-ul', () => editor?.chain().focus().toggleBulletList().run());
  bind('btn-ol', () => editor?.chain().focus().toggleOrderedList().run());
  bind('btn-hr', () => editor?.chain().focus().setHorizontalRule().run());
  bind('btn-codeblock', () => editor?.chain().focus().toggleCodeBlock().run());

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
  });

  bind('btn-theme', () => cycleTheme());

  bind('btn-settings', () => {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.hidden = !modal.hidden;
  });

  bind('btn-save', async () => {
    const filePath = getActiveFilePath();
    if (!filePath) {
      showToast('没有打开的文件');
      return;
    }
    try {
      const content = getMarkdown();
      suppressNextWatcherRefresh(filePath);
      await writeFile(filePath, content);
      showToast('已保存');
    } catch (e) {
      console.error('Save failed:', e);
      showToast('保存失败');
    }
  });
}

function bind(id: string, fn: () => void) {
  document.getElementById(id)?.addEventListener('click', fn);
}

function setActive(id: string, active = true) {
  const el = document.getElementById(id);
  if (el) {
    if (active) el.classList.add('active');
    else el.classList.remove('active');
  }
}

function updateModeIndicator(mode: string) {
  const indicator = document.getElementById('mode-indicator');
  if (indicator) {
    indicator.textContent = mode === 'wysiwyg' ? '所见即所得' : '源码';
  }
}

async function getImageSettings(): Promise<ImageSettings> {
  const DEFAULTS: ImageSettings = {
    storageMode: 'workspace-assets',
    customPath: '',
    preferRelative: true,
    autoCopyLocal: true,
    downloadNetwork: false,
    namingStrategy: 'timestamp',
  };
  try {
    const s = await loadSettings() as Record<string, unknown>;
    return {
      storageMode: (s.imageStorageMode as string) || DEFAULTS.storageMode,
      customPath: (s.imageCustomPath as string) || DEFAULTS.customPath,
      preferRelative: s.imagePreferRelative !== false,
      autoCopyLocal: s.imageAutoCopyLocal !== false,
      downloadNetwork: s.imageDownloadNetwork === true,
      namingStrategy: (s.imageNamingStrategy as string) || DEFAULTS.namingStrategy,
    };
  } catch {
    return DEFAULTS;
  }
}

function getActiveDocPath(): string | null {
  const el = document.querySelector('.tree-file.active') as HTMLElement | null;
  return el?.dataset?.path || null;
}

function showImageInsertDialog() {
  const overlay = document.getElementById('image-modal');
  if (!overlay) return;

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span>插入图片</span>
        <button class="modal-close" id="image-close">✕</button>
      </div>
      <div style="padding:16px 24px;">
        <div class="image-source-tabs">
          <button class="image-source-tab active" data-tab="local">本地文件</button>
          <button class="image-source-tab" data-tab="url">网络图片</button>
        </div>
        <div id="image-tab-local">
          <button class="file-pick-btn" id="image-pick-local">点击选择图片文件</button>
        </div>
        <div id="image-tab-url" hidden>
          <input class="url-input" id="image-url-input" placeholder="https://example.com/image.png" />
        </div>
        <div class="modal-footer" style="padding-top:16px;display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn-secondary" id="image-cancel">取消</button>
          <button class="btn-primary" id="image-confirm">确定</button>
        </div>
      </div>
    </div>
  `;
  overlay.hidden = false;

  let activeTab: 'local' | 'url' = 'local';

  // Tab switching
  overlay.querySelectorAll('.image-source-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = (tab as HTMLElement).dataset.tab as 'local' | 'url';
      overlay.querySelectorAll('.image-source-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('image-tab-local')!.hidden = activeTab !== 'local';
      document.getElementById('image-tab-url')!.hidden = activeTab !== 'url';
    });
  });

  const close = () => { overlay.hidden = true; };
  document.getElementById('image-close')!.addEventListener('click', close);
  document.getElementById('image-cancel')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

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
      const editor = getEditor();
      editor?.chain().focus().setImage({ src }).run();
      close();
    } catch (e) {
      console.error('Image insert failed:', e);
      showToast('图片插入失败');
    }
  });

  // URL confirm
  document.getElementById('image-confirm')!.addEventListener('click', async () => {
    if (activeTab === 'url') {
      const url = (document.getElementById('image-url-input') as HTMLInputElement).value.trim();
      if (!url) return;
      try {
        const settings = await getImageSettings();
        const docPath = getActiveDocPath();
        const src = await handleNetworkImage(url, docPath, settings);
        const editor = getEditor();
        editor?.chain().focus().setImage({ src }).run();
        close();
      } catch (e) {
        console.error('Image insert failed:', e);
        showToast('图片插入失败');
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
