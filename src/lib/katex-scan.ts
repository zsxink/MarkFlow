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

/**
 * Scan source string for KaTeX formula syntax.
 * Returns matches sorted by position, with block formulas prioritized over
 * inline when they overlap (longest match first).
 */
export function scanFormulas(source: string): FormulaMatch[] {
  const matches: FormulaMatch[] = [];

  // Pass 1: Find block formulas $$...$$ (multi-line allowed)
  // Match $$ that is not part of $$$ or more, content, then same $$ delimiter
  const blockRe = /\$\$(?!\$)((?:[^$]|\$(?!\$))*)\$\$/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(source)) !== null) {
    const content = m[1].trim();
    if (!content) continue; // Skip empty formulas like $$  $$
    matches.push({
      type: 'block',
      from: m.index,
      to: m.index + m[0].length,
      content: m[1], // Preserve original content (including whitespace)
    });
  }

  // Pass 2: Find inline formulas $...$ (no newlines)
  // Pattern: $ not followed by whitespace/digit, content (no newline), then $
  // Skip positions already covered by block matches
  const inlineRe = /\$(?!\s|\d)([^$\n]+?)\$/g;
  while ((m = inlineRe.exec(source)) !== null) {
    const matchFrom = m.index;
    const matchTo = m.index + m[0].length;

    // Skip if this overlaps with a block match
    const overlapsBlock = matches.some(
      (bm) => bm.type === 'block' && matchFrom < bm.to && matchTo > bm.from,
    );
    if (overlapsBlock) continue;

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
