// ── Adjacent same-type list runs (issue #391) ────────────────────────────
//
// Two adjacent lists of the same kind serialize to bytes CommonMark re-parses
// as ONE loose list: every bullet glyph normalizes to `- ` and the lists are
// only blank-line separated (`- a\n\n- b`). The admission round-trip proof
// rightly rejects that structural change, which fails the whole-document
// verification and degrades an otherwise convertible document to source-only.
//
// Before serializing, tag every run member after the first with a `listVariant`
// attr so its items render with a different list marker (`* ` / `1) ` /
// `* [ ]`), which re-parses as separate lists. The attr lives only on the JSON
// copy handed to the serializer — it never reaches disk and is not in the
// schema.

import type { JSONContent } from '@tiptap/core';

/** Attr key read by the variant list-item renderers (extensions/list-marker-variants.ts). */
export const LIST_VARIANT_ATTR = 'listVariant';

/** Adjacent runs of these node types are indistinguishable after serialization. */
const LIST_RUN_TYPES = new Set(['bulletList', 'orderedList', 'taskList']);

export function annotateAdjacentListRuns(doc: JSONContent): JSONContent {
  if (!doc.content) return doc;
  return { ...doc, content: annotateRuns(doc.content) };
}

function annotateRuns(nodes: JSONContent[]): JSONContent[] {
  const out: JSONContent[] = [];
  let runType: string | null = null;
  let runIndex = 0;
  for (const child of nodes) {
    const isList = child.type !== undefined && LIST_RUN_TYPES.has(child.type);
    if (isList && child.type === runType) {
      runIndex += 1;
    } else {
      runType = isList ? child.type! : null;
      runIndex = 0;
    }
    let annotated = child;
    // Alternating parity keeps every adjacent pair distinct for runs of any length.
    if (isList && runIndex % 2 === 1) {
      annotated = { ...child, attrs: { ...child.attrs, [LIST_VARIANT_ATTR]: 1 } };
    }
    if (annotated.content) {
      annotated = { ...annotated, content: annotateRuns(annotated.content) };
    }
    out.push(annotated);
  }
  return out;
}
