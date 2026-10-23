import type { JSONContent } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { store } from '../../infra/store';
import { imagePathToSrc } from '../../infra/images/index';
import { assetToOriginalMap, getActiveDocPath } from '../state';

export const BlockImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // Resolver-only, node-local authored source. It survives ProseMirror
      // transactions but is intentionally absent from DOM and Markdown output
      // except as the value used by our renderer below.
      authoredSrc: {
        default: null,
        rendered: false,
        parseHTML: () => null,
      },
    };
  },
  renderMarkdown(node: JSONContent) {
    const resolvedSrc = String(node.attrs?.src ?? '');
    const src = String(node.attrs?.authoredSrc ?? assetToOriginalMap.get(resolvedSrc) ?? resolvedSrc).replace(/[()]/g, '\\$&');
    const alt = String(node.attrs?.alt ?? '').replace(/[\[\]]/g, '\\$&');
    const title = node.attrs?.title ? ` \"${String(node.attrs.title).replace(/\"/g, '\\\"')}\"` : '';
    return `![${alt}](${src}${title})`;
  },
  addNodeView() {
    return ({ node, HTMLAttributes }) => {
      const img = document.createElement('img');
      Object.entries(Image.options.HTMLAttributes).forEach(([key, value]) => {
        if (key === 'class') return;
        img.setAttribute(key, value as string);
      });
      Object.entries(HTMLAttributes).forEach(([key, value]) => {
        if (value != null) img.setAttribute(key, value as string);
      });
      const syncImageSource = () => {
        const authored = String(node.attrs.authoredSrc ?? assetToOriginalMap.get(node.attrs.src) ?? node.attrs.src ?? '');
        const docPath = getActiveDocPath();
        if (!authored) return;
        const resourceUrl = /^(?:https?:|data:|asset:|blob:|file:)/i.test(authored);
        img.src = docPath && !resourceUrl ? imagePathToSrc(authored, docPath) : String(resourceUrl ? authored : node.attrs.src ?? authored);
      };
      syncImageSource();
      store.on('file:active', syncImageSource);
      if (node.attrs.alt) img.alt = node.attrs.alt;

      const wrapper = document.createElement('span');
      wrapper.className = 'image-node-view';
      wrapper.appendChild(img);

      let errorEl: HTMLSpanElement | null = null;

      function showError() {
        if (errorEl) return;
        errorEl = document.createElement('span');
        errorEl.className = 'image-error-inline';
        errorEl.contentEditable = 'false';

        const icon = document.createElement('span');
        icon.className = 'image-error-icon';
        icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`;

        const label = document.createElement('span');
        label.className = 'image-error-label';
        label.textContent = '图片加载失败';

        errorEl.appendChild(icon);
        errorEl.appendChild(label);

        img.style.display = 'none';
        wrapper.appendChild(errorEl);
      }

      function hideError() {
        if (errorEl) {
          errorEl.remove();
          errorEl = null;
        }
        img.style.display = '';
        img.classList.remove('image-error');
      }

      img.addEventListener('error', showError);
      img.addEventListener('load', hideError);
      if (img.complete && img.naturalWidth === 0) showError();

      return {
        dom: wrapper,
        destroy() { store.off('file:active', syncImageSource); },
        ignoreMutation: () => true,
        stopEvent: (e: Event) => {
          if (errorEl && (e.type === 'mousedown' || e.type === 'pointerdown')) {
            const target = e.target as Node;
            if (errorEl.contains(target)) {
              e.preventDefault();
              return true;
            }
          }
          return false;
        },
      };
    };
  },
});
