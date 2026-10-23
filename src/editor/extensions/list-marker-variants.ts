// ── Variant list markers for adjacent same-type lists (issue #391) ───────
//
// The stock list-item renderers emit `- ` / `. ` / `- [ ]` unconditionally, so
// two adjacent lists of the same kind serialize to bytes CommonMark merges
// into one loose list (markdown/adjacent-list-runs.ts). These overrides switch
// to a different marker whenever the parent list carries the `listVariant`
// attr, keeping the round-trip structurally lossless. Marker glyphs are not
// authored data — the stock serializer already normalizes `*`/`+` to `-`.

import { renderNestedMarkdownContent } from '@tiptap/core';
import type { JSONContent, MarkdownRendererHelpers, RenderContext } from '@tiptap/core';
import { getListMarker, ListItem, TaskItem } from '@tiptap/extension-list';
import { LIST_VARIANT_ATTR } from '../markdown/adjacent-list-runs';

type ParentAttrs = Record<string, unknown> | undefined;

function parentAttrsOf(context: RenderContext | undefined): ParentAttrs {
  return context?.meta?.parentAttrs as ParentAttrs;
}

function hasVariantAttr(context: RenderContext | undefined): boolean {
  return parentAttrsOf(context)?.[LIST_VARIANT_ATTR] === 1;
}

/**
 * ListItem renders items for bulletList AND orderedList parents, so this one
 * override covers both. Ordered numbering reuses the stock `getListMarker`
 * with a `)` separator instead of `.`.
 */
export const VariantListItem = ListItem.extend({
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers, context?: RenderContext) {
    return renderNestedMarkdownContent(node, helpers, (ctx) => {
      if (ctx.parentType === 'bulletList') return hasVariantAttr(ctx) ? '* ' : '- ';
      if (ctx.parentType === 'orderedList') {
        const attrs = parentAttrsOf(ctx);
        const start = typeof attrs?.start === 'number' ? attrs.start : 1;
        const type = typeof attrs?.type === 'string' ? attrs.type : null;
        return getListMarker(type, start - 1 + (ctx.index || 0), hasVariantAttr(ctx) ? ') ' : '. ');
      }
      return '- ';
    }, context);
  },
});

export const VariantTaskItem = TaskItem.extend({
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers, context?: RenderContext) {
    const checked = node.attrs?.checked ? 'x' : ' ';
    const bullet = hasVariantAttr(context) ? '*' : '-';
    return renderNestedMarkdownContent(node, helpers, `${bullet} [${checked}] `);
  },
});
