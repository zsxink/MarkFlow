import { getEditor, switchToSource, switchToWysiwyg, getMode, getMarkdown } from '../lib/editor';
import { showToast } from '../components/toast';
import { writeFile } from '../lib/storage';
import { getActiveFilePath } from '../components/sidebar';
import { suppressNextWatcherRefresh } from '../components/fileTree';

export function initKeyboard() {
  document.addEventListener('keydown', async (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;

    const editor = getEditor();

    switch (e.key.toLowerCase()) {
      case 'b':
        e.preventDefault();
        editor?.chain().focus().toggleBold().run();
        break;
      case 'i':
        e.preventDefault();
        editor?.chain().focus().toggleItalic().run();
        break;
      case 's':
        e.preventDefault();
        {
          const filePath = getActiveFilePath();
          if (!filePath) {
            showToast('没有打开的文件');
            break;
          }
          try {
            const content = getMarkdown();
            suppressNextWatcherRefresh(filePath);
            await writeFile(filePath, content);
            showToast('已保存');
          } catch (err) {
            console.error('Save failed:', err);
            showToast('保存失败');
          }
        }
        break;
      case 'k':
        e.preventDefault();
        const url = prompt('输入链接 URL:');
        if (url && editor) {
          editor.chain().focus().setLink({ href: url }).run();
        }
        break;
      case '\\':
        e.preventDefault();
        document.getElementById('sidebar')?.classList.toggle('collapsed');
        break;
      case '/':
        e.preventDefault();
        if (getMode() === 'wysiwyg') {
          switchToSource();
          updateModeBtns('source');
        } else {
          switchToWysiwyg();
          updateModeBtns('wysiwyg');
        }
        break;
      case 'n':
        if (!e.shiftKey) {
          e.preventDefault();
          // TODO: trigger new file dialog
        }
        break;
    }

    if (e.shiftKey) {
      switch (e.key.toLowerCase()) {
        case 'f':
          e.preventDefault();
          document.getElementById('app')?.classList.toggle('focus-mode');
          break;
        case 's':
          e.preventDefault();
          editor?.chain().focus().toggleStrike().run();
          break;
      }
    }
  });
}

function updateModeBtns(mode: string) {
  const wysiwygBtn = document.getElementById('btn-wysiwyg');
  const sourceBtn = document.getElementById('btn-source');
  const indicator = document.getElementById('mode-indicator');

  if (wysiwygBtn) wysiwygBtn.classList.toggle('active', mode === 'wysiwyg');
  if (sourceBtn) sourceBtn.classList.toggle('active', mode === 'source');
  if (indicator) indicator.textContent = mode === 'wysiwyg' ? '所见即所得' : '源码';
}
