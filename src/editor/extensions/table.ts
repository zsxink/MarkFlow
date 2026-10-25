import type { JSONContent, MarkdownRendererHelpers, MarkdownTokenizer } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { InputRule } from '@tiptap/core';
import { Table } from '@tiptap/extension-table';

// ── Block Image extension ──────────────────────────────────────────────

function escapeTableCellPipes(value: string): string {
  let escaped = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== '|') {
      escaped += character;
      continue;
    }

    let precedingBackslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
      precedingBackslashes += 1;
    }
    escaped += precedingBackslashes % 2 === 0 ? '\\|' : '|';
  }
  return escaped;
}

/**
 * Split a single GFM table line into its trimmed cell texts, honoring escaped
 * pipes (`\|`) and pipe-separated content only (backticks are treated
 * conservatively: a code-span pipe still splits). Returns null when the line
 * carries no pipe so a plain paragraph is never treated as a table row.
 */
export function splitTableLine(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return null;

  const hasLeadingPipe = trimmed.startsWith('|');
  const hasTrailingPipe = trimmed.endsWith('|');
  const from = hasLeadingPipe ? 1 : 0;
  const to = hasTrailingPipe ? trimmed.length - 1 : trimmed.length;
  const cells: string[] = [];
  let cellStart = from;
  for (let i = from; i < to; i += 1) {
    if (trimmed[i] === '\\') {
      i = Math.min(to, i + 1);
      continue;
    }
    if (trimmed[i] === '|') {
      cells.push(trimmed.slice(cellStart, i).trim());
      cellStart = i + 1;
    }
  }
  cells.push(trimmed.slice(cellStart, to).trim());
  return cells;
}

/** True when every cell is a GFM alignment marker (`:---`, `:---:`, `---:`). */
function isDelimiterRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

/**
 * Parse a «header line + delimiter row (+ optional data rows)» GFM sequence
 * into column count, header cells and data-row texts. Returns null for any
 * malformed shape: a data row whose column count differs from the delimiter
 * (or header) is rejected, so prose containing stray pipes never converts.
 */
export function parseTableInput(source: string): { columns: number; header: string[]; rows: string[][] } | null {
  const lines = source.replace(/\n+$/, '').split('\n');
  if (lines.length < 2) return null;

  const header = splitTableLine(lines[0]);
  const delimiter = splitTableLine(lines[1]);
  if (!header || !delimiter) return null;
  if (header.length !== delimiter.length) return null;
  if (!isDelimiterRow(delimiter)) return null;

  const columns = header.length;
  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i += 1) {
    const row = splitTableLine(lines[i]);
    if (!row || row.length !== columns) return null;
    rows.push(row);
  }
  return { columns, header, rows };
}

/**
 * Build a GFM table node from parsed row texts: one header row (tableHeader
 * cells) + at least one data row (tableCell cells). When the user typed only
 * header + delimiter (rows is empty) we synthesise one empty data row so the
 * cursor lands in a usable cell. Every cell wraps its authored text in a
 * paragraph to satisfy the `block+` cell content spec.
 */
function buildTableNode(schema: { nodes: Record<string, any> }, parsed: { columns: number; header: string[]; rows: string[][] }): PMNode | null {
  const { table, tableRow, tableHeader, tableCell, paragraph } = schema.nodes;

  const schemaAny = schema as any;
  const createRow = (texts: string[], header: boolean) => {
    const type = header ? tableHeader : tableCell;
    const cells = texts.map(cellText =>
      type.createAndFill(null, [paragraph.create(null, cellText ? [schemaAny.text(cellText)] : [])]),
    );
    return tableRow.createChecked(null, cells);
  };

  return table.createChecked(null, [
    createRow(parsed.header, true),
    createRow(parsed.rows[0] ?? Array.from({ length: parsed.columns }, () => ''), false),
  ]);
}

