import { Node, type Editor, type JSONContent } from '@tiptap/core';
import { Marked } from 'marked';
import { classifyEligibility } from './editor.markdown.eligibility';
import { semanticFingerprint } from './editor.markdown.fingerprint';
import { scanCodeRegions } from './editor.markdown.opaque';
import { parseTipTapMarkdownToDoc } from './editor.markdown.adapter';

export const RAW_MARKDOWN_NODE = 'markflowRawMarkdown';

/** A literal, local fallback. HTML is always rendered as text, never executed. */
export const RawMarkdown = Node.create({
  name: RAW_MARKDOWN_NODE,
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() { return { source: { default: '', rendered: false, parseHTML: (element) => element.textContent ?? '' } }; },
  parseHTML() { return [{ tag: 'pre[data-markflow-raw]', priority: 1000 }]; },
  renderHTML({ node }) {
    return ['pre', {
      'data-markflow-raw': '',
      class: 'markflow-raw-markdown',
      style: 'white-space:pre-wrap;overflow-wrap:anywhere',
    }, String(node.attrs.source)];
  },
  renderMarkdown(node: JSONContent) { return String(node.attrs?.source ?? ''); },
  renderText({ node }) { return String(node.attrs.source); },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node;
      const dom = document.createElement('div');
      const pre = document.createElement('pre');
      pre.dataset.markflowRaw = '';
      pre.className = 'markflow-raw-markdown';
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.overflowWrap = 'anywhere';
      pre.textContent = String(node.attrs.source);
      pre.title = '双击编辑此保留片段';
      const input = document.createElement('textarea');
      input.hidden = true;
      input.setAttribute('aria-label', '编辑保留的 Markdown 片段');
      input.style.width = '100%';
      dom.append(pre, input);
      pre.addEventListener('dblclick', (event) => {
        if (!editor.isEditable) return;
        event.preventDefault();
        input.value = String(current.attrs.source);
        input.hidden = false;
        pre.hidden = true;
        input.focus();
      });
      input.addEventListener('input', () => {
        if (!editor.isEditable) return;
        const pos = getPos();
        if (typeof pos !== 'number') return;
        if (input.value.length === 0) {
          editor.view.dispatch(editor.state.tr.delete(pos, pos + current.nodeSize));
          editor.commands.focus();
          return;
        }
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, source: input.value }));
      });
      input.addEventListener('blur', () => { input.hidden = true; pre.hidden = false; });
      return {
        dom,
        stopEvent: (event) => event.target === input || event.type === 'dblclick',
        ignoreMutation: () => true,
        update(next) {
          if (next.type !== current.type) return false;
          current = next;
          pre.textContent = String(next.attrs.source);
          if (input.value !== String(next.attrs.source)) input.value = String(next.attrs.source);
          return true;
        },
      };
    };
  },
});

const lexer = new Marked({ gfm: true, breaks: false });
function rawNode(source: string): JSONContent {
  return { type: RAW_MARKDOWN_NODE, attrs: { source } };
}

export function containsRawMarkdown(doc: JSONContent): boolean {
  return doc.type === RAW_MARKDOWN_NODE || Boolean(doc.content?.some(containsRawMarkdown));
}

/** Every literal payload the document holds, in document order. */
export function rawMarkdownSources(doc: JSONContent): string[] {
  const out: string[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === RAW_MARKDOWN_NODE) out.push(String(node.attrs?.source ?? ''));
    node.content?.forEach(walk);
  };
  walk(doc);
  return out;
}

/**
 * Check that a save candidate delimits every literal payload the way the
 * document holds it. `serializeLocalizedMarkdown` splices payloads back into
 * bytes the Markdown renderer produced, and the marker-form proof cannot see
 * what that splice did to them — so the candidate itself is measured here. A
 * payload that ends with a newline must not be followed by another one: the
 * literal syntax re-absorbs it on reopen and silently inflates the block
 * (issue #291).
 */
