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
 * #436 closes the remaining continuation gaps: the Setext H2 underline (a
 * full `-`/`--` line, non-first-line-only for the same reason as `===` —
 * upstream's escaper does not touch `-`, so this one is a real pipeline fix),
 * space-separated thematic breaks (`* * *` / `_ _ _` / `- - -`; the upstream
 * escaper already neuters `*`/`_` per character and the bullet rule catches
 * `- `/`* ` spellings first — the rule here covers the rest), and the third
 * CommonMark bullet character `*` joining `-`/`+` in the bullet rule.
 *
 * #438 relaxes the anchor to allow 1-3 leading spaces: CommonMark keeps a
 * block start effective under up to 3 spaces of indent, so the escape is
 * inserted after the preserved indent (the indent bytes ride in the paragraph
 * text and semantic fingerprint untouched). 4+ spaces or a tab make the line
 * a lazy continuation — no block start — and MUST stay unescaped, or authored
 * spellings like `正文\n    - foo` would lose byte-stability on save.
 *
 * Non-triggering lines (`6.x`, `-foo`, `a 6. x`, `a < b`, inline `6\.`) are
 * left intact.
 */
export function escapeParagraphMarkdown(md: string): string {
  return md.split('\n').map((line, index) => escapeLineLeadingPrefix(line, index === 0)).join('\n');
}

function escapeLineLeadingPrefix(line: string, isFirstLine: boolean): string {
  // 1-3 leading spaces do not defuse a block prefix, so every rule below
  // anchors on the body after the indent and the escape lands between the
  // preserved indent and the prefix. With 4+ spaces or a tab the body starts
  // with whitespace and no rule can hit — exactly the lazy-continuation
  // contract above (#438).
  const indent = /^ {1,3}/.exec(line)?.[0] ?? '';
  const body = line.slice(indent.length);
  let escaped = body;
  // ordered-list marker: 1+ digits then '.' or ')' then space/tab/end
  escaped = escaped.replace(/^(\d+)([.)])(?=\s|$)/, '$1\\$2');
  // bullet markers '- ' / '+ ' / '* ' (space or tab only — '-foo'/'*foo' stay
  // paragraphs; '*' joins as CommonMark's third bullet character, #436)
  escaped = escaped.replace(/^([-+*])(?=\s)/, '\\$1');
  // ATX heading run: escape the first '#' when hashes are followed by space
  escaped = escaped.replace(/^(#{1,6})(?=\s)/, '\\$1');
  // HR-only line: '---' / '___' / '***' (may have trailing space)
  escaped = escaped.replace(/^(-{3,}|_{3,}|\*{3,})\s*$/, '\\$1');
  // Space-separated thematic break: the SAME char repeated 3+ times with 1-3
  // spaces between ('* * *' / '_ _ _' / '- - -', may have trailing space) is
  // an HR too; escape the first char and keep the rest of the line (the
  // backreference forces one character; trailing whitespace is consumed with
  // the match like the contiguous HR rule). '-'/ '*'-led spellings are usually
  // eaten by the bullet rule above — this covers the rest ('_ _ _'). Applied
  // to the first line as well: the whole line IS the block marker (#436).
  escaped = escaped.replace(/^([-*_])(( {1,3}\1){2,})\s*$/, '\\$1$2');
  // blockquote marker: any line-leading '>' (also covers the spaceless '>foo')
  escaped = escaped.replace(/^>/, '\\>');
  // fence opener: escape the first character of a 3+ backtick/tilde run
  escaped = escaped.replace(/^(`{3,}|~{3,})/, '\\$1');
  // Setext underline (H1 '=' / H2 '-'): only a non-first full-line run of one
  // character has a preceding line to underline; a first-line run is plain
  // text and must stay unescaped ('=-=' mixed runs never match) (#421/#436)
  if (!isFirstLine && /^(={1,}|-{1,})\s*$/.test(body)) {
    escaped = escaped.replace(/^[-=]/, '\\$&');
  }
  // HTML block opener: escape just the '<' of '<tag' / '</tag' / '<!--' —
  // 'a < b' and '<3' open no interrupting HTML block
  escaped = escaped.replace(/^<(?=[a-zA-Z!\/])/, '\\<');
  return indent + escaped;
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
