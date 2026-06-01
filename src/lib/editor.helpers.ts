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
      gutter.textContent = computeLineNumbersText(codeEl.textContent || '');
    });
  } else {
    root.classList.remove('code-show-line-numbers');
    root.querySelectorAll(CODE_GUTTER_SELECTOR).forEach((g) => g.remove());
  }
}