export function verifyRawMarkdownSplice(candidate: string, sources: string[]): boolean {
  const codeRegions = scanCodeRegions(candidate).regions;
  let cursor = 0;
  for (const raw of sources) {
    if (!raw) continue;
    // A payload may itself look like a fence (a literal block can hold an
    // unclosed one), which the code-region guard rejects as an example. When
    // the guarded search finds nothing, the payload is matched at its own line
    // start instead.
    let start = findRawBlock(candidate, raw, cursor, codeRegions);
    if (start < 0) {
      start = candidate.indexOf(raw, cursor);
      while (start > 0 && candidate[start - 1] !== '\n') start = candidate.indexOf(raw, start + 1);
    }
    if (start < 0) return false;
    const end = start + raw.length;
    if (raw.endsWith('\n') && candidate[end] === '\n') return false;
    cursor = end;
  }
  return true;
}

/** Locate a complete literal block without matching code examples inside fences. */
function findRawBlock(source: string, raw: string, cursor: number, regions: Array<{ from: number; to: number }>): number {
  let start = source.indexOf(raw, cursor);
  while (start >= 0 && (regions.some(region => region.from <= start && region.to >= start + raw.length
    && !(region.from === start && source.slice(start + raw.length, region.to).trim() === ''))
    || (start > 0 && source[start - 1] !== '\n')
    || (start + raw.length < source.length && !raw.endsWith('\n') && source[start + raw.length] !== '\n'))) {
    start = source.indexOf(raw, start + 1);
  }
  return start;
}

/**
 * Give each raw block a unique temporary spelling while serializing/proving
 * the document. Literal syntax cannot consume neighboring rich blocks or be
 * confused with the same characters in a code example. Markers never reach
 * the saved Markdown: restoration uses their exact serialized positions.
 */
export function serializeLocalizedMarkdown(editor: Editor): { markdown: string; verificationDoc: JSONContent } {
  const doc = editor.getJSON();
  const authored = JSON.stringify(doc);
  let prefix: string;
  do {
    const nonce = Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('');
    prefix = 'MARKFLOWRAW' + nonce + 'SLOT';
  }
  while (authored.includes(prefix));
  const sources = new Map<string, string>();
  function tag(node: JSONContent): JSONContent {
    if (node.type === RAW_MARKDOWN_NODE) {
      const marker = prefix + sources.size + 'END';
      sources.set(marker, String(node.attrs?.source ?? ''));
      return { ...node, attrs: { ...node.attrs, source: marker } };
    }
    return node.content ? { ...node, content: node.content.map(tag) } : node;
  }
  const manager = (editor as unknown as { markdown: { serialize(doc: JSONContent): string } }).markdown;
  const serialized = manager.serialize(tag(doc));
  const verificationDoc = parseLocalizedMarkdown(editor, serialized, [...sources.keys()]);
  function restoreNode(node: JSONContent): JSONContent {
    if (node.type === RAW_MARKDOWN_NODE && sources.has(String(node.attrs?.source))) {
      return { ...node, attrs: { ...node.attrs, source: sources.get(String(node.attrs?.source)) } };
    }
    return node.content ? { ...node, content: node.content.map(restoreNode) } : node;
  }
  let cursor = 0;
  let markdown = '';
  for (const [marker, raw] of sources) {
    const start = serialized.indexOf(marker, cursor);
    if (start < 0 || serialized.indexOf(marker, start + marker.length) >= 0) throw new Error('raw-marker-integrity');
    const end = start + marker.length;
    markdown += serialized.slice(cursor, start) + raw;
    const following = serialized.slice(end);
    // The payload already carries the authored separator: Marked's token gaps
    // and the preserved spans both run right up to the next block. The
    // renderer's own blank-line separator is dropped instead of trimmed — a
    // leftover newline is re-absorbed by the literal syntax on reopen and
    // silently inflates the payload (issue #291). One newline is kept only
    // when the payload has none of its own and blocks must stay separated.
    const leading = following.match(/^\n*/)?.[0] ?? '';
    const keep = leading.length > 0 && !raw.endsWith('\n') ? 1 : 0;
    cursor = end + leading.length - keep;
  }
  markdown += serialized.slice(cursor);
  if (markdown.includes(prefix)) throw new Error('raw-marker-left');
  return { markdown, verificationDoc: restoreNode(verificationDoc) };
}

