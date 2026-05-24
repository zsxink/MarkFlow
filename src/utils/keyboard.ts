import { getEditor, switchToSource, switchToWysiwyg, getMode } from '../lib/editor';
import { showToast } from '../components/toast';
import { saveActiveDocument } from '../components/sidebar';

function sanitizeLinkHref(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('#') || trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('/')) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    if (['http:', 'https:', 'mailto:'].includes(url.protocol)) {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

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
        await saveActiveDocument();
        break;
      case 'k': {
        e.preventDefault();
        const url = prompt('输入链接 URL:');
        const href = url ? sanitizeLinkHref(url) : null;
        if (href && editor) {
          editor.chain().focus().setLink({ href }).run();
        } else if (url) {
          showToast('不支持的链接协议');
        }
        break;
      }
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
