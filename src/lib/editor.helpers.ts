const CODE_GUTTER_CLASS = 'line-numbers-gutter';
const CODE_GUTTER_SELECTOR = '.line-numbers-gutter';

export function computeLineNumbersText(text: string): string {
  if (!text) return '';
  const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text;
  return trimmed
    .split('\n')
    .map((_, i) => String(i + 1))
    .join('\n');
}

export function countTextWords(text: string): number {
  if (!text) return 0;
  const cjkChars = (text.match(/[\u4e00-\u9fa5\u3400-\u4dbf]/g) || []).length;
  const nonCjkText = text.replace(/[\u4e00-\u9fa5\u3400-\u4dbf]/g, '');
  const nonCjkWords = nonCjkText.split(/\s+/).filter(Boolean).length;
  return cjkChars + nonCjkWords;
}

export function computeVisualLineNumbers(codeEl: Element): string {
  const text = codeEl.textContent || '';
  if (!text) return '';

  const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text;
  const lines = trimmed.split('\n');
  if (lines.length === 0) return '';

  const codeWidth = codeEl.clientWidth;
  if (codeWidth <= 0) return computeLineNumbersText(text);

  const style = getComputedStyle(codeEl);
  const measure = document.createElement('span');
  measure.textContent = 'x'.repeat(100);
  measure.style.cssText =
    `position:fixed;left:-9999px;white-space:nowrap;font-size:${style.fontSize};font-family:${style.fontFamily};letter-spacing:${style.letterSpacing};visibility:hidden`;
  document.body.appendChild(measure);
  const charWidth = measure.offsetWidth / 100;
  document.body.removeChild(measure);
  if (charWidth <= 0) return computeLineNumbersText(text);

  const charsPerLine = Math.floor(codeWidth / charWidth);
  if (charsPerLine <= 0) return computeLineNumbersText(text);
  const numbers: string[] = [];

  for (const line of lines) {
    const len = line.length || 1;
    const visualLines = Math.max(1, Math.ceil(len / charsPerLine));
    numbers.push(String(numbers.length + 1));
    for (let v = 1; v < visualLines; v++) numbers.push('');
  }

  return numbers.join('\n');
}

export interface SerializationIntegrityResult {
  /** Whether truncation is suspected */
  truncated: boolean;
  /** Human-readable reason (for logging), null when no issue */
  reason: string | null;
}

/**
 * Checks whether the Markdown serialization of a ProseMirror doc is likely
 * truncated. Compares output length against the doc's textContent using
 * both line count (structural) and character count (volume).
 *
 * Pure function — testable without DOM or Tiptap.
 *
 * Heuristic rules:
 * - Empty doc + empty markdown → not truncated (no content to lose)
 * - Non-empty doc + empty markdown → truncated (complete loss)
 * - Few doc lines (<5) → insufficient signal, skip heuristic
 * - Markdown line count < 20% of doc line count → suspicious truncation
 */
export function checkSerializationIntegrity(
  docText: string,
  markdown: string,
): SerializationIntegrityResult {
  const hasContent = docText.trim().length > 0;
  const mdTrimmed = markdown.trim();

  if (hasContent && mdTrimmed.length === 0) {
    return { truncated: true, reason: 'serialization returned empty while doc has content' };
  }

  if (!hasContent) {
    return { truncated: false, reason: null };
  }

  const docLines = docText.split('\n').length;
  const mdLines = mdTrimmed.split('\n').length;

  if (docLines > 5 && mdLines < docLines * 0.2) {
    return {
      truncated: true,
      reason: `markdown lines (${mdLines}) < 20% of doc lines (${docLines})`,
    };
  }

  return { truncated: false, reason: null };
}

export function syncCodeLineNumberGutters(
  root: HTMLElement,
  enabled: boolean,
): void {
  if (enabled) {
    root.classList.add('code-show-line-numbers');
    root.querySelectorAll('pre > code').forEach((codeEl) => {
      const pre = codeEl.parentElement;
      if (!pre) return;
      let gutter = pre.querySelector(CODE_GUTTER_SELECTOR) as HTMLElement | null;
      if (!gutter) {
        gutter = document.createElement('span');
        gutter.className = CODE_GUTTER_CLASS;
        pre.insertBefore(gutter, codeEl);
      }
      gutter.textContent = computeVisualLineNumbers(codeEl);
    });
  } else {
    root.classList.remove('code-show-line-numbers');
    root.querySelectorAll(CODE_GUTTER_SELECTOR).forEach((g) => g.remove());
  }
}
