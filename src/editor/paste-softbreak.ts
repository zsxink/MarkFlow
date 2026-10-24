import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Fragment, Slice } from '@tiptap/pm/model';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';

// ── Paste soft-break normalization ───────────────────────────────────────

export const softBreakPasteKey = new PluginKey('softBreakPasteNormalize');

/**
 * Split `\n` inside pasted plain-text runs into `hardBreak{soft:true}` nodes.
 *
 * ProseMirror's plain-text clipboard parser keeps in-paragraph newlines
 * embedded in text nodes. That representation is byte-lossless on serialize
 * but collapses visually (CSS whitespace folding) and diverges from what the
 * markdown parse path produces. Normalizing at the paste boundary keeps both
 * paths consistent; already-split content contains no `\n` and passes through
 * untouched (idempotent).
 *
 * Left as-is: inline-code runs (their `\n` is literal source), code blocks
 * (`node.type.spec.code` — content is raw source text), and atom nodes
 * (RawMarkdown/Opaque — leaves with no text content).
 */
function normalizeFragment(fragment: Fragment, schema: Schema): Fragment {
  const hardBreak = schema.nodes.hardBreak;
  const out: PMNode[] = [];
  let changed = false;
  for (let i = 0; i < fragment.childCount; i++) {
    const child = fragment.child(i);
    if (
      child.isText && child.text?.includes('\n') && hardBreak
      && !child.marks.some((m) => m.type.name === 'code')
    ) {
      changed = true;
      const lines = child.text.split('\n');
      lines.forEach((line, index) => {
        if (index > 0) out.push(hardBreak.create({ soft: true }));
        if (line) out.push(schema.text(line, child.marks));
      });
      continue;
    }
    if (child.content.size > 0 && !child.type.spec.code) {
      const inner = normalizeFragment(child.content, schema);
      if (inner !== child.content) {
        changed = true;
        out.push(child.copy(inner));
        continue;
      }
    }
    out.push(child);
  }
  return changed ? Fragment.fromArray(out) : fragment;
}

/** Paste-normalization companion to `SafeHardBreak` (see `hard-break.ts`). */
export function softBreakPastePlugin(): Extension {
  return Extension.create({
    name: 'softBreakPasteNormalize',
    addProseMirrorPlugins() {
      const schema = this.editor.schema;
      return [
        new Plugin({
          key: softBreakPasteKey,
          props: {
            transformPasted: (slice) => {
              const content = normalizeFragment(slice.content, schema);
              return content === slice.content ? slice : new Slice(content, slice.openStart, slice.openEnd);
            },
          },
        }),
      ];
    },
  });
}
