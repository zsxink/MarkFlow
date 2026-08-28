// Candidate A: CodeMirror Lezer markdown parser (+GFM) — the product's current
// local projection parser (losslessSourceEditor.ts:
// `markdown({ extensions: [GFM] })`).
//
// Native coordinate system: UTF-16 code units (JS string indices on the
// logical LF text — verified empirically by the coordinate probe in the test).
//
// This adapter is projection-oriented: it emits the constructs the Render IR
// would need (kind/sourceRange/contentRange/markerRanges). Marker ranges come
// straight from Lezer delimiter child nodes (HeaderMark, EmphasisMark,
// CodeMark, QuoteMark, ListMark, LinkMark, StrikethroughMark, TaskMarker,
// TableDelimiter) — Lezer is the only TS candidate with native delimiter nodes.
import { GFM } from '@lezer/markdown';
import { markdown } from '@codemirror/lang-markdown';
import type { SpikeConstruct, Range } from './validate';

// IMPORTANT: GFM must come from '@lezer/markdown'. '@codemirror/lang-markdown'
// does not re-export it, and configuring @lezer/markdown's own parser with
// `{ extensions: [GFM] }` silently ignores the extension — the product path
// (lang-markdown wrapper) is the only reliable configuration.
const parser = markdown({ extensions: [GFM] }).language.parser;

const MARKER_NODES = new Set([
  'HeaderMark', 'EmphasisMark', 'CodeMark', 'QuoteMark', 'ListMark',
  'LinkMark', 'ImageMark', 'TaskMarker', 'StrikethroughMark', 'TableDelimiter',
]);

// P4A 6.2 finding: a generic MARKER_NODES filter misattributes ANCESTOR
// continuation marks. E.g. for a ListItem inside a Blockquote, Lezer attaches
// the blockquote's continuation QuoteMark ("> " on the fenced-code lines) as a
// DIRECT child of the ListItem, so the untyped filter emitted it as a
// listItem marker — violating the marker-disjoint-content invariant and
// misattributing the delimiter to the wrong construct in the Render IR.
// Markers are therefore filtered by the delimiter types each construct kind
// actually owns. Two Lezer facts established while freezing this table:
//   - Image delimiters are LinkMark nodes ("![", "]", "(", ")") — there is no
//     ImageMark element in @lezer/markdown 1.7 (6.1's MARKER_NODES listed it
//     speculatively; the untyped filter matched because it accepted LinkMark).
//   - everything else uses the mark type named after its family.
// (Found by the 6.2 property tests; no 6.1 expectation changes — every
// non-null markers entry still matches.)
const KIND_OWN_MARKERS: Record<string, Set<string>> = {
  heading: new Set(['HeaderMark']),
  strong: new Set(['EmphasisMark']),
  emphasis: new Set(['EmphasisMark']),
  strikethrough: new Set(['StrikethroughMark']),
  inlineCode: new Set(['CodeMark']),
  link: new Set(['LinkMark']),
  image: new Set(['LinkMark']),
  blockquote: new Set(['QuoteMark']),
  listItem: new Set(['ListMark']),
  taskCheckbox: new Set(['TaskMarker']),
  fence: new Set(['CodeMark']),
};

interface Kid {
  name: string;
  from: number;
  to: number;
}

interface Emit {
  kind: string;
  level?: number;
  meta?: Record<string, unknown>;
  descend: boolean;
  content: (node: { from: number; to: number }, kids: Kid[]) => Range | null;
}

const fullRange = (node: { from: number; to: number }): Range => [node.from, node.to];

/** Content between the first and last delimiter mark (inline emphasis family). */
function betweenOuterMarks(node: { from: number; to: number }, kids: Kid[]): Range | null {
  const marks = kids.filter((k) => MARKER_NODES.has(k.name));
  if (marks.length < 2) return null;
  return [marks[0].to, marks[marks.length - 1].from];
}

/** Content between the first and second mark (link/image label). */
function labelBetweenFirstTwoMarks(node: { from: number; to: number }, kids: Kid[]): Range | null {
  const marks = kids.filter((k) => MARKER_NODES.has(k.name));
  if (marks.length < 2) return null;
  return [marks[0].to, marks[1].from];
}

/** Content after the first mark up to the node end (heading / list item). */
function afterFirstMark(node: { from: number; to: number }, kids: Kid[]): Range | null {
  const marks = kids.filter((k) => MARKER_NODES.has(k.name));
  if (marks.length === 0) return null;
  return [marks[0].to, node.to];
}

/**
 * Content = union of non-delimiter children (heading/listItem/blockquote/task).
 * Covers multi-line blocks whose later lines carry their own leading marks
 * (e.g. a blockquote's second line `>> x`: the outer `>` is a direct child).
 * Falls back to afterFirstMark when all children are delimiter nodes
 * (e.g. ATXHeading has no explicit child node for its text).
 */
function unionOfNonMarkChildren(node: { from: number; to: number }, kids: Kid[]): Range | null {
  const content = kids.filter((k) => !MARKER_NODES.has(k.name));
  if (content.length === 0) return afterFirstMark(node, kids);
  return [content[0].from, content[content.length - 1].to];
}

function fencedContent(node: { from: number; to: number }, kids: Kid[]): Range | null {
  const codeText = kids.filter((k) => k.name === 'CodeText');
  if (codeText.length === 0) return null;
  return [codeText[0].from, codeText[codeText.length - 1].to];
}

