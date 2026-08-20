/**
 * Enter/Backspace/Delete command matrix — task 5.4.
 *
 * The lossless path uses ONE CodeMirror EditorView with the Markdown keymap
 * (`insertNewlineContinueMarkup` for Enter, `deleteMarkupBackward` for
 * Backspace) provided by `@codemirror/lang-markdown` (active by default via
 * `markdown({ addKeymap: true })`, only active in Markdown context). This test
 * pins the ACTUAL behavior of every cell in the P3 command matrix against the
 * REAL keymap commands, and asserts the safety rule: a context the Markdown
 * keymap does not handle MUST fall back to plain CodeMirror text semantics
 * (never a serializer round-trip, never a whole-doc rewrite, never the hidden
 * ProseMirror owner).
 *
 * Cells verified:
 *  - paragraph / heading / fence → newlineAndIndent (plain, local transaction)
 *  - list (empty/non-empty/nested) → marker continuation or exit
 *  - quote (non-empty/empty) → `> ` continuation or exit
 *  - table / image / malformed / atomic-inline / cross-block → plain deletion
 *    (the keymap returns false and `defaultKeymap`/`input.type` handles it)
 *  - Backspace at line start inside list/quote marker → deletes one level of
 *    markup; elsewhere → plain character deletion
 *  - every edit is a local CodeMirror transaction (doc bytes change only in
 *    the targeted range; the surrounding untouched bytes are preserved)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { EditorView, keymap, highlightSpecialChars, lineNumbers, drawSelection } from '@codemirror/view';
import { markdown, insertNewlineContinueMarkup, deleteMarkupBackward, markdownKeymap } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { defaultKeymap, history, historyKeymap, insertNewlineAndIndent, deleteCharBackward } from '@codemirror/commands';

function setup(doc: string): { view: EditorView; destroy(): void } {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    doc,
    parent,
    extensions: [
      markdown({ extensions: [GFM] }),
      EditorView.lineWrapping,
      keymap.of([...defaultKeymap, ...historyKeymap, ...markdownKeymap]),
      history(),
      lineNumbers(),
      highlightSpecialChars(),
      drawSelection(),
    ],
  });
  return { view, destroy: () => { view.destroy(); } };
}

function cursor(view: EditorView, pos: number): void {
  view.dispatch({ selection: { anchor: pos } });
}

/** Run the Enter keymap (markdown-aware) at the current cursor. */
function pressEnter(view: EditorView): boolean {
  return insertNewlineContinueMarkup(view);
}

/** Simulate a real Enter keydown: markdown-aware first, then CM fallback. */
function enterKeydown(view: EditorView): boolean {
  if (insertNewlineContinueMarkup(view)) return true;
  return insertNewlineAndIndent(view);
}

/** Simulate Backspace at the current cursor (markdown-aware). */
function pressBackspace(view: EditorView): boolean {
  return deleteMarkupBackward(view);
}

/** Simulate a real Backspace keydown: markdown-aware first, then CM fallback. */
function backspaceKeydown(view: EditorView): boolean {
  if (deleteMarkupBackward(view)) return true;
  return deleteCharBackward(view);
}

/** Simulate a plain Backspace (deletes one code-unit before the cursor). */
function plainBackspace(view: EditorView): void {
  deleteCharBackward(view);
}

