import { InputRule } from '@tiptap/core';
import type { JSONContent, MarkdownParseHelpers, MarkdownRendererHelpers, MarkdownToken } from '@tiptap/core';
import Link from '@tiptap/extension-link';

// ── Custom Link extension ──────────────────────────────────────────────

// Paste rules disabled and explicit [text](url) serialization
// (never <url> autolink syntax). See session.ts for rationale.
export const CustomLink = Link.extend({
  addPasteRules() {
    return [];
  },
  addInputRules() {
    return [
      new InputRule({
        find: /\[([^\]]+)\]\(([^)]+)\)$/,
        handler({ state, range, match }) {
          const { tr } = state;
          const text = match[1];
          const url = match[2];
          const { from, to } = range;
          tr.replaceWith(from, to, state.schema.text(text));
          tr.addMark(from, from + text.length, state.schema.marks.link.create({ href: url }));
        },
      }),
    ];
  },
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    return helpers.applyMark('link', helpers.parseInline(token.tokens ?? []), {
      href: String(token.href ?? ''),
      title: token.title ? String(token.title) : null,
    });
  },
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
    const href = String(node.attrs?.href ?? '').replace(/[\(\)"]/g, '\\$&');
    const title = node.attrs?.title ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"` : '';
    return `[${helpers.renderChildren(node)}](${href}${title})`;
  },
});
