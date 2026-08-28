/**
 * Enter/Backspace/Delete command matrix — task 5.4.
 *
 * Evidence discipline: every cell below runs against the EditorView built by
 * the PRODUCT (`createLosslessSourceEditor` → `buildLosslessExtensions`), not a
 * stand-in view assembled inside this file. A hand-built view cannot detect a
 * regression in the product's extension list — `markdown({ addKeymap: false })`,
 * a dropped `Prec.high`, or a reordering that lets `basicSetup`'s
 * `defaultKeymap` outrank the Markdown keymap would all leave a stand-in test
 * green while list/quote continuation silently degrades to a plain newline.
 *
 * Keystrokes are real `keydown` events dispatched on the product view's
 * `contentDOM`, so the resolution order (`handleKeyEvents` → `runScopeHandlers`
 * → keymap facet in precedence order) is the one a user actually gets.
 *
 * Cells verified:
 *  - paragraph / heading / fence / table / image / malformed / cross-block
 *    selection → plain newline (native CodeMirror text semantics)
 *  - list (empty/non-empty/nested/ordered/task) → marker continuation or exit
 *  - quote (non-empty/empty) → `> ` continuation or exit
 *  - Backspace at line start inside list/quote marker → removes one level of
 *    markup; elsewhere → plain character deletion
 *  - Delete → plain forward deletion (surrogate-pair safe)
 *  - CJK / emoji boundaries (UTF-16 surrogate safe)
 *  - every edit is ONE local transaction: bytes outside the changed range are
 *    byte-identical (no serializer round-trip, no whole-doc rewrite, no second
 *    owner touching the doc)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { EditorState, type Transaction } from '@codemirror/state';
import { EditorView, keymap, runScopeHandlers } from '@codemirror/view';
import { insertNewlineContinueMarkup, deleteMarkupBackward } from '@codemirror/lang-markdown';
import { insertNewlineAndIndent, deleteCharBackward } from '@codemirror/commands';
import {
  createLosslessSourceEditor,
  buildLosslessExtensions,
  type LosslessSourceEditorHandle,
} from './losslessSourceEditor';

type KeyName = 'Enter' | 'Backspace' | 'Delete';

interface Harness {
  readonly view: EditorView;
  /** Source bytes as handed to the product factory. */
  readonly before: string;
  /** Doc-changing transactions reported by the product's own update listener. */
  readonly txs: Transaction[];
  doc(): string;
  /** Dispatch a real keydown on the product view's contentDOM. */
  press(key: KeyName): void;
  /** Run the production keymap resolution and report whether it handled the key. */
  pressHandled(key: KeyName): boolean;
}

const open: Harness[] = [];

function harness(source: string, pos: number | [number, number]): Harness {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const txs: Transaction[] = [];
  const handle: LosslessSourceEditorHandle = createLosslessSourceEditor(parent, source, {
    onTransaction: (transactions) => {
      txs.push(...transactions);
    },
  });
  handle.view.dispatch({
    selection: Array.isArray(pos) ? { anchor: pos[0], head: pos[1] } : { anchor: pos },
  });

  const h: Harness = {
    view: handle.view,
    before: source,
    txs,
    doc: () => handle.view.state.doc.toString(),
    press(key) {
      handle.view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );
    },
    pressHandled(key) {
      return runScopeHandlers(
        handle.view,
        new KeyboardEvent('keydown', { key, cancelable: true }),
        'editor',
      );
    },
  };
  open.push(h);
  return h;
}

/**
 * Pin the result of one keystroke AND the locality invariant:
 *  - the doc matches `expected` exactly
 *  - exactly one doc-changing transaction (no follow-up normalization pass, no
 *    hidden second owner dispatching a rewrite)
 *  - exactly one change range, and the bytes before/after it are byte-identical
 *    to the untouched prefix/suffix of the source
 */
