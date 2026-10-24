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
 * #421 extends the same guarantee to the remaining prefixes that can interrupt
 * a paragraph's lazy continuation: blockquote `>` (also the spaceless `>foo`),
 * fence openers (``` ``` ``` / `~~~`), the Setext H1 underline (a full `===`
 * line — only a non-first line has a preceding line to underline, so a
 * first-line `===` stays plain text) and HTML block openers (`<div>`,
 * `</div>`, `<!--`, …). The current pipeline's text encoder already pre-neuters
 * `>`/`<` (as `&gt;`/`&lt;`) and backtick/tilde runs; keeping the rules here
 * too means the paragraph layer's guarantee does not depend on that upstream
 * encoding detail.
 *
 * Non-triggering lines (`6.x`, `-foo`, `a 6. x`, `a < b`, inline `6\.`) are
 * left intact.
 */
export function escapeParagraphMarkdown(md: string): string {
  return md.split('\n').map((line, index) => escapeLineLeadingPrefix(line, index === 0)).join('\n');
}

function escapeLineLeadingPrefix(line: string, isFirstLine: boolean): string {
  let escaped = line;
  // ordered-list marker: 1+ digits then '.' or ')' then space/tab/end
  escaped = escaped.replace(/^(\d+)([.)])(?=\s|$)/, '$1\\$2');
  // bullet markers '- ' / '+ ' (space or tab only — '-foo' stays a paragraph)
  escaped = escaped.replace(/^([-+])(?=\s)/, '\\$1');
  // ATX heading run: escape the first '#' when hashes are followed by space
  escaped = escaped.replace(/^(#{1,6})(?=\s)/, '\\$1');
  // HR-only line: '---' / '___' / '***' (may have trailing space)
  escaped = escaped.replace(/^(-{3,}|_{3,}|\*{3,})\s*$/, '\\$1');
  // blockquote marker: any line-leading '>' (also covers the spaceless '>foo')
  escaped = escaped.replace(/^>/, '\\>');
  // fence opener: escape the first character of a 3+ backtick/tilde run
  escaped = escaped.replace(/^(`{3,}|~{3,})/, '\\$1');
  // Setext H1 underline: only a non-first full-line '===' has a preceding line
  // to underline; a first-line '===' is plain text and must stay unescaped
  if (!isFirstLine && /^={1,}\s*$/.test(line)) {
    escaped = escaped.replace(/^=/, '\\=');
  }
  // HTML block opener: escape just the '<' of '<tag' / '</tag' / '<!--' —
  // 'a < b' and '<3' open no interrupting HTML block
  escaped = escaped.replace(/^<(?=[a-zA-Z!\/])/, '\\<');
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