const EMIT: Record<string, Emit> = {
  ATXHeading: { kind: 'heading', descend: true, content: unionOfNonMarkChildren },
  SetextHeading: { kind: 'heading', descend: true, content: unionOfNonMarkChildren },
  StrongEmphasis: { kind: 'strong', descend: true, content: betweenOuterMarks },
  Emphasis: { kind: 'emphasis', descend: true, content: betweenOuterMarks },
  Strikethrough: { kind: 'strikethrough', descend: true, content: betweenOuterMarks },
  InlineCode: { kind: 'inlineCode', descend: true, content: betweenOuterMarks },
  Link: { kind: 'link', descend: true, content: labelBetweenFirstTwoMarks },
  Autolink: { kind: 'link', descend: true, content: betweenOuterMarks, meta: { style: 'autolink' } },
  Image: { kind: 'image', descend: true, content: labelBetweenFirstTwoMarks },
  Blockquote: { kind: 'blockquote', descend: true, content: unionOfNonMarkChildren },
  BulletList: { kind: 'list', descend: true, content: fullRange, meta: { ordered: false } },
  OrderedList: { kind: 'list', descend: true, content: fullRange, meta: { ordered: true } },
  ListItem: { kind: 'listItem', descend: true, content: unionOfNonMarkChildren },
  FencedCode: { kind: 'fence', descend: false, content: fencedContent },
  CodeBlock: { kind: 'indentedCode', descend: false, content: fullRange },
  Paragraph: { kind: 'paragraph', descend: true, content: fullRange },
  Table: { kind: 'table', descend: true, content: fullRange },
  TableHeader: { kind: 'tableHeader', descend: true, content: fullRange },
  TableRow: { kind: 'tableRow', descend: true, content: fullRange },
  TableCell: { kind: 'tableCell', descend: true, content: fullRange },
  HTMLBlock: { kind: 'htmlBlock', descend: false, content: fullRange },
  CommentBlock: { kind: 'htmlComment', descend: false, content: fullRange },
  HTMLTag: { kind: 'htmlInline', descend: false, content: fullRange },
  HorizontalRule: { kind: 'hr', descend: false, content: fullRange },
  LinkReference: { kind: 'linkRefDef', descend: false, content: fullRange },
  Escape: { kind: 'escape', descend: false, content: fullRange },
  Task: { kind: 'taskCheckbox', descend: true, content: unionOfNonMarkChildren },
};

function levelOf(name: string): number | undefined {
  const m = name.match(/^(?:ATXHeading|SetextHeading)(\d)$/);
  return m ? Number(m[1]) : undefined;
}

export interface LezerParseResult {
  constructs: SpikeConstruct[];
  /** total UTF-16 length of the parsed tree (=== doc length for a full parse) */
  treeLength: number;
  threw: false;
}

export interface LezerParseError {
  constructs: [];
  treeLength?: never;
  threw: true;
  error: string;
}

export function parseWithLezer(text: string): LezerParseResult | LezerParseError {
  try {
    const tree = parser.parse(text);
    const constructs: SpikeConstruct[] = [];
    tree.iterate({
      enter(node) {
        if (node.from === node.to) return true;
        let name = node.name;
        // ATXHeading1..6 / SetextHeading1..2 — normalize to the family key.
        const family = name.replace(/\d$/, '');
        const emit = EMIT[family] ?? EMIT[name];
        if (!emit) return true;
        const kids: Kid[] = [];
        for (let c = node.node.firstChild; c; c = c.nextSibling) {
          kids.push({ name: c.name, from: c.from, to: c.to });
        }
        const content = emit.content({ from: node.from, to: node.to }, kids);
        const ownMarkers = KIND_OWN_MARKERS[emit.kind];
        constructs.push({
          kind: emit.kind,
          level: emit.kind === 'heading' ? levelOf(name) : undefined,
          meta: { lezerNode: name, ...(emit.meta ?? {}) },
          sourceRange: [node.from, node.to],
          contentRange: content,
          markerRanges: kids
            .filter((k) => MARKER_NODES.has(k.name) && (!ownMarkers || ownMarkers.has(k.name)))
            .map((k): Range => [k.from, k.to]),
        });
        return emit.descend;
      },
    });
    return { constructs, treeLength: tree.length, threw: false };
  } catch (e) {
    return { constructs: [], threw: true, error: String(e) };
  }
}

/** Empirical coordinate probe: distinguishes UTF-16 code units from UTF-8
 *  bytes and from code points using an astral-plane char. */
export function coordinateProbe(): { probe: string; headingTo: number; utf16Length: number; utf8Length: number; codePointLength: number; verdict: string } {
  const probe = '# \u{1F600}'; // "# 😀"
  const tree = parser.parse(probe);
  let headingTo = -1;
  tree.iterate({
    enter(node) {
      if (node.name === 'ATXHeading1') headingTo = node.to;
      return true;
    },
  });
  const utf16Length = probe.length; // 4 ('#' + ' ' + surrogate pair)
  const utf8Length = Buffer.byteLength(probe, 'utf8'); // 6 (emoji = 4 UTF-8 bytes)
  const codePointLength = [...probe].length; // 3
  const verdict =
    headingTo === utf16Length
      ? 'utf16-code-units (CONFIRMED)'
      : headingTo === utf8Length
        ? 'utf8-bytes (MISMATCH with declaration!)'
        : headingTo === codePointLength
          ? 'unicode-code-points (MISMATCH with declaration!)'
          : `unexpected (${headingTo})`;
  return { probe, headingTo, utf16Length, utf8Length, codePointLength, verdict };
}
