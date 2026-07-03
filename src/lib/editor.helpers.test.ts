import { describe, expect, it, beforeEach } from 'vitest';
import {
  syncCodeLineNumberGutters,
  computeLineNumbersText,
  countTextWords,
} from './editor.helpers';

function buildEditorRoot(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'ProseMirror';
  document.body.appendChild(root);
  return root;
}

function makeCodeBlock(root: HTMLElement, source: string): HTMLPreElement {
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.className = 'hljs';
  code.textContent = source;
  pre.appendChild(code);
  root.appendChild(pre);
  return pre;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('computeLineNumbersText', () => {
  it('numbers each line starting from 1', () => {
    expect(computeLineNumbersText('a\nb\nc')).toBe('1\n2\n3');
  });

  it('does not count a trailing empty line', () => {
    expect(computeLineNumbersText('a\nb\n')).toBe('1\n2');
  });

  it('returns empty string for empty input', () => {
    expect(computeLineNumbersText('')).toBe('');
  });

  it('numbers a single line', () => {
    expect(computeLineNumbersText('hello')).toBe('1');
  });
});

describe('syncCodeLineNumberGutters', () => {
  it('injects a gutter for every pre > code when enabled', () => {
    const root = buildEditorRoot();
    const pre1 = makeCodeBlock(root, 'a\nb');
    const pre2 = makeCodeBlock(root, 'x');

    syncCodeLineNumberGutters(root, true);

    expect(root.classList.contains('code-show-line-numbers')).toBe(true);
    expect(pre1.querySelector('.line-numbers-gutter')).not.toBeNull();
    expect(pre2.querySelector('.line-numbers-gutter')).not.toBeNull();
  });

  it('places the gutter as the first child of pre so it renders left of code', () => {
    const root = buildEditorRoot();
    const pre = makeCodeBlock(root, 'a\nb');

    syncCodeLineNumberGutters(root, true);

    expect(pre.firstElementChild?.className).toBe('line-numbers-gutter');
  });

  it('writes the correct line numbers into the gutter text', () => {
    const root = buildEditorRoot();
    const pre = makeCodeBlock(root, 'line1\nline2\nline3');

    syncCodeLineNumberGutters(root, true);

    const gutter = pre.querySelector('.line-numbers-gutter') as HTMLElement;
    expect(gutter.textContent).toBe('1\n2\n3');
  });

  it('does not duplicate gutters when called twice', () => {
    const root = buildEditorRoot();
    const pre = makeCodeBlock(root, 'a\nb');

    syncCodeLineNumberGutters(root, true);
    syncCodeLineNumberGutters(root, true);

    expect(pre.querySelectorAll('.line-numbers-gutter').length).toBe(1);
  });

  it('updates the gutter text when the code text changes', () => {
    const root = buildEditorRoot();
    const pre = makeCodeBlock(root, 'a\nb');
    syncCodeLineNumberGutters(root, true);

    const code = pre.querySelector('code')!;
    code.textContent = 'a\nb\nc\nd';
    syncCodeLineNumberGutters(root, true);

    const gutter = pre.querySelector('.line-numbers-gutter') as HTMLElement;
    expect(gutter.textContent).toBe('1\n2\n3\n4');
  });

  it('removes all gutters and toggles the class off when disabled', () => {
    const root = buildEditorRoot();
    const pre = makeCodeBlock(root, 'a\nb');
    syncCodeLineNumberGutters(root, true);
    expect(pre.querySelector('.line-numbers-gutter')).not.toBeNull();

    syncCodeLineNumberGutters(root, false);

    expect(pre.querySelector('.line-numbers-gutter')).toBeNull();
    expect(root.classList.contains('code-show-line-numbers')).toBe(false);
  });

  it('is a no-op when the root has no code blocks and is enabled', () => {
    const root = buildEditorRoot();

    expect(() => syncCodeLineNumberGutters(root, true)).not.toThrow();
    expect(root.classList.contains('code-show-line-numbers')).toBe(true);
  });

  it('regression: injects gutters on a populated root that was rendered after the toggle was applied', () => {
    // Reproduces the original bug: root was marked with the class first,
    // then code blocks were rendered later. Sync must still create gutters.
    const root = buildEditorRoot();
    root.classList.add('code-show-line-numbers');

    // Code block is added after the class was already set.
    const pre = makeCodeBlock(root, 'a\nb\nc');

    syncCodeLineNumberGutters(root, true);

    const gutter = pre.querySelector('.line-numbers-gutter');
    expect(gutter).not.toBeNull();
    expect(gutter?.textContent).toBe('1\n2\n3');
  });
});

describe('countTextWords', () => {
  it('counts CJK characters as individual words', () => {
    expect(countTextWords('你好世界')).toBe(4);
  });

  it('splits non-CJK text by whitespace', () => {
    expect(countTextWords('hello world foo')).toBe(3);
  });

  it('counts mixed CJK and ASCII correctly', () => {
    expect(countTextWords('你好 world 世界 hello')).toBe(6);
  });

  it('returns 0 for empty string', () => {
    expect(countTextWords('')).toBe(0);
  });

  it('handles trailing whitespace gracefully', () => {
    expect(countTextWords('hello world ')).toBe(2);
  });

  it('handles only punctuation/symbols', () => {
    expect(countTextWords('!!! @@@ ###')).toBe(3);
  });
});
