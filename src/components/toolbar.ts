import { getEditor, switchToSource, switchToWysiwyg, getMarkdown } from '../lib/editor';
import { cycleTheme } from '../lib/theme';
import { open } from '@tauri-apps/plugin-dialog';
import { setWorkspacePath, refreshFileTree, getWorkspacePath } from './fileTree';
import { showNewFileDialog } from './newFileDialog';
import { showToast } from './toast';
import { writeFile } from '../lib/storage';
import { getActiveFilePath } from './sidebar';

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
