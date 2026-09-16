import type { Editor, JSONContent } from '@tiptap/core';
import type {
  MarkdownConversionError,
  MarkdownParseResult,
  MarkdownSerializeResult,
} from './editor.markdown.types';

/**
 * The only TipTap-specific Markdown boundary.  v3 is authoritative: the
 * `@tiptap/markdown` extension surfaces a single `editor.getMarkdown()`
 * command.  The v2 `storage.markdown` branch was removed once the dependency
 * migration pinned every `@tiptap/*` package to one v3 patch.
 */
type MarkdownCapableEditor = Editor & {
  getMarkdown?: () => string;
};

/**
 * Every node/mark type the v3 adapters can serialize.  The list mirrors the
 * extensions registered in `initEditor` (plus `table` internals which the
 * table renderMarkdown handles).  Anything else in the document is a
 * conversion error: the serializer would otherwise emit an empty string and
 * silently drop the content.
 */
export const MARKFLOW_SERIALIZABLE_TYPES: ReadonlySet<string> = new Set([
  // block nodes
  'doc',
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'codeBlock',
  'horizontalRule',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'image',
  // opaque atom (sentinel-serialized by its own markdownTokenName)
  'markflowOpaque',
  // inline nodes
  'hardBreak',
  'text',
  // marks
  'bold',
  'italic',
  'strike',
  'underline',
  'code',
  'link',
]);

function error(stage: MarkdownConversionError['stage'], code: string, cause: unknown, extra: MarkdownConversionError['details'] = {}): MarkdownConversionError {
  return {
    stage,
    code,
    details: {
      ...(cause instanceof Error ? { cause: cause.name.slice(0, 80) } : { cause: typeof cause }),
      ...extra,
    },
  };
}

/**
 * Recursively walk the serialized JSON and detect a node or mark whose type
 * the Markdown renderers cannot handle.  Returns an error when one is found;
 * the given range points at the offending node so diagnostics stay bounded.
 */
function findUnserializableType(doc: JSONContent): MarkdownConversionError | null {
  function walk(node: JSONContent, from: number, to: number): MarkdownConversionError | null {
    const local = node;
    if (local.type && local.type !== 'text' && !MARKFLOW_SERIALIZABLE_TYPES.has(local.type)) {
      return { stage: 'serialize', code: 'unknown-node-type', range: { from, to }, details: { nodeType: local.type.slice(0, 48) } };
    }
    for (const mark of local.marks ?? []) {
      if (!MARKFLOW_SERIALIZABLE_TYPES.has(mark.type)) {
        return { stage: 'serialize', code: 'unknown-mark-type', range: { from, to }, details: { markType: mark.type.slice(0, 48) } };
      }
    }
    let offset = from;
    for (const child of local.content ?? []) {
      const err = walk(child, offset, offset + childSize(child));
      if (err) return err;
      offset += childSize(child);
    }
    return null;
  }
  return walk(doc, 0, childSize(doc));
}

function childSize(node: JSONContent): number {
  const text = (node as { text?: unknown }).text;
  if (typeof text === 'string') return text.length;
  return 1;
}

export function serializeTipTapMarkdown(editor: Editor): MarkdownSerializeResult {
  try {
    const markdownEditor = editor as MarkdownCapableEditor;

    // @tiptap/markdown v3 exposes this API on the editor directly.  The v2
    // `storage.markdown` fallback no longer exists on the pinned v3 package set.
    const getMarkdown = markdownEditor.getMarkdown;
    if (typeof getMarkdown !== 'function') {
      return { ok: false, error: { stage: 'serialize', code: 'markdown-api-unavailable' } };
    }

    // The v3 Markdown renderer emits an empty string for a node type it has no
    // handler for.  Detect those types upfront so a partial/failed conversion
    // is never treated as a successful save candidate.
    const json = editor.getJSON() as JSONContent;
    const unknown = findUnserializableType(json);
    if (unknown) return { ok: false, error: unknown };

    return { ok: true, markdown: getMarkdown.call(markdownEditor) };
  } catch (cause) {
    return { ok: false, error: error('serialize', 'markdown-serialize-failed', cause) };
  }
}

export function parseTipTapMarkdown(editor: Editor, source: string): MarkdownParseResult {
  try {
    // The v3 Markdown content type prevents Markdown being interpreted as HTML.
// The `setContent` load is a programmatic (non-user) transaction: it must
    // never enter the undo/redo stack. Otherwise the first Cmd+Z after opening
    // a document reverts the whole load to an empty doc, which the reconcile
    // boundary then reports as a semantic-mismatch conflict ("文件已被修改" /
    // "未保存的更改"). Stamp every doc-changing transaction during the parse
    // with `addToHistory:false` so admission/load stays non-undoable while the
    // user's own real edits remain fully undoable.
    //
    // Loading/admission is also not a user edit from TipTap v3's perspective:
    // `setContent` emits `onUpdate` by default, which can schedule a delayed
    // dirty-check after the programmatic guard has ended and make a freshly
    // opened file look edited. Pass `emitUpdate:false` so the load neither
    // pollutes undo history nor flags the document as dirty.
    const view = (editor as unknown as { view?: { dispatch(tr: unknown): void } }).view;
    if (view) {
      const originalDispatch = view.dispatch.bind(view);
      view.dispatch = (tr: any) => {
        if (tr && tr.docChanged) tr = tr.setMeta('addToHistory', false);
        originalDispatch(tr);
      };
      try {
        editor.commands.setContent(source, { contentType: 'markdown', emitUpdate: false } as never);
      } finally {
        view.dispatch = originalDispatch;
      }
    } else {
      // Mock/harness editors without a real view skip the history guard but
      // still suppress onUpdate.
      editor.commands.setContent(source, { contentType: 'markdown', emitUpdate: false } as never);
    }
    return { ok: true, doc: editor.getJSON() as JSONContent, markdown: source };
  } catch (cause) {
    return { ok: false, source, error: error('parse', 'markdown-parse-failed', cause) };
  }
}

/**
 * Parse `source` into a JSON document WITHOUT mutating the editor (no
 * `setContent`). Used at the reconcile/save boundary where fingerprinting a
 * candidate must not clobber the live document.
 */
export function parseTipTapMarkdownToDoc(
  editor: Editor,
  source: string,
): { ok: true; doc: JSONContent } | { ok: false; source: string; error: MarkdownConversionError } {
  try {
    const manager = (editor as unknown as { markdown?: { parse?(md: string): JSONContent } }).markdown;
    if (!manager?.parse) {
      return { ok: false, source, error: error('parse', 'markdown-api-unavailable', {}) };
    }
    return { ok: true, doc: manager.parse(source) };
  } catch (cause) {
    return { ok: false, source, error: error('parse', 'markdown-parse-failed', cause) };
  }
}
