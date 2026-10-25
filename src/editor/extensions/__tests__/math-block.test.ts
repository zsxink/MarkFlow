/**
 * mathBlock node tests (issue #417) — tokenizer rule matrix, canonical
 * serialization, and the NodeView edit interaction. The tokenizer matrix runs
 * through the real marked pipeline so the node's `markdownTokenizer` is
 * exercised exactly like production parsing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, ListItem, ListKeymap, OrderedList } from '@tiptap/extension-list';
import { SafeHardBreak, SafeParagraph, MathBlock, mermaidCodeBlockExtension } from '..';
import { findMathBlockStart } from '../math-block';
import { createMarkdownExtension } from '../../init';
import { TOKENIZER_START_WINDOW } from '../../markdown/tokenizer-window';

const mocks = vi.hoisted(() => ({
  renderKatex: vi.fn(),
  renderMermaid: vi.fn(),
  renderPlantUml: vi.fn(),
  isBlankPlantUmlSource: vi.fn(() => false),
  getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })),
  store: { on: vi.fn(), off: vi.fn(), setState: vi.fn(), emit: vi.fn() },
  logDebug: vi.fn(),
  logWarn: vi.fn(),
  logException: vi.fn(),
}));
vi.mock('../../../render/katex-render', () => ({ renderKatex: mocks.renderKatex }));
vi.mock('../../../render/mermaid', () => ({ renderMermaid: mocks.renderMermaid }));
vi.mock('../../../render/plantuml', () => ({ renderPlantUml: mocks.renderPlantUml }));
vi.mock('../../../render/plantuml-lazy', () => ({ isBlankPlantUmlSource: mocks.isBlankPlantUmlSource }));
vi.mock('../../../infra/storage', () => ({ getCachedSettings: mocks.getCachedSettings }));
vi.mock('../../../infra/store', () => ({ store: mocks.store }));
vi.mock('../../../infra/logger', () => ({ logDebug: mocks.logDebug, logWarn: mocks.logWarn, logException: mocks.logException }));

const ALIGN_LATEX = '\\begin{align}\n  a &= b + c \\\\\n  d &= e + f\n\\end{align}';
const ALIGN_DOC = `$$\n${ALIGN_LATEX}\n$$`;

function makeEditor() {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({
        paragraph: false, codeBlock: false, hardBreak: false, link: false,
        bulletList: false, orderedList: false, listItem: false, listKeymap: false,
      }),
      SafeParagraph,
      SafeHardBreak,
      BulletList,
      OrderedList,
      ListItem,
      ListKeymap,
      mermaidCodeBlockExtension(),
      MathBlock,
      createMarkdownExtension(),
    ],
  });
}

function parse(editor: Editor, source: string) {
  return editor.markdown!.parse(source) as { content?: Array<{ type: string; attrs?: { latex?: string } }> };
}

function serialize(editor: Editor, source: string): string {
  return editor.markdown!.serialize(parse(editor, source));
}

function mathBlocks(doc: { content?: Array<{ type: string; attrs?: { latex?: string } }> }) {
  return (doc.content ?? []).filter((node) => node.type === 'mathBlock');
}

describe('mathBlock tokenizer rule matrix', () => {
  afterEach(() => {
    mocks.renderKatex.mockClear();
  });

  it('recognizes a standalone multi-line block at line start', () => {
    const editor = makeEditor();
    const doc = parse(editor, '$$\n\\frac{a}{b}\n$$');
    expect(mathBlocks(doc)).toEqual([{ type: 'mathBlock', attrs: { latex: '\\frac{a}{b}' } }]);
    editor.destroy();
  });

  it('recognizes blocks indented by up to 3 spaces', () => {
    const editor = makeEditor();
    expect(mathBlocks(parse(editor, '  $$x$$'))).toEqual([{ type: 'mathBlock', attrs: { latex: 'x' } }]);
    expect(mathBlocks(parse(editor, '   $$x$$'))).toEqual([{ type: 'mathBlock', attrs: { latex: 'x' } }]);
    editor.destroy();
  });

  it('recognizes a single-line block and trims delimiter-adjacent whitespace', () => {
    const editor = makeEditor();
    expect(mathBlocks(parse(editor, '$$\\frac{a}{b}$$'))).toEqual([{ type: 'mathBlock', attrs: { latex: '\\frac{a}{b}' } }]);
    expect(mathBlocks(parse(editor, '$$ x $$'))).toEqual([{ type: 'mathBlock', attrs: { latex: 'x' } }]);
    editor.destroy();
  });

  it('keeps cross-line LaTeX bytes verbatim (backslash breaks, ampersands, indent)', () => {
    const editor = makeEditor();
    const doc = parse(editor, ALIGN_DOC);
    expect(mathBlocks(doc)).toEqual([{ type: 'mathBlock', attrs: { latex: ALIGN_LATEX } }]);
    editor.destroy();
  });

  it('does not match $$ in the middle of a line', () => {
    const editor = makeEditor();
    const doc = parse(editor, 'text $$a$$ tail');
    expect(mathBlocks(doc)).toEqual([]);
    expect(doc.content?.[0]?.type).toBe('paragraph');
    editor.destroy();
  });

  it('leaves an unclosed $$ block to plain text parsing', () => {
    const editor = makeEditor();
    const doc = parse(editor, '$$\nx\ny');
    expect(mathBlocks(doc)).toEqual([]);
    expect(doc.content?.[0]?.type).toBe('paragraph');
    editor.destroy();
  });

  it('does not fire inside a code fence', () => {
    const editor = makeEditor();
    const doc = parse(editor, '```\n$$\nx\n$$\n```');
    expect(mathBlocks(doc)).toEqual([]);
    expect(doc.content?.[0]?.type).toBe('codeBlock');
    editor.destroy();
  });

  it('does not match empty content between delimiters', () => {
    const editor = makeEditor();
    expect(mathBlocks(parse(editor, '$$\n$$'))).toEqual([]);
    expect(mathBlocks(parse(editor, '$$   $$'))).toEqual([]);
    editor.destroy();
  });

  it('treats 4-space indentation as code, not math', () => {
    const editor = makeEditor();
    const doc = parse(editor, '    $$x$$');
    expect(mathBlocks(doc)).toEqual([]);
    expect(doc.content?.[0]?.type).toBe('codeBlock');
    editor.destroy();
  });
});

describe('mathBlock canonical serialization', () => {
  afterEach(() => {
    mocks.renderKatex.mockClear();
  });

  it('writes the multi-line canonical form and round-trips byte-exactly', () => {
    const editor = makeEditor();
    const out = serialize(editor, ALIGN_DOC);
    expect(out).toBe(`$$\n${ALIGN_LATEX}\n$$`);
    // Idempotent: re-parsing the canonical output reproduces the same bytes.
    const second = serialize(editor, out);
    expect(second).toBe(out);
    editor.destroy();
  });

  it('writes the single-line canonical form and normalizes inner padding once', () => {
    const editor = makeEditor();
    expect(serialize(editor, '$$ x $$')).toBe('$$x$$');
    // Edge newlines are trimmed away with the padding, so the trimmed latex
    // has no newline left and the single-line form applies.
    expect(serialize(editor, '$$\n x\n$$')).toBe('$$x$$');
    // Idempotent on the second pass.
    expect(serialize(editor, '$$x$$')).toBe('$$x$$');
    editor.destroy();
  });

  it('keeps an adjacent paragraph and the formula separated without rewriting the latex', () => {
    const editor = makeEditor();
    const source = `${ALIGN_DOC}\n\n前文段落\n`;
    const out = serialize(editor, source);
    expect(out).toBe(`$$\n${ALIGN_LATEX}\n$$\n\n前文段落`);
    expect(out).not.toContain('&amp;');
    expect(out).not.toContain('\\\\begin');
    editor.destroy();
  });
});

describe('mathBlock bounded `start` lookahead (#411)', () => {
  // The old `start` ran `/^[ \t]{0,3}\$\$/m` over the WHOLE remaining source
  // at every block boundary — O(n²) on fragmented documents (1.9MB lexed in
  // 25.6s). The bounded scan must reproduce the anchored-regex semantics
  // inside the 64KB window and never report a hit outside it.
  it('returns the line-start index for hits with 0/1/3 indent', () => {
    expect(findMathBlockStart('$$x$$')).toBe(0);
    expect(findMathBlockStart(' $$x$$')).toBe(0);
    expect(findMathBlockStart('   $$x$$')).toBe(0);
    expect(findMathBlockStart('\t$$x$$')).toBe(0);
    expect(findMathBlockStart('\t \t$$x$$')).toBe(0);
  });

  it('returns the line start (not the `$$`) so the offset includes indent', () => {
    const src = 'para\n\n  $$a$$';
    expect(findMathBlockStart(src)).toBe(src.indexOf('  $$a$$'));
  });

  it('skips mid-line `$$` and 4+ indent, finding the next valid opener', () => {
    const src = 'text $$mid$$ tail\n    $$four$$\n$$real$$\n';
    expect(findMathBlockStart(src)).toBe(src.indexOf('$$real$$'));
  });

  it('treats string position 0 as a line start (regex `^` parity)', () => {
    expect(findMathBlockStart('$$')).toBe(0);
    expect(findMathBlockStart(' $$$')).toBe(0);
  });

  it('returns -1 when no opener exists anywhere', () => {
    expect(findMathBlockStart('plain text\nmore text\n')).toBe(-1);
    expect(findMathBlockStart('')).toBe(-1);
  });

  it('finds an opener that sits just inside the window edge', () => {
    const pad = 'a'.repeat(TOKENIZER_START_WINDOW - 4);
    const src = `${pad}\n$$x$$`;
    // `$$` at TOKENIZER_START_WINDOW - 3: inside the 64KB prefix.
    expect(findMathBlockStart(src)).toBe(TOKENIZER_START_WINDOW - 3);
  });

  it('returns -1 when the opener lies beyond the window (no false positive)', () => {
    const src = `${'a'.repeat(TOKENIZER_START_WINDOW)}\n$$x$$`;
    expect(findMathBlockStart(src)).toBe(-1);
  });

  it('does not misreport a `$$` pair straddling the window edge', () => {
    // Only the first `$` of the opener is inside the window; a reported pair
    // needs both code units inside it.
    const src = `${'a'.repeat(TOKENIZER_START_WINDOW - 1)}$$x$$`;
    expect(findMathBlockStart(src)).toBe(-1);
  });
});

describe('mathBlock NodeView', () => {
  afterEach(() => {
    mocks.renderKatex.mockClear();
  });

  function mountWithFormula() {
    const editor = makeEditor();
    editor.commands.setContent(ALIGN_DOC, { contentType: 'markdown' } as never);
    return editor;
  }

  async function renderedPreview(editor: Editor) {
    const block = await vi.waitFor(() => {
      const el = editor.view.dom.querySelector<HTMLElement>('.math-block > div');
      if (!el || el.textContent === '加载中…') throw new Error('preview not rendered yet');
      return el;
    });
    return block;
  }

  it('renders the latex through renderKatex into a katex-block preview', async () => {
    mocks.renderKatex.mockResolvedValue({ ok: true, html: '<span class="rendered-math">math</span>' });
    const editor = mountWithFormula();
    const block = await renderedPreview(editor);
    expect(mocks.renderKatex).toHaveBeenCalledWith(ALIGN_LATEX, true);
    expect(block.querySelector('.rendered-math')).not.toBeNull();
    editor.destroy();
  });

  it('shows the error placeholder when renderKatex fails', async () => {
    mocks.renderKatex.mockResolvedValue({ ok: false, html: '', error: 'Unknown control sequence' });
    const editor = mountWithFormula();
    const block = await renderedPreview(editor);
    expect(block.className).toBe('katex-error-block');
    expect(block.textContent).toBe('公式语法错误：Unknown control sequence');
    editor.destroy();
  });

  it('enters source editing on click and commits with Cmd/Ctrl+Enter', async () => {
    mocks.renderKatex.mockResolvedValue({ ok: true, html: '<span class="rendered-math">math</span>' });
    const editor = mountWithFormula();
    await renderedPreview(editor);

    const dom = editor.view.dom.querySelector<HTMLElement>('.math-block');
    expect(dom).not.toBeNull();
    dom!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const textarea = await vi.waitFor(() => {
      const el = editor.view.dom.querySelector<HTMLTextAreaElement>('.math-block textarea.katex-source-editor');
      if (!el) throw new Error('editor not open');
      return el;
    });
    expect(textarea.value).toBe(ALIGN_LATEX);

    textarea.value = 'x = y';
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));

    await vi.waitFor(() => {
      const node = editor.state.doc.nodeAt(0);
      if (node?.attrs.latex !== 'x = y') throw new Error('latex not committed');
    });
    expect(editor.view.dom.querySelector('.math-block textarea')).toBeNull();
    editor.destroy();
  });

  it('cancels editing on Escape without changing the latex', async () => {
    mocks.renderKatex.mockResolvedValue({ ok: true, html: '<span class="rendered-math">math</span>' });
    const editor = mountWithFormula();
    await renderedPreview(editor);

    editor.view.dom.querySelector<HTMLElement>('.math-block')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const textarea = await vi.waitFor(() => {
      const el = editor.view.dom.querySelector<HTMLTextAreaElement>('.math-block textarea.katex-source-editor');
      if (!el) throw new Error('editor not open');
      return el;
    });
    textarea.value = 'dirty';
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(editor.state.doc.nodeAt(0)?.attrs.latex).toBe(ALIGN_LATEX);
    await vi.waitFor(() => {
      if (editor.view.dom.querySelector('.math-block textarea')) throw new Error('editor still open');
    });
    editor.destroy();
  });

  it('commits via the confirm button and cancels via the cancel button', async () => {
    mocks.renderKatex.mockResolvedValue({ ok: true, html: '<span class="rendered-math">math</span>' });
    const editor = mountWithFormula();
    await renderedPreview(editor);

    editor.view.dom.querySelector<HTMLElement>('.math-block')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    let textarea = await vi.waitFor(() => {
      const el = editor.view.dom.querySelector<HTMLTextAreaElement>('.math-block textarea.katex-source-editor');
      if (!el) throw new Error('editor not open');
      return el;
    });
    textarea.value = 'x = y';
    textarea.parentElement!.parentElement!.querySelector<HTMLButtonElement>('.katex-actions button')!.click();
    await vi.waitFor(() => {
      if (editor.state.doc.nodeAt(0)?.attrs.latex !== 'x = y') throw new Error('confirm not applied');
    });

    editor.view.dom.querySelector<HTMLElement>('.math-block')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    textarea = await vi.waitFor(() => {
      const el = editor.view.dom.querySelector<HTMLTextAreaElement>('.math-block textarea.katex-source-editor');
      if (!el) throw new Error('editor not open');
      return el;
    });
    const buttons = Array.from(textarea.parentElement!.parentElement!.querySelectorAll<HTMLButtonElement>('.katex-actions button'));
    buttons[buttons.length - 1]!.click();
    expect(editor.state.doc.nodeAt(0)?.attrs.latex).toBe('x = y');
    editor.destroy();
  });
});