/**
 * Parse independently delimited Marked blocks. Only a block that cannot be
 * represented losslessly becomes literal text; headings, lists, tables and
 * fenced code around it continue to use their normal MarkFlow extensions.
 * This is also the NON-mutating verification path for fallback sessions.
 */
export function parseLocalizedMarkdown(
  editor: Editor,
  source: string,
  preserved: string[] = [],
): JSONContent {
  const manager = (editor as unknown as { markdown: { serialize(doc: JSONContent): string } }).markdown;
  const content: JSONContent[] = [];

  function parseBlocks(part: string) {
    // Marked normalizes CRLF before lexing. Retain the mapping so literal
    // fallback payloads still contain the actual authored characters.
    const offsets: number[] = [];
    let normalized = '';
    for (let i = 0; i < part.length; i += 1) {
      offsets.push(i);
      if (part[i] === '\r' && part[i + 1] === '\n') i += 1;
      normalized += part[i];
    }
    offsets.push(part.length);
    let cursor = 0;
    let separators = 0;
    const flushSeparators = () => {
      const count = Math.max(Math.floor(separators / 2) - 1, 0);
      for (let i = 0; i < count; i += 1) content.push({ type: 'paragraph' });
      separators = 0;
    };
    let tokens;
    try { tokens = lexer.lexer(normalized); } catch { content.push(rawNode(part)); return; }
    for (const token of tokens) {
      const start = normalized.indexOf(token.raw, cursor);
      if (start < 0) { content.push(rawNode(part.slice(offsets[cursor]))); return; }
      const gap = part.slice(offsets[cursor], offsets[start]);
      // Marked omits reference definitions from its token stream. They are
      // authored text too, so gaps containing text become local raw blocks.
      if (gap.trim()) content.push(rawNode(gap));
      cursor = start + token.raw.length;
      if (token.type === 'space') { separators += (token.raw.match(/\n/g) ?? []).length; continue; }
      flushSeparators();
      const raw = part.slice(offsets[start], offsets[cursor]);
      const eligibility = classifyEligibility(raw);
      const parsed = eligibility.verdict === 'eligible'
        ? parseTipTapMarkdownToDoc(editor, raw.replace(/(?:\r?\n)+$/, '')) : null;
      let safe = false;
      if (parsed?.ok) {
        try {
          const rendered = manager.serialize(parsed.doc);
          const roundtrip = parseTipTapMarkdownToDoc(editor, rendered);
          safe = roundtrip.ok && semanticFingerprint(roundtrip.doc) === semanticFingerprint(parsed.doc);
        } catch { /* This block is retained literally below. */ }
      }
      if (safe && parsed?.ok) {
        content.push(...(parsed.doc.content ?? []));
        separators = (raw.match(/(?:\r?\n)+$/)?.[0].match(/\n/g) ?? []).length;
      } else content.push(rawNode(raw));
    }
    flushSeparators();
    const tail = part.slice(offsets[cursor]);
    if (tail.trim()) content.push(rawNode(tail));
  }

  // Raw atoms are intentionally literal even if their spelling would parse
  // successfully in isolation. Match them in source order for the save proof.
  const codeRegions = scanCodeRegions(source).regions;
  let cursor = 0;
  for (const raw of preserved) {
    if (!raw) continue;
    const start = findRawBlock(source, raw, cursor, codeRegions);
    if (start < 0) continue;
    parseBlocks(source.slice(cursor, start));
    content.push(rawNode(raw));
    cursor = start + raw.length;
  }
  parseBlocks(source.slice(cursor));
  // StarterKit's trailingNode appends a continuation paragraph after block
  // atoms, headings, tables and lists. Mirror that NON-mutatingly for proof.
  if (content.length === 0 || content[content.length - 1]?.type !== 'paragraph') content.push({ type: 'paragraph' });
  return { type: 'doc', content };
}
