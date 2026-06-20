import { fetchPageTitle } from '../lib/storage';
import { getEditor, getMode } from '../lib/editor';
import { showToast } from './toast';

export function showLinkDialog() {
  const overlay = document.getElementById('link-modal');
  if (!overlay) return;

  const mode = getMode();
  let selectedText = '';

  if (mode === 'source') {
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

  overlay.innerHTML = `
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
  `;
  overlay.hidden = false;

  const urlInput = document.getElementById('link-url') as HTMLInputElement;
  const textInput = document.getElementById('link-text') as HTMLInputElement;
  const autofillCb = document.getElementById('link-autofill') as HTMLInputElement;

  let aborted = false;

  autofillCb.addEventListener('change', () => {
    textInput.disabled = autofillCb.checked;
    textInput.placeholder = autofillCb.checked ? '自动获取中...' : '留空则使用 URL';
  });

  const close = () => { aborted = true; overlay.hidden = true; };

  document.getElementById('link-close')!.addEventListener('click', close);
  document.getElementById('link-cancel')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

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

    if (mode === 'source') {
      // Source mode — insert Markdown syntax directly into textarea
      const textarea = document.getElementById('source-editor') as HTMLTextAreaElement | null;
      if (!textarea) { close(); return; }
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const markdown = `[${text}](${href})`;
      if (start !== end) {
        // Replace selection with markdown link
        const before = textarea.value.substring(0, start);
        const after = textarea.value.substring(end);
        textarea.value = before + markdown + after;
        textarea.selectionStart = textarea.selectionEnd = start + markdown.length;
      } else if (text) {
        // Insert at cursor
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
      // WYSIWYG mode — use TipTap commands
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
