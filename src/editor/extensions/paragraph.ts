import type { JSONContent, MarkdownRendererHelpers, RenderContext } from '@tiptap/core';
import Paragraph from '@tiptap/extension-paragraph';

// ── Safe paragraph extension ────────────────────────────────────────────

/**
 * Escape block-level prefixes on EVERY line of a serialized paragraph.
 *
 * `@tiptap/markdown` v3's `escapeMarkdownSyntax` only escapes `[\`*_[\]~]`, so
 * a paragraph line that begins with a literal (escaped-in-source) block prefix —
 * `6\. 正文`, `\- foo`, `\# foo`, `\---` — loses its backslash on serialization
 * and re-parses as a different block (ordered list / bullet / heading / HR).
 * Re-adding the escape on each line keeps such paragraphs stable without
 * touching real block-level nodes (lists, headings, HR…), which are typed
 * nodes and never reach the paragraph renderer.
 *
 * Line-by-line (not first-line-only) because in-paragraph breaks — soft
 * (`\n`) and hard (`  \n`) alike — serialize into the same paragraph string:
 * a continuation line typed as `1. ` / `# ` / `- ` / `---` would otherwise
 * re-parse as a list / heading / HR on reload.
 *
 * Non-triggering lines (`6.x`, `-foo`, `a 6. x`, inline `6\.`) are left intact.
 */
export function escapeParagraphMarkdown(md: string): string {
  return md.split('\n').map(escapeLineLeadingPrefix).join('\n');
}

function escapeLineLeadingPrefix(line: string): string {
  let escaped = line;
  // ordered-list marker: 1+ digits then '.' or ')' then space/tab/end
  escaped = escaped.replace(/^(\d+)([.)])(?=\s|$)/, '$1\\$2');
  // bullet markers '- ' / '+ ' (space or tab only — '-foo' stays a paragraph)
  escaped = escaped.replace(/^([-+])(?=\s)/, '\\$1');
  // ATX heading run: escape the first '#' when hashes are followed by space
  escaped = escaped.replace(/^(#{1,6})(?=\s)/, '\\$1');
  // HR-only line: '---' / '___' / '***' (may have trailing space)
  escaped = escaped.replace(/^(-{3,}|_{3,}|\*{3,})\s*$/, '\\$1');
  return escaped;
}

/**
 * Drop-in replacement for StarterKit's paragraph node whose Markdown renderer
 * re-applies the escape on line-leading block prefixes (see
 * `escapeParagraphMarkdown`). Extending upstream `Paragraph` inherits its
 * full behavior — `addOptions`, `parseDOM`, `parseMarkdown` (including the
 * empty-paragraph `&nbsp;` special case) — so only `renderMarkdown` differs.
 */
export const SafeParagraph = Paragraph.extend({
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers, ctx?: RenderContext) {
    if (!node) return '';
    const content = Array.isArray(node.content) ? node.content : [];
    if (content.length === 0) {
      const previousContent = Array.isArray(ctx?.previousNode?.content) ? ctx.previousNode.content : [];
      return ctx?.previousNode?.type === 'paragraph' && previousContent.length === 0 ? '&nbsp;' : '';
    }
    return escapeParagraphMarkdown(helpers.renderChildren(content));
  },
});