function expectLocalEdit(
  h: Harness,
  expected: string,
  opts: { wholeDocChange?: boolean; spans?: number } = {},
) {
  const after = h.doc();
  expect(after).toBe(expected);

  expect(h.txs.length).toBe(1);
  const spans: Array<{ fromA: number; toA: number; fromB: number; toB: number }> = [];
  h.txs[0].changes.iterChanges((fromA, toA, fromB, toB) => {
    spans.push({ fromA, toA, fromB, toB });
  });
  expect(spans.length).toBe(opts.spans ?? 1);

  // Untouched bytes on both sides of the edited window are byte-identical.
  const first = spans[0];
  const last = spans[spans.length - 1];
  expect(after.slice(0, first.fromB)).toBe(h.before.slice(0, first.fromA));
  expect(after.slice(last.toB)).toBe(h.before.slice(last.toA));
  if (!opts.wholeDocChange) {
    // A serializer round-trip / whole-doc rewrite would have to touch both ends.
    expect(first.fromA === 0 && last.toA === h.before.length).toBe(false);
  }
}

describe('wiring guard: the product view resolves Enter/Backspace through the Markdown keymap', () => {
  afterEach(() => {
    while (open.length) open.pop()!.view.destroy();
    document.body.innerHTML = '';
  });

  it('markdown keymap bindings precede basicSetup defaultKeymap bindings in the keymap facet', () => {
    // Order in the facet IS precedence: `runHandlers` runs bindings in this
    // order and stops at the first one that returns true. Asserting order
    // (rather than `Prec` internals) survives an internal refactor of how the
    // priority is expressed.
    const state = EditorState.create({ doc: '', extensions: buildLosslessExtensions().extensions });
    const bindings = state.facet(keymap).flat();
    const markdownEnter = bindings.findIndex((b) => b.run === insertNewlineContinueMarkup);
    const plainEnter = bindings.findIndex((b) => b.run === insertNewlineAndIndent);
    const markdownBackspace = bindings.findIndex((b) => b.run === deleteMarkupBackward);
    const plainBackspace = bindings.findIndex((b) => b.run === deleteCharBackward);

    expect(markdownEnter).toBeGreaterThanOrEqual(0);
    expect(markdownBackspace).toBeGreaterThanOrEqual(0);
    expect(plainEnter).toBeGreaterThan(markdownEnter);
    expect(plainBackspace).toBeGreaterThan(markdownBackspace);
  });

  it('a real Enter keydown continues the list marker instead of inserting a bare newline', () => {
    // Regression guard: with `addKeymap: false` (or a lost `Prec.high`) this
    // becomes the native fallback `'- item one\n'` and stays green in any test
    // that does not use the product extension list.
    const h = harness('- item one', 10);
    h.press('Enter');
    expect(h.doc()).toBe('- item one\n- ');
    expect(h.doc()).not.toBe('- item one\n');
  });

  it('a real Backspace keydown removes list markup instead of one character', () => {
    // Native fallback at pos 2 would delete the space → '-item'.
    const h = harness('- item', 2);
    h.press('Backspace');
    expect(h.doc()).toBe('item');
    expect(h.doc()).not.toBe('-item');
  });

  it('a real Enter keydown continues the quote marker instead of inserting a bare newline', () => {
    const h = harness('> quote text', 12);
    h.press('Enter');
    expect(h.doc()).toBe('> quote text\n> ');
    expect(h.doc()).not.toBe('> quote text\n');
  });

  it('the Markdown commands decline outside their context (fallback stays reachable)', () => {
    // Sanity: the precedence above must not swallow plain text. Both Markdown
    // commands must return false in a paragraph so the native binding runs.
    const h = harness('hello world', 5);
    expect(h.pressHandled('Enter')).toBe(true);
    expect(h.doc()).toBe('hello\nworld');
  });
});

