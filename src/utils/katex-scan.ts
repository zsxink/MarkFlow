/**
 * KaTeX formula scanner — identifies $..$ (inline) and $$..$$ (block) math syntax.
 * Follows D4 boundary rules:
 * - $ not followed by whitespace or digit (prevents currency $100 false positives)
 * - $$ longest match priority (block before inline)
 * - Block $$ supports multi-line, inline $ does not
 */

export interface FormulaMatch {
  /** 'inline' for $..$ or 'block' for $$..$$ */
  type: 'inline' | 'block';
  /** Start index in source string (inclusive, points to first $) */
  from: number;
  /** End index in source string (exclusive, points after last $) */
  to: number;
  /** The LaTeX content between delimiters (without the $ markers) */
  content: string;
}

/** A complete line-leading `$$..$$` block region in a source string. */
export interface MathBlockRegion {
  /** [from, to) span of the whole block, including both `$$` delimiters. */
  from: number;
  to: number;
  /** Trimmed LaTeX content between the delimiters. */
  latex: string;
}

/**
 * Locate line-leading `$$..$$` block regions with the exact rule the mathBlock
 * node tokenizer applies (issue #417): `$$` at a line start with at most 3
 * leading spaces/tabs, matched non-greedily to the nearest closing `$$`, empty
 * content skipped. Callers mask these regions so LaTeX content never votes in
 * markdown-construct detection — the formula content is not markdown syntax.
 */
export function scanMathBlockRegions(source: string): MathBlockRegion[] {
  const regions: MathBlockRegion[] = [];
  const re = /^[ \t]{0,3}\$\$((?:[^$]|\$(?!\$))*?)\$\$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const latex = m[1].trim();
    if (!latex) continue;
    regions.push({ from: m.index, to: m.index + m[0].length, latex });
  }
  return regions;
}

/**
 * Scan source string for KaTeX formula syntax.
 * Returns matches sorted by position, with block formulas prioritized over
 * inline when they overlap (longest match first).
 */
export function scanFormulas(source: string): FormulaMatch[] {
  const matches: FormulaMatch[] = [];

  // Pass 1: Find double-dollar formulas. Only a line-leading delimiter is a
  // display block; in the middle of a paragraph `$$...$$` is inline math.
  // This matters for list items and task items, where treating an in-sentence
  // formula as a block widget breaks the surrounding text flow.
  const blockRe = /\$\$(?!\$)((?:[^$]|\$(?!\$))*)\$\$/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(source)) !== null) {
    const content = m[1].trim();
    if (!content) continue; // Skip empty formulas like $$  $$
    const lineStart = source.lastIndexOf('\n', m.index - 1) + 1;
    const linePrefix = source.slice(lineStart, m.index);
    const type = /^[ \t]{0,3}$/.test(linePrefix) ? 'block' : 'inline';
    // Inline formula delimiters cannot span paragraphs. Leave malformed
    // mid-line multi-line pairs untouched instead of inserting a block widget.
    if (type === 'inline' && /\r?\n/.test(m[1])) continue;
    matches.push({
      type,
      from: m.index,
      to: m.index + m[0].length,
      content: m[1], // Preserve original content (including whitespace)
    });
  }

  // Pass 2: Find inline formulas $...$ (no newlines)
  // Pattern: $ not followed by whitespace/digit, content (no newline), then $
  // Skip positions already covered by double-dollar formulas.
  const inlineRe = /\$(?!\s|\d)([^$\n]+?)\$/g;
  while ((m = inlineRe.exec(source)) !== null) {
    const matchFrom = m.index;
    const matchTo = m.index + m[0].length;

    // Skip if this overlaps with a double-dollar match.
    const overlapsDoubleDollar = matches.some(
      (formula) => matchFrom < formula.to && matchTo > formula.from,
    );
    if (overlapsDoubleDollar) continue;

    matches.push({
      type: 'inline',
      from: matchFrom,
      to: matchTo,
      content: m[1],
    });
  }

  // Sort by position
  matches.sort((a, b) => a.from - b.from);
  return matches;
}
