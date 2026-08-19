import { fetchPageTitle } from '../lib/storage';
import { getEditor, getMode } from '../lib/editor';
import { showToast } from './toast';
import { showModal } from './ui/modal';
import { getActiveLosslessView, insertLinkMarkdown } from '../lib/lossless/commandRouter';

export function showLinkDialog() {
  const mode = getMode();
  const losslessView = getActiveLosslessView();
  let selectedText = '';

  if (losslessView) {
    // Lossless path: the single CodeMirror view is the only selection owner
    // (design 03 §6). Never read the hidden ProseMirror or a legacy textarea.
    const { state } = losslessView;
    const { from, to } = state.selection.main;
    if (from !== to) {
      selectedText = state.sliceDoc(from, to);
    }
  } else if (mode === 'source') {
    const textarea = document.getElementById('source-editor') as HTMLTextAreaElement | null;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      if (start !== end) {
        selectedText = textarea.value.substring(start, end);
      }
    }
  } else {
    const editor = getEditor();
    selectedText = editor?.state.selection ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ') : '';
  }

  const modal = showModal({
    content: `
      <div class="modal">
        <div class="modal-header">
          <span>插入链接</span>
          <button class="modal-close" id="link-close">✕</button>
        </div>
        <div style="padding:16px 24px;">
          <div class="link-field">
            <label class="link-label">URL</label>
            <input class="link-input" id="link-url" placeholder="https://example.com" autofocus />
          </div>
          <div class="link-field" style="margin-top:10px;">
            <label class="link-label">文本</label>
            <input class="link-input" id="link-text" placeholder="留空则使用 URL" value="${selectedText.replace(/"/g, '&quot;')}" />
            <label class="link-autofill-label">
              <input type="checkbox" id="link-autofill" />
              自动填充
            </label>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
            <button class="btn-secondary" id="link-cancel">取消</button>
            <button class="btn-primary" id="link-confirm">确定</button>
          </div>
        </div>
      </div>
    `,
  });

  const urlInput = document.getElementById('link-url') as HTMLInputElement;
  const textInput = document.getElementById('link-text') as HTMLInputElement;
  const autofillCb = document.getElementById('link-autofill') as HTMLInputElement;

  let aborted = false;

  const close = () => { aborted = true; modal.hide(); };

  autofillCb.addEventListener('change', () => {
    textInput.disabled = autofillCb.checked;
    textInput.placeholder = autofillCb.checked ? '自动获取中...' : '留空则使用 URL';
  });

  document.getElementById('link-close')!.addEventListener('click', close);
  document.getElementById('link-cancel')!.addEventListener('click', close);

  document.getElementById('link-confirm')!.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
      showToast('请输入 URL');
      urlInput.focus();
      return;
    }

    let href: string;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        showToast('仅支持 http/https 链接');
        return;
      }
      href = parsed.toString();
    } catch {
      showToast('URL 格式不正确');
      return;
    }

    let text = textInput.value.trim();

    if (!text) {
      if (autofillCb.checked) {
        autofillCb.disabled = true;
        textInput.placeholder = '正在获取...';
        try {
          text = await fetchPageTitle(href);
        } catch {
          text = href;
        }
        autofillCb.disabled = false;
      } else {
        text = href;
      }
    }

    if (aborted) return;

    // Lossless path (Source AND Live Preview): dispatch the link-then-text
    // change as a LOCAL CodeMirror transaction on the active view, so the
    // binding's updateListener queues it as one user patch.
    const activeLosslessView = getActiveLosslessView();
    if (activeLosslessView) {
      const { from, to } = activeLosslessView.state.selection.main;
      if (from === to && !text) {
        showToast('请选择要链接的文本或输入显示文本');
        return;
      }
      insertLinkMarkdown(activeLosslessView, href, text);
      close();
      return;
    }

    if (mode === 'source') {
      const textarea = document.getElementById('source-editor') as HTMLTextAreaElement | null;
      if (!textarea) { close(); return; }
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const markdown = `[${text}](${href})`;
      if (start !== end) {
        const before = textarea.value.substring(0, start);
        const after = textarea.value.substring(end);
        textarea.value = before + markdown + after;
        textarea.selectionStart = textarea.selectionEnd = start + markdown.length;
      } else if (text) {
        const before = textarea.value.substring(0, start);
        const after = textarea.value.substring(start);
        textarea.value = before + markdown + after;
        textarea.selectionStart = textarea.selectionEnd = start + markdown.length;
      } else {
        showToast('请选择要链接的文本或输入显示文本');
        return;
      }
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const ed = getEditor();
      if (ed) {
        const { from, to } = ed.state.selection;
        if (from === to && !text) {
          showToast('请选择要链接的文本或输入显示文本');
          return;
        }
        if (from === to) {
          const insertEnd = from + text.length;
          ed.chain().focus().insertContent(text).setTextSelection({ from, to: insertEnd }).setLink({ href }).run();
        } else if (text) {
          ed.chain().focus().deleteSelection().insertContent(text).setTextSelection({ from, to: from + text.length }).setLink({ href }).run();
        } else {
          ed.chain().focus().setLink({ href }).run();
        }
      }
    }
    close();
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      textInput.focus();
    }
  });
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('link-confirm')!.click();
    }
  });
}