// ── Opaque atom node extension (task 7.3 / design Decision 5) ─────────────
//
// A non-editable, selectable block atom that holds an opaque raw span inside
// the WYSIWYG document. The node stores ONLY the session-local `slot` and a
// display `category` — NEVER the raw payload. The payload lives solely in the
// session registry (`MarkdownSession.opaqueRegistry`), so ProseMirror JSON,
// the DOM, clipboard and undo history can never leak raw blog HTML, comments
// or front matter.
//
//   parse:  a sentinel token `⟦MF-OPAQUE:nonce.index⟧` → opaque node
//   render: opaque node → its sentinel (restore resolves it via the registry)
//   node view: a safe, non-editable label — never injects raw HTML

import { Node, mergeAttributes } from '@tiptap/core';
import type { Editor, JSONContent, MarkdownLexerConfiguration, MarkdownToken } from '@tiptap/core';
import {
  OPAQUE_SENTINEL_PREFIX,
  OPAQUE_SENTINEL_SUFFIX,
  type OpaqueRegistry,
  parseSentinel,
  sentinelFor,
} from './editor.markdown.opaque';
import { resolveClipboardOpaque } from './editor.markdown.opaque.clipboard';
import type { OpaqueCategory } from './editor.markdown.types';

/**
 * Module-scoped handle to the active session registry. Set by the bridge
 * before parsing a document (task 7.4 admission) so `parseMarkdown` can derive
 * an opaque node's display `category` from its slot WITHOUT the node storing
 * the payload. Cleared (null) after parsing so no stale cross-session data
 * leaks between documents.
 */
let activeRegistry: OpaqueRegistry | null = null;

/** Install the registry the opaque parser should consult (bridge only). */
export function setActiveOpaqueRegistry(registry: OpaqueRegistry | null): void {
  activeRegistry = registry;
}

/**
 * Copy/cut handler (task 7.5). Serializes the current selection's nodes to
 * Markdown and resolves any opaque sentinel back to its raw payload, so the
 * clipboard never carries an internal token. Returns `true` if it handled the
 * event (selection had opaque content and markdown was written).
 */
export function handleOpaqueCopy(
  clipboardData: DataTransfer,
  editor: Editor,
  registry: OpaqueRegistry | null,
): boolean {
  const { state } = editor.view;
  const slice = state.selection.content();
  if (slice.size === 0) return false;
  const manager = (editor as unknown as { markdown?: { serialize?(json: JSONContent): string } }).markdown;
  if (!manager?.serialize) return false;
  const md = manager.serialize({ type: 'doc', content: slice.content.toJSON() as JSONContent[] });
  if (md.length === 0) return false;
  const resolved = resolveClipboardOpaque(md, registry ?? activeRegistry);
  clipboardData.setData('text/markdown', resolved);
  clipboardData.setData('text/plain', resolved);
  return true;
}


export const OPAQUE_NODE_NAME = 'markflowOpaque';

/** Marked token type emitted by the tokenizer (== `markdownTokenName`). */
export const OPAQUE_TOKEN_NAME = 'markflow-opaque';

/** Human-facing label per category (contains no opaque payload). */
const CATEGORY_LABELS: Record<OpaqueCategory, string> = {
  frontmatter: 'YAML 元数据',
  'html-block': 'HTML 块',
  'html-comment': 'HTML 注释',
};

/**
 * The opaque atom extension. Instances are stateless with respect to the
 * session registry: they only translate between `slot`/`category` attrs and a
 * sentinel string. The registry resolves sentinels ↔ raw payloads at the
 * bridge boundary (tasks 7.4, 8.x), keeping the node content-minimal.
 */
