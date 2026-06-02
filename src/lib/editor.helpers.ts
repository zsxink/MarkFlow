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
