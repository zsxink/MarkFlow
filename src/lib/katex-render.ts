/**
 * KaTeX formula rendering — converts LaTeX syntax to static HTML.
 * Follows D3: block formulas render as centered blocks, inline as spans.
 * Errors are caught and displayed as placeholders, never crashing.
 */

import {loadKatex} from './katex-lazy';
import {validateLatex} from './katex-validate';

export interface RenderedFormula {
  /** The rendered HTML string */
  html: string;
  /** Whether rendering succeeded */
  ok: boolean;
  /** Error message if rendering failed */
  error?: string;
}

/**
 * Render a LaTeX formula to HTML.
 * @param formula - The LaTeX content (without $ delimiters)
 * @param isBlock - Whether this is a block formula ($$..$$)
 * @returns RenderedFormula with HTML or error
 */
export async function renderKatex(
  formula: string,
  isBlock: boolean,
): Promise<RenderedFormula> {
  // Pre-validate syntax
  const validationError = validateLatex(formula, isBlock);
  if (validationError) {
    return {
      html: createErrorPlaceholder(formula, validationError, isBlock),
      ok: false,
      error: validationError,
    };
  }

  try {
    const katex = await loadKatex();
    const html = katex.renderToString(formula, {
      displayMode: isBlock,
      throwOnError: false,
      trust: true,
      strict: false,
    });
    return {html, ok: true};
  } catch (error) {
    const message = error instanceof Error ? error.message : '公式渲染失败';
    return {
      html: createErrorPlaceholder(formula, message, isBlock),
      ok: false,
      error: message,
    };
  }
}

/**
 * Create an error placeholder element for invalid formulas.
 */
function createErrorPlaceholder(
  formula: string,
  error: string,
  isBlock: boolean,
): string {
  const className = isBlock ? 'katex-error-block' : 'katex-error-inline';
  const escapedFormula = formula
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const escapedError = error
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<span class="${className}" title="${escapedError}">${escapedFormula}</span>`;
}