export const OpaqueNode = Node.create({
  name: OPAQUE_NODE_NAME,
  markdownTokenName: OPAQUE_TOKEN_NAME,

  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      slot: { default: null },
      category: {
        default: 'html-block' as OpaqueCategory,
        parseHTML: (element) => element.getAttribute('data-category') as OpaqueCategory,
        renderHTML: (attributes) => ({ 'data-category': attributes.category }),
      },
    };
  },

  // A sentinel in authored Markdown is recognized by its own tokenizer so no
  // part of the raw opaque payload ever flows through general Markdown parsing.
  // `start` is Marked's lookahead: jump to the first sentinel prefix. In
  // `tokenize`, `src` is the remaining tail (already sliced by Marked to begin
  // at the sentinel), so a sentinel at offset 0 is consumed whole as the token.
  markdownTokenizer: {
    name: OPAQUE_TOKEN_NAME,
    level: 'block',
    start: (src: string) => src.indexOf(OPAQUE_SENTINEL_PREFIX),
    tokenize(src: string, _tokens: MarkdownToken[], _helper: MarkdownLexerConfiguration): MarkdownToken | undefined {
      // Marked consumes preceding blocks first, so a sentinel on its own line
      // arrives at offset 0; requiring `startsWith` keeps the match precise and
      // lets any inline sentinel fall through to normal parsing (which will
      // simply treat it as prose or reject via eligibility).
      if (!src.startsWith(OPAQUE_SENTINEL_PREFIX)) return undefined;
      const suffix = src.indexOf(OPAQUE_SENTINEL_SUFFIX, OPAQUE_SENTINEL_PREFIX.length);
      if (suffix === -1) return undefined;
      const raw = src.slice(0, suffix + 1);
      const slot = parseSentinel(raw);
      if (!slot) return undefined;
      return { type: OPAQUE_TOKEN_NAME, slot, raw };
    },
  },

  parseHTML() {
    return [{ tag: `div[data-opaque-slot]` }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-opaque-slot': node.attrs.slot ?? '',
      'data-category': node.attrs.category ?? 'html-block',
      contenteditable: 'false',
    })];
  },

  parseMarkdown(token: MarkdownToken, helpers): JSONContent {
    const slot = typeof token.slot === 'string' ? token.slot : '';
    const entry = activeRegistry?.get(slot);
    // A foreign/unresolvable sentinel (pasted plain text from elsewhere, a
    // forged token, a slot from a dead session) MUST NOT become an opaque
    // node — it cannot resolve one-to-one. Treat it as literal user text
    // (task 7.5 paste-side safety).
    if (!entry) {
      const raw = typeof token.raw === 'string' && token.raw ? token.raw : (OPAQUE_SENTINEL_PREFIX + slot + OPAQUE_SENTINEL_SUFFIX);
      return helpers.createTextNode(raw);
    }
    return helpers.createNode(OPAQUE_NODE_NAME, { slot, category: entry.category });
  },

  renderMarkdown(node: JSONContent): string {
    const slot = typeof node.attrs?.slot === 'string' ? node.attrs.slot : '';
    return slot ? sentinelFor(slot) : '';
  },

  // Task 7.5 copy/cut: when the selection contains an opaque atom, serialize
  // the selected nodes to Markdown and resolve any opaque sentinel back to its
  // raw payload before writing to the clipboard — so an internal token never
  // leaves via copy/cut. Without an active registry the resolved text is the
  // serialized Markdown with any sentinel left as literal user text.
  onCreate() {
    const editor = this.editor;
    const onCopyCut = (event: Event) => {
      const e = event as ClipboardEvent;
      if (e.clipboardData == null) return;
      handleOpaqueCopy(e.clipboardData, editor, activeRegistry);
    };
    editor.view.dom.addEventListener('copy', onCopyCut);
    editor.view.dom.addEventListener('cut', onCopyCut);
  },

  addNodeView() {
    return ({ node, editor }) => {
      const category = (node.attrs.category as OpaqueCategory) ?? 'html-block';
      const dom = document.createElement('div');
      dom.className = 'opaque-atom';
      dom.setAttribute('data-opaque-slot', String(node.attrs.slot ?? ''));
      dom.setAttribute('data-category', category);
      dom.contentEditable = 'false';

      // A document-leading frontmatter block has its own metadata region in
      // WYSIWYG. Do not render the legacy opaque placeholder in the body.
      if (category === 'frontmatter') {
        dom.hidden = true;
        dom.setAttribute('aria-hidden', 'true');
        return {
          dom,
          ignoreMutation: () => true,
          stopEvent: () => true,
          update(updatedNode) { return updatedNode.type === node.type; },
        };
      }

      const label = document.createElement('span');
      label.className = 'opaque-atom-label';
      label.textContent = `[ ${CATEGORY_LABELS[category] ?? '保留片段'} — 源码中查看 ]`;
      label.title = '此片段原样保留，请在 Source 模式查看或编辑其内容';
      dom.appendChild(label);

      const placeholder = document.createElement('span');
      placeholder.className = 'opaque-atom-placeholder';
      placeholder.textContent = '原样保留';
      dom.appendChild(placeholder);

      return {
        dom,
        ignoreMutation: () => true, // never let user edits mutate the atom
        stopEvent: (event: Event) =>
          event.type === 'mousedown' || event.type === 'dblclick', // selectable, not editable
        update(updatedNode) {
          // Only the slot/category are authored; a change in unsupported state
          // (e.g. deleted then recreated) is handled by the editor, not here.
          return updatedNode.type === node.type;
        },
        selectNode() {
          editor.commands.focus();
        },
        deselectNode() {},
      };
    };
  },
});
