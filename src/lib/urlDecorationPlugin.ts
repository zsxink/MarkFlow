import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { find } from 'linkifyjs';

/**
 * Plugin key for the URL decoration plugin.
 */
export const urlDecoKey = new PluginKey('url-decoration');

/**
 * Creates a ProseMirror plugin that:
 * - Detects bare URLs in the document text (via linkifyjs)
 * - Adds visual inline decorations (.auto-link-deco) around them — no link marks,
 *   so the markdown source is never modified
 * - Handles Ctrl+Click / Cmd+Click to open the URL in a browser
 * - Skips text already inside a link mark (manual links) or code mark
 */
export function createUrlDecorationPlugin() {
  return new Plugin<DecorationSet>({
    key: urlDecoKey,
    state: {
      init() {
        return DecorationSet.empty;
      },
      apply(tr, oldSet) {
        // Only rebuild decorations when the document content changes
        if (!tr.docChanged) return oldSet.map(tr.mapping, tr.doc);
        if (!tr.doc) return DecorationSet.empty;

        const decorations: Decoration[] = [];

        tr.doc.descendants((node, pos) => {
          if (!node.isText || !node.text) return;

          // Skip if the text is already inside a link mark (user created it manually)
          // or inside inline code — code blocks are node types, not marks
          const hasLinkMark = node.marks.some(m => m.type.name === 'link');
          const hasCodeMark = node.marks.some(m => m.type.name === 'code');
          if (hasLinkMark || hasCodeMark) return;

          const links = find(node.text);
          if (!links.length) return;

          links.forEach(link => {
            if (!link.isLink) return;
            decorations.push(
              Decoration.inline(
                pos + link.start,
                pos + link.end,
                {
                  class: 'auto-link-deco',
                  'data-href': link.href,
                },
              ),
            );
          });
        });

        return DecorationSet.create(tr.doc, decorations);
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
      handleClick(_view, _pos, event) {
        if (event.button !== 0) return false;
        if (!(event.target instanceof Node)) return false;

        // Find the decoration span: the target may be a text node inside it
        const targetEl =
          event.target instanceof HTMLElement
            ? event.target
            : event.target.parentElement;
        if (!targetEl) return false;

        const decoEl = targetEl.classList.contains('auto-link-deco')
          ? targetEl
          : targetEl.closest('.auto-link-deco');
        if (!(decoEl instanceof HTMLElement)) return false;

        const href = decoEl.getAttribute('data-href');
        if (!href) return false;

        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          window.open(href, '_blank', 'noopener,noreferrer');
          return true;
        }

        // Let ProseMirror handle regular clicks (cursor placement)
        return false;
      },
    },
  });
}