describe('Enter command matrix on the product editor (task 5.4)', () => {
  afterEach(() => {
    while (open.length) open.pop()!.view.destroy();
    document.body.innerHTML = '';
  });

  it('paragraph mid-line → plain logical LF, trailing space trimmed, prefix/suffix intact', () => {
    const h = harness('hello world', 5);
    h.press('Enter');
    // Only the split point changes: [5,6) (the space) → '\n'.
    expectLocalEdit(h, 'hello\nworld');
  });

  it('paragraph end-of-line → plain LF, nothing else touched', () => {
    const h = harness('hello world', 11);
    h.press('Enter');
    expectLocalEdit(h, 'hello world\n');
  });

  it('heading → plain newline (no marker continuation)', () => {
    const h = harness('# Title', 7);
    h.press('Enter');
    expectLocalEdit(h, '# Title\n');
  });

  it('fence body → literal newline (no structural transform)', () => {
    const h = harness('```\ncode\n```', 8);
    h.press('Enter');
    expectLocalEdit(h, '```\ncode\n\n```');
  });

  it('non-empty list item → same marker continuation', () => {
    const h = harness('- item one', 10);
    h.press('Enter');
    expectLocalEdit(h, '- item one\n- ');
  });

  it('nested list item → continuation at the same indentation', () => {
    const h = harness('  - item', 8);
    h.press('Enter');
    expectLocalEdit(h, '  - item\n  - ');
  });

  it('ordered list item → next ordinal', () => {
    const h = harness('1. a', 4);
    h.press('Enter');
    expectLocalEdit(h, '1. a\n2. ');
  });

  it('GFM task list item → checkbox continuation', () => {
    const h = harness('- [ ] a', 7);
    h.press('Enter');
    expectLocalEdit(h, '- [ ] a\n- [ ] ');
  });

  it('EMPTY list item → exits the list (dedent)', () => {
    const h = harness('- ', 2);
    h.press('Enter');
    // The only content WAS the marker, so the change legitimately spans it.
    expectLocalEdit(h, '', { wholeDocChange: true });
  });

  it('non-empty quote → `> ` continuation', () => {
    const h = harness('> quote text', 12);
    h.press('Enter');
    expectLocalEdit(h, '> quote text\n> ');
  });

  it('EMPTY quote after a blank quoted line → exits the quote', () => {
    const h = harness('> text\n>\n> ', 11);
    h.press('Enter');
    // One transaction, two adjacent deletions (`>` at [7,8) and `> ` at [9,11));
    // the quoted text and everything before it survive byte-for-byte.
    expectLocalEdit(h, '> text\n\n', { spans: 2 });
  });

  it('table → plain newline, table source preserved byte-for-byte (P4B widget absent)', () => {
    const source = '| a | b |\n|---|---|\n| 1 | 2 |';
    const h = harness(source, source.length);
    h.press('Enter');
    const after = h.doc();
    expect(after).toBe(`${source}\n`);
    expect(after).toContain('| a | b |');
    expect(after).toContain('|---|---|');
    expect(after).toContain('| 1 | 2 |');
    expectLocalEdit(h, `${source}\n`);
  });

  it('image line → plain newline, image source preserved (P4B widget absent)', () => {
    const h = harness('before ![alt](x.png) after', 26);
    h.press('Enter');
    expectLocalEdit(h, 'before ![alt](x.png) after\n');
  });

  it('malformed Markdown → plain newline, no repair/normalization of the source', () => {
    const h = harness('**unclosed [link', 16);
    h.press('Enter');
    expectLocalEdit(h, '**unclosed [link\n');
  });

  it('cross-block selection → native replace-with-newline, no structural rewrite', () => {
    const h = harness('a\n\nb', [0, 3]);
    h.press('Enter');
    // The whole selection is replaced by a single LF — one local change.
    expect(h.doc()).toBe('\nb');
    expect(h.txs.length).toBe(1);
  });
});

describe('Backspace command matrix on the product editor (task 5.4)', () => {
  afterEach(() => {
    while (open.length) open.pop()!.view.destroy();
    document.body.innerHTML = '';
  });

  it('at list marker → removes one level of markup', () => {
    const h = harness('- item', 2);
    h.press('Backspace');
    expectLocalEdit(h, 'item');
  });

  it('at a nested list marker → removes one whole level (indent + marker)', () => {
    // `deleteMarkupBackward` treats the indentation as part of the list item's
    // markup, so one level = '  - ' (not just '- ').
    const h = harness('  - item', 4);
    h.press('Backspace');
    expectLocalEdit(h, 'item');
  });

  it('at quote marker → removes the `> ` prefix', () => {
    const h = harness('> text', 2);
    h.press('Backspace');
    expectLocalEdit(h, 'text');
  });

  it('at line start of a heading → no-op (no markup to delete, nothing to delete before)', () => {
    const h = harness('# Title', 0);
    h.press('Backspace');
    expect(h.doc()).toBe('# Title');
    expect(h.txs.length).toBe(0);
  });

  it('in plain text → plain single-character deletion', () => {
    const h = harness('hello', 5);
    h.press('Backspace');
    expectLocalEdit(h, 'hell');
  });

  it('inside a fence body → literal deletion (no structural transform)', () => {
    const h = harness('```\ncode\n```', 8);
    h.press('Backspace');
    expectLocalEdit(h, '```\ncod\n```');
  });

  it('at the end of an image source → literal single-character deletion', () => {
    const h = harness('![alt](x.png)', 13);
    h.press('Backspace');
    expectLocalEdit(h, '![alt](x.png');
  });

  it('inside a table row → literal single-character deletion, rest of the table intact', () => {
    const source = '| a | b |\n|---|---|\n| 1 | 2 |';
    const h = harness(source, source.length);
    h.press('Backspace');
    const after = h.doc();
    expect(after).toBe('| a | b |\n|---|---|\n| 1 | 2 ');
    expect(after.startsWith('| a | b |\n|---|---|\n| 1 |')).toBe(true);
    expectLocalEdit(h, '| a | b |\n|---|---|\n| 1 | 2 ');
  });

  it('with a non-empty selection → deletes exactly the selection', () => {
    const h = harness('abc def', [0, 7]);
    h.press('Backspace');
    // Selection covers the whole doc, so the change legitimately spans both ends.
    expectLocalEdit(h, '', { wholeDocChange: true });
  });
});

