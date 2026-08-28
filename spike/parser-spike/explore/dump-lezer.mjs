// Exploration dump: parse every fixture with CodeMirror Lezer (+GFM) and print
// every construct with its source/content/marker spans so the frozen
// expectations.json reference table can be eyeball-verified against the known
// fixture structure before being used as the shared yardstick for ALL
// candidates (TS + Rust).
//
// Usage: node spike/parser-spike/explore/dump-lezer.mjs
import { GFM } from '@lezer/markdown';
import { markdown } from '@codemirror/lang-markdown';
import { loadFixtures } from '../lib/fixtures.mjs';

// The exact product parser path (losslessSourceEditor.ts):
// `markdown({ extensions: [GFM] })` from @codemirror/lang-markdown.
// NOTE: `baseParser.configure({ extensions: [GFM] })` on @lezer/markdown's
// own parser SILENTLY IGNORES the extension (verified 2026-08-29: tables/tasks
// do not appear) — always go through the lang-markdown wrapper.
const parser = markdown({ extensions: [GFM] }).language.parser;

// Names treated as delimiter/marker nodes (superset of projection.ts's
// `endsWith('Mark')` heuristic — the dump shows what actually exists).
const MARKER_NAMES = new Set([
  'HeaderMark', 'EmphasisMark', 'CodeMark', 'QuoteMark', 'ListMark',
  'LinkMark', 'ImageMark', 'Fence', 'FencedCodeMark', 'TaskMarker',
  'StrikethroughMark', 'TableDelimiter', 'HTMLMark', 'HorizontalRule',
]);

const KIND_BY_NODE = {
  ATXHeading: 'heading', SetextHeading: 'heading',
  StrongEmphasis: 'strong', Emphasis: 'emphasis', Strikethrough: 'strikethrough',
  InlineCode: 'inlineCode', Link: 'link', Image: 'image', URL: 'link-url',
  Blockquote: 'blockquote', BulletList: 'list', OrderedList: 'list',
  ListItem: 'listItem', FencedCode: 'fence', CodeBlock: 'indentedCode',
  Paragraph: 'paragraph', Table: 'table', TableHeader: 'tableHeader',
  TableRow: 'tableRow', TableCell: 'tableCell', HTMLBlock: 'htmlBlock',
  HTMLTag: 'htmlInline', Comment: 'htmlComment', Task: 'taskCheckbox',
  Footnote: 'footnote', LinkReference: 'linkRefDef',
};

function levelOf(name) {
  const m = name.match(/^(?:ATXHeading|SetextHeading)(\d)$/);
  return m ? Number(m[1]) : undefined;
}

function dumpTree(text) {
  const tree = parser.parse(text);
  const constructs = [];
  const markerSpans = [];
  tree.iterate({
    enter(node) {
      if (MARKER_NAMES.has(node.name)) {
        markerSpans.push({ name: node.name, from: node.from, to: node.to, slice: text.slice(node.from, node.to) });
        return true;
      }
      const kind = Object.entries(KIND_BY_NODE).find(([prefix]) => node.name.startsWith(prefix));
      if (kind) {
        constructs.push({
          node: node.name,
          kind: kind[1],
          level: levelOf(node.name),
          from: node.from,
          to: node.to,
          slice: text.slice(node.from, node.to),
        });
      }
      // Do not descend into fenced code — content is not Markdown.
      if (node.name === 'FencedCode') return false;
      return true;
    },
  });
  return { constructs, markerSpans };
}

const fixtures = await loadFixtures();
const report = [];
for (const fx of fixtures) {
  let tree = null;
  let error = null;
  try {
    tree = dumpTree(fx.logicalText);
  } catch (e) {
    error = String(e);
  }
  report.push({
    id: fx.id,
    logicalLength: fx.logicalLength,
    logicalText: fx.logicalText.length <= 400 ? fx.logicalText : `${fx.logicalText.slice(0, 400)}…`,
    error,
    ...tree,
  });
}
console.log(JSON.stringify(report, null, 1));
