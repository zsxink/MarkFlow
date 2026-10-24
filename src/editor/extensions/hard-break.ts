import type { JSONContent, MarkdownToken } from '@tiptap/core';
import HardBreak from '@tiptap/extension-hard-break';

// ── Soft-break aware hard break extension ───────────────────────────────

/**
 * Drop-in replacement for StarterKit's hard-break node that keeps soft and
 * hard breaks distinguishable.
 *
 * With `breaks: true` marked emits a `br` token for every in-paragraph
 * newline. The token's `raw` is exactly `"\n"` for a soft break (no trailing
 * spaces, no backslash) and anything else (`"  \n"`, `"\\\n"`, …) for a hard
 * break. Soft breaks become `hardBreak` nodes carrying `soft: true`: they
 * render like hard breaks but serialize back to the bare newline, so the
 * source spelling never silently upgrades to a hard break.
 */
export const SafeHardBreak = HardBreak.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // Authored-only flag with no HTML source: `null` (not `false`) keeps
      // the "absent" representation fingerprint-stable across materialized
      // and omitted attribute forms.
      soft: {
        default: null,
        rendered: false,
        parseHTML: () => null,
      },
    };
  },
  parseMarkdown(token: MarkdownToken) {
    return token?.raw === '\n'
      ? { type: 'hardBreak', attrs: { soft: true } }
      : { type: 'hardBreak' };
  },
  renderMarkdown(node: JSONContent) {
    return node?.attrs?.soft === true ? '\n' : '  \n';
  },
});
