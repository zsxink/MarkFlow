import { getEditor, switchToSource, switchToWysiwyg, getMode } from '../lib/editor';
import { saveActiveDocument, openFileInEditor, confirmDocumentTransition } from '../components/sidebar';
import { showNewFileDialog } from '../components/newFileDialog';
import { getWorkspacePath } from '../components/fileTree';
import { open } from '@tauri-apps/plugin-dialog';
import { addRecentFile } from '../lib/storage';
import { isCoreBackedSourceModeEnabled } from '../lib/coreSession';
import {
  executeFormattingAction,
  executeRedo,
  executeUndo,
} from '../editor-adapter/formatCommandLayer';
import { showLinkDialog } from '../components/linkDialog';
import { getSourceView } from '../lib/editor.source';

export function initKeyboard() {
  document.addEventListener('keydown', async (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;

    const editor = getEditor();

    switch (e.key.toLowerCase()) {
      case 'b':
        e.preventDefault();
        if (isCoreBackedSourceModeEnabled() && getMode() === 'source') {
          void executeFormattingAction({ type: 'toggle_strong' });
        } else {
          editor?.chain().focus().toggleBold().run();
        }
        break;
      case 'i':
        e.preventDefault();
        if (isCoreBackedSourceModeEnabled() && getMode() === 'source') {
          void executeFormattingAction({ type: 'toggle_emphasis' });
        } else {
          editor?.chain().focus().toggleItalic().run();
        }
        break;
      case 's':
        if (e.shiftKey) break;
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
        if (isCoreBackedSourceModeEnabled() && getMode() === 'source') {
          showCoreLinkDialog();
        } else {
          showLinkDialog();
        }
        break;
      }
      case 'z':
        e.preventDefault();
        if (isCoreBackedSourceModeEnabled() && getMode() === 'source') {
          if (e.shiftKey) void executeRedo();
          else void executeUndo();
        } else if (e.shiftKey) {
          editor?.chain().focus().redo().run();
        } else {
          editor?.chain().focus().undo().run();
        }
        break;
      case 'y':
        e.preventDefault();
        if (isCoreBackedSourceModeEnabled() && getMode() === 'source') {
          void executeRedo();
        } else {
          editor?.chain().focus().redo().run();
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
            void executeFormattingAction({ type: 'toggle_strikethrough' });
          } else {
            editor?.chain().focus().toggleStrike().run();
          }
          break;
      }
    }
  });
}

function showCoreLinkDialog(): void {
  const view = getSourceView();
  const selectedText = view
    ? view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)
    : '';

  showLinkDialog({
    selectedText,
    onConfirm: ({ href, text }) => {
      void executeFormattingAction({
        type: 'insert_link',
        href,
        title: null,
        text,
      });
    },
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