/**
 * TipTap 3.30.5 serializes a literal pipe in a table cell without escaping it.
 * On the next parse Marked treats that pipe as a column separator. Keep the
 * upstream table schema and commands, but make its Markdown renderer lossless.
 *
 * The upstream `markdownTokenizer.start` (`extension-table` src) inspects only
 * the first two lines yet implements that with `src.split('\n')` over the
 * WHOLE remaining source. Marked calls every block tokenizer's `start` at each
 * block boundary, so that split is an O(remaining) allocation per block — the
 * dominant O(n²) term on fragmented documents (#411; measured 22s for 1.9MB
 * with all other tokenizers already bounded). The override below reuses the
 * upstream `tokenize` (pipe preprocessing) verbatim and only replaces `start`
 * with a scan that stops at the second newline — same header/separator
 * verdict, linear total cost.
 */
const upstreamTableTokenizer = (Table as unknown as {
  config: { markdownTokenizer: MarkdownTokenizer };
}).config.markdownTokenizer;

function tableStart(src: string): number {
  const firstNl = src.indexOf('\n');
  if (firstNl === -1) return -1;
  const secondNl = src.indexOf('\n', firstNl + 1);
  const separator = src.slice(firstNl + 1, secondNl === -1 ? src.length : secondNl);
  if (!/^[ \t|:]*-[ \t|:-]*$/.test(separator) || !separator.includes('|')) return -1;
  return src.slice(0, firstNl).includes('|') ? 0 : -1;
}