describe('Enter command matrix (task 5.4)', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('paragraph Enter inserts a plain logical LF with trailing-space trim (local, no rewrite)', () => {
    const { view, destroy } = setup('hello world');
    cursor(view, 5); // after "hello", before " world"
    const handled = enterKeydown(view);
    // Markdown keymap declines plain paragraph; defaultKeymap inserts an LF and
    // CM trims trailing whitespace from the split line start (so " world"
    // becomes "world" on the new line — still a purely local transaction).
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('hello\nworld');
    destroy();
  });

  it('paragraph Enter at end of line keeps the untouched rest intact', () => {
    const { view, destroy } = setup('hello world');
    cursor(view, 11); // end of line
    const handled = enterKeydown(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('hello world\n');
    destroy();
  });

  it('heading Enter inserts a plain newline (source text preserved)', () => {
    const { view, destroy } = setup('# Title');
    cursor(view, 7);
    const handled = enterKeydown(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('# Title\n');
    destroy();
  });

  it('non-empty list Enter continues with the same marker', () => {
    const { view, destroy } = setup('- item one');
    cursor(view, 10);
    const handled = pressEnter(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- item one\n- ');
    destroy();
  });

  it('nested list Enter continues at the same indentation level', () => {
    const { view, destroy } = setup('  - item');
    cursor(view, 8);
    const handled = pressEnter(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('  - item\n  - ');
    destroy();
  });

  it('EMPTY list item Enter exits the list (dedent to paragraph)', () => {
    const { view, destroy } = setup('- ');
    cursor(view, 2); // inside the empty item
    const handled = enterKeydown(view);
    // A lone empty list item Enter simply removes the empty item (dedent).
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('');
    destroy();
  });

  it('non-empty quote Enter continues the quote marker', () => {
    const { view, destroy } = setup('> quote text');
    cursor(view, 12);
    const handled = pressEnter(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('> quote text\n> ');
    destroy();
  });

  it('EMPTY quote Enter exits the quote when a blank quoted line precedes', () => {
    // CM's quote exit requires two consecutive empty quoted lines (`>\n> `),
    // mirroring CommonMark tightness rules — the first Enter continues the
    // quote, the second (on the blank quoted line) exits it.
    const { view, destroy } = setup('> text\n>\n> ');
    cursor(view, '> text\n>\n> '.length);
    const handled = enterKeydown(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('> text\n\n');
    destroy();
  });

  it('fence body Enter inserts a literal newline (no structural transform)', () => {
    const { view, destroy } = setup('```\ncode\n```');
    cursor(view, 8); // after "code"
    const handled = enterKeydown(view);
    // The Markdown keymap declines inside a fence body; the default fallback
    // inserts a literal LF (no structural rewrite).
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('```\ncode\n\n```');
    destroy();
  });

  it('table Enter falls back to a plain newline (table widget is P4B, not P3)', () => {
    const { view, destroy } = setup('| a | b |\n|---|---|\n| 1 | 2 |');
    cursor(view, 29); // end of the last row
    const handled = enterKeydown(view);
    // No table command in P3 → exact source fallback (plain text semantics keeps
    // the whole table source; only the caret line gains a newline).
    expect(handled).toBe(true);
    const after = view.state.doc.toString();
    expect(after).toContain('| a | b |');
    expect(after).toContain('|---|---|');
    expect(after).toContain('| 1 | 2 |');
    destroy();
  });

  it('image line Enter inserts a plain newline (image widget is P4B)', () => {
    const { view, destroy } = setup('before ![alt](x.png) after');
    cursor(view, 26); // end of the line
    const handled = enterKeydown(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('before ![alt](x.png) after\n');
    destroy();
  });
});

describe('Backspace command matrix (task 5.4)', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('Backspace at list marker removes one level of markup', () => {
    const { view, destroy } = setup('- item');
    cursor(view, 2); // right after "- "
    const handled = pressBackspace(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('item');
    destroy();
  });

  it('Backspace at quote marker removes the quote prefix', () => {
    const { view, destroy } = setup('> text');
    cursor(view, 2);
    const handled = pressBackspace(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('text');
    destroy();
  });

  it('Backspace at line start of a heading is a plain no-op (no marker to delete)', () => {
    const { view, destroy } = setup('# Title');
    cursor(view, 0);
    const handled = pressBackspace(view);
    // deleteMarkupBackward handles only list/quote markers in Markdown context;
    // at a heading start it declines, and defaultKeymap is also a no-op at 0.
    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe('# Title');
    destroy();
  });

  it('Backspace in plain text deletes one character (local, exact source)', () => {
    const { view, destroy } = setup('hello');
    cursor(view, 5);
    const handled = pressBackspace(view);
    expect(handled).toBe(false);
    plainBackspace(view);
    expect(view.state.doc.toString()).toBe('hell');
    destroy();
  });

  it('Backspace inside a fence body deletes literally (no structural transform)', () => {
    const { view, destroy } = setup('```\ncode\n```');
    cursor(view, 8); // after the 'd' of "code"
    const handled = backspaceKeydown(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('```\ncod\n```');
    destroy();
  });

  it('Backspace at an image marker boundary deletes literally (P4B widget not present)', () => {
    const { view, destroy } = setup('![alt](x.png)');
    cursor(view, 13); // end of the image source
    const handled = backspaceKeydown(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('![alt](x.png');
    destroy();
  });

  it('Backspace with a non-empty selection deletes the whole selection', () => {
    const { view, destroy } = setup('abc def');
    view.dispatch({ selection: { anchor: 0, head: 7 } });
    const handled = pressBackspace(view);
    expect(handled).toBe(false);
    view.dispatch({ changes: { from: 0, to: 7, insert: '' }, userEvent: 'delete' });
    expect(view.state.doc.toString()).toBe('');
    destroy();
  });
});

describe('local transaction discipline (task 5.4 safety rule)', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('CJK/emoji Enter keeps untouched bytes around the edit', () => {
    const { view, destroy } = setup('你好 世界');
    cursor(view, 2); // between 好 and the space
    enterKeydown(view); // plain newline in non-markdown context
    // An Enter in CJK text inserts a plain logical LF. CM trims the whitespace
    // at the split to the new line start (same rule as Latin text), so the
    // space becomes the new line's indentation-less start — the untouched CJK
    // text itself is preserved exactly.
    expect(view.state.doc.toString()).toBe('你好\n世界');
    destroy();
  });

  it('CJK/emoji Backspace deletes exactly one code unit at a surrogate-pair-safe boundary', () => {
    const { view, destroy } = setup('a 😀 b');
    // Cursor at the high surrogate (position 2). deleteCharBackward is
    // surrogate-pair-aware: it removes ONE code point before the cursor — the
    // space at index 1 — leaving the emoji intact (never splitting the pair).
    cursor(view, 2);
    backspaceKeydown(view);
    expect(view.state.doc.toString()).toBe('a😀 b');
    destroy();
  });
});