describe('Delete command matrix on the product editor (task 5.4)', () => {
  afterEach(() => {
    while (open.length) open.pop()!.view.destroy();
    document.body.innerHTML = '';
  });

  it('plain text → forward single-character deletion (no Markdown binding)', () => {
    const h = harness('hello', 0);
    h.press('Delete');
    expectLocalEdit(h, 'ello');
  });

  it('at a list marker → literal forward deletion of the marker character', () => {
    const h = harness('- item', 0);
    h.press('Delete');
    expectLocalEdit(h, ' item');
  });

  it('inside a fence body → literal forward deletion', () => {
    const h = harness('```\ncode\n```', 4);
    h.press('Delete');
    expectLocalEdit(h, '```\node\n```');
  });
});

describe('CJK / emoji boundaries and byte locality (task 5.4 safety rule)', () => {
  afterEach(() => {
    while (open.length) open.pop()!.view.destroy();
    document.body.innerHTML = '';
  });

  it('Enter inside CJK text → plain LF, both halves preserved', () => {
    const h = harness('你好 世界', 2);
    h.press('Enter');
    expectLocalEdit(h, '你好\n世界');
  });

  it('Backspace before an emoji removes the preceding code unit and never splits the pair', () => {
    const h = harness('a \u{1F600} b', 2);
    h.press('Backspace');
    expectLocalEdit(h, 'a\u{1F600} b');
  });

  it('Backspace after an emoji removes the whole code point (two UTF-16 units)', () => {
    const h = harness('a \u{1F600} b', 4);
    h.press('Backspace');
    expectLocalEdit(h, 'a  b');
  });

  it('Delete at the start of an emoji removes the whole code point', () => {
    const h = harness('a \u{1F600} b', 2);
    h.press('Delete');
    expectLocalEdit(h, 'a  b');
  });

  it('no lone surrogate can survive any matrix edit', () => {
    const samples: Array<[string, number, KeyName]> = [
      ['a \u{1F600} b', 2, 'Backspace'],
      ['a \u{1F600} b', 4, 'Backspace'],
      ['a \u{1F600} b', 2, 'Delete'],
      ['\u{1F1FA}\u{1F1F8} flag', 4, 'Backspace'],
      ['你好 \u{1F600}', 3, 'Enter'],
    ];
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    for (const [source, pos, key] of samples) {
      const h = harness(source, pos);
      h.press(key);
      expect(lone.test(h.doc()), `${JSON.stringify(source)} @${pos} ${key}`).toBe(false);
    }
  });
});

describe('the product editor never normalizes on open (byte contract)', () => {
  afterEach(() => {
    while (open.length) open.pop()!.view.destroy();
    document.body.innerHTML = '';
  });

  // NOTE: CRLF/CR are intentionally NOT asserted here — CodeMirror's doc model
  // splits on \r\n and \r and re-emits \n, so the EditorView is LF-only by
  // construction. EOL provenance for CRLF files lives outside the view (the
  // paste hook and the Core byte layer), not in this matrix.
  it('opening does not rewrite BOM / trailing newlines / tabs', () => {
    const sources = ['\uFEFF# title', 'x\n\n\n', '- a\n\n\ttab', 'no-trailing-newline'];
    for (const source of sources) {
      const h = harness(source, 0);
      expect(h.doc(), source).toBe(source);
      expect(h.txs.length).toBe(0);
    }
  });
});