export const MarkdownSafeTable = Table.extend({
  markdownTokenizer: {
    ...upstreamTableTokenizer,
    start: tableStart,
  },
  addInputRules() {
    return [
      new InputRule({
        // Fires when the user finishes a GFM table sequence in WYSIWYG mode:
        //   | a | b |           header line
        //   | --- | --- |       delimiter row
        //   [| 1 | 2 |]         optional data rows
        // then presses Enter at the end of the final line. Enter presses pass
        // `text === "\n"` through the input-rules plugin, so a match anchored
        // to a trailing newline never fires mid-line while the user is still
        // typing a `|`. The plugin's match text is limited to the CURRENT
        // textblock (`getTextContentFromNodes`), so the handler walks sibling
        // paragraphs backward to reassemble the header/delimiter/data sequence
        // split across real (already-applied) Enter presses.
        find: /(\|[\s\S]*\|\s*\n)$/m,
        handler({ state }) {
          const $r = state.selection.$from;
          // Only fire for a real Enter at the END of a doc-level paragraph
          // sequence. Guard against firing inside tables/lists/blocks where a
          // pipe paragraph is not a GFM table candidate.
          if (!$r.parent.isTextblock) return null;
          if ($r.depth !== 1) return null; // must be a direct doc child
          if ($r.parentOffset < $r.parent.content.size) return null; // cursor mid-text

          // The cursor is inside the data line's paragraph (from.parentOffset
          // is the data-line length). The header + delimiter lines are the
          // preceding sibling paragraphs. Walk backward while each sibling is
          // a pipe-carrying textblock and reassemble the GFM sequence.
          //
          // Positions: the seed is the LAST block. Walking backward, the next
          // sibling's node start is `currentStart - prevNode.nodeSize`. The
          // walk stops at the first sibling that is not a pipe textblock.
          const blocks: { text: string; start: number; node: PMNode }[] = [];
          let start = $r.before($r.depth); // seed (data line) node start
          let node: PMNode = $r.parent;
          blocks.push({ text: node.textBetween(0, node.content.size, '￼'), start, node });

          for (let guard = 0; guard < blocks.length + 12; guard += 1) {
            // `start` is a doc position at the block's node boundary
            // (parentOffset 0), so `$at.parent` is the doc and `index()` is
            // the block's child index. Resolving at `start - 1` lands INSIDE
            // the previous paragraph (a textblock) and yields a nested index,
            // so resolve exactly at `start`.
            if (start <= 0) break;
            const $at = state.doc.resolve(start);
            if ($at.parent.isTextblock) break; // block isn't a direct doc child
            const index = $at.index();
            if (index <= 0) break;
            const prev = $at.parent.child(index - 1) as PMNode;
            if (!prev.isTextblock) break;
            const prevText = prev.textBetween(0, prev.content.size, '￼');
            if (!splitTableLine(prevText)) break;
            start -= prev.nodeSize;
            blocks.unshift({ text: prevText, start, node: prev });
          }

          // A real table needs at least header + delimiter (2 blocks); a lone
          // pipe paragraph must never convert.
          if (blocks.length < 2) return null;

          const parsed = parseTableInput(blocks.map(b => b.text).join('\n'));
          // parseTableInput rejects mismatched column counts, so malformed
          // input stays as text.  rows may be empty when the user just typed
          // header + delimiter and pressed Enter — buildTableNode synthesises
          // an empty data row in that case.
          if (!parsed) return null;

          const tableNode = buildTableNode(state.schema as any, parsed);
          if (!tableNode) return null;

          const tableStart = blocks[0].start;
          const lastBlock = blocks[blocks.length - 1];
          const tableEnd = lastBlock.start + lastBlock.node.nodeSize;
          const tr = state.tr;
          tr.replaceWith(tableStart, tableEnd, tableNode);
          // Place the cursor inside the first data cell (second row, first
          // cell): table open + header row (content + close) + data row open
          // + first cell open + paragraph open lands on the cell's text.
          const inserted = tr.doc.nodeAt(tableStart);
          if (inserted && inserted.type.name === 'table') {
            let cellContentPos = tableStart + 1; // table open
            const firstRow = inserted.firstChild!;
            cellContentPos += firstRow.nodeSize; // header row (content + close)
            cellContentPos += 1; // data row open
            cellContentPos += 1; // first data cell open
            cellContentPos += 1; // paragraph open
            tr.setSelection(TextSelection.near(tr.doc.resolve(cellContentPos)));
          }
        },
      }),
    ];
  },
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
    if (!node.content?.length) return '';

    const rows = node.content.map(row => (row.content ?? []).map(cell => {
      const parts = (cell.content ?? []).map(child => helpers.renderChildren(child));
      const text = escapeTableCellPipes(parts.join('\n'))
        .replace(/[ \t]*\r?\n[ \t]*/g, '<br>')
        .replace(/\s+/g, ' ')
        .trim();
      const align = cell.attrs?.align;
      return {
        text,
        isHeader: cell.type === 'tableHeader',
        align: align === 'left' || align === 'right' || align === 'center' ? align : null,
      };
    }));

    const columnCount = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
    if (columnCount === 0) return '';

    const widths = Array.from({ length: columnCount }, (_, column) => Math.max(
      3,
      ...rows.map(row => row[column]?.text.length ?? 0),
    ));
    const pad = (value: string, width: number) => value + ' '.repeat(Math.max(0, width - value.length));
    const header = rows[0];
    const hasHeader = header.some(cell => cell.isHeader);
    const alignments = Array.from({ length: columnCount }, (_, column) =>
      rows.find(row => row[column]?.align)?.[column]?.align ?? null,
    );
    const headerTexts = Array.from({ length: columnCount }, (_, column) =>
      hasHeader ? header[column]?.text ?? '' : '',
    );

    let markdown = `\n| ${headerTexts.map((text, column) => pad(text, widths[column])).join(' | ')} |\n`;
    markdown += `| ${widths.map((width, column) => {
      const dashes = '-'.repeat(Math.max(3, width));
      if (alignments[column] === 'left') return `:${dashes}`;
      if (alignments[column] === 'right') return `${dashes}:`;
      if (alignments[column] === 'center') return `:${dashes}:`;
      return dashes;
    }).join(' | ')} |\n`;

    for (const row of hasHeader ? rows.slice(1) : rows) {
      markdown += `| ${Array.from({ length: columnCount }, (_, column) =>
        pad(row[column]?.text ?? '', widths[column])).join(' | ')} |\n`;
    }
    return markdown;
  },
});
