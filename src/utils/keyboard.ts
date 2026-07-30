import { getEditor, switchToSource, switchToWysiwyg, getMode } from '../lib/editor';
import { showToast } from '../components/toast';
import { saveActiveDocument, openFileInEditor, confirmDocumentTransition } from '../components/sidebar';
import { showNewFileDialog } from '../components/newFileDialog';
import { getWorkspacePath } from '../components/fileTree';
import { open } from '@tauri-apps/plugin-dialog';
import { addRecentFile } from '../lib/storage';
import { isCoreBackedSourceModeEnabled } from '../lib/coreSession';
import { executeFormatCommand } from '../editor-adapter/formatCommandLayer';

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
        if (isCoreBackedSourceModeEnabled() && getMode() === 'source') {
          void executeFormatCommand({ type: 'toggle_strong', anchor: 0, head: 0 });
        } else {
          editor?.chain().focus().toggleBold().run();
        }
        break;
      case 'i':
        e.preventDefault();
        if (isCoreBackedSourceModeEnabled() && getMode() === 'source') {
          void executeFormatCommand({ type: 'toggle_emphasis', anchor: 0, head: 0 });
        } else {
          editor?.chain().focus().toggleItalic().run();
        }
        break;
      case 's':
        e.preventDefault();
        await saveActiveDocument();
        break;
      case 'o':
        e.preventDefault();
        if (!(await confirmDocumentTransition())) break;
        {
          const selected = await open({
            multiple: false,
            filters: [{ name: 'Markdown', extensions: ['md'] }],
          });
          if (selected) { await addRecentFile(selected); await openFileInEditor(selected); }
        }
        break;
      case 'k': {
        e.preventDefault();
        // In Core-backed source mode, use EditCommand for link insertion
        if (isCoreBackedSourceModeEnabled() && getMode() === 'source') {
          const url = prompt('输入链接 URL:');
          const href = url ? sanitizeLinkHref(url) : null;
          if (href) {
            void executeFormatCommand({
              type: 'insert_link',
              anchor: 0,
              head: 0,
              href,
              title: null,
            });
          } else if (url) {
            showToast('不支持的链接协议');
          }
        } else {
          const url = prompt('输入链接 URL:');
          const href = url ? sanitizeLinkHref(url) : null;
          if (href && editor) {
            editor.chain().focus().setLink({ href }).run();
          } else if (url) {
            showToast('不支持的链接协议');
          }
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
          showNewFileDialog('file', getWorkspacePath());
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
          if (isCoreBackedSourceModeEnabled() && getMode() === 'source') {
            void executeFormatCommand({ type: 'toggle_strikethrough', anchor: 0, head: 0 });
          } else {
            editor?.chain().focus().toggleStrike().run();
          }
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
