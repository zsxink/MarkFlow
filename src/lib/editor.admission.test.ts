import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, OrderedList, ListItem, ListKeymap, TaskList, TaskItem } from '@tiptap/extension-list';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { BlockImage, CustomLink, MarkdownSafeTable, SafeParagraph, mermaidCodeBlockExtension } from './editor.extensions';
import { createMarkdownExtension } from './editor.init';
import { parseTipTapMarkdown, serializeTipTapMarkdown } from './editor.markdown.adapter';
import { decideAdmission, verifyAdmission } from './editor.markdown.admission';
import { classifyEligibility } from './editor.markdown.eligibility';
import { OpaqueNode } from './editor.markdown.opaque.extension';
import { endOpaqueSession } from './editor.markdown.opaque.session';

const mocks = vi.hoisted(() => ({
  renderMermaid: vi.fn(), renderPlantUml: vi.fn(),
  getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })),
  store: { on: vi.fn(), off: vi.fn(), setState: vi.fn(), emit: vi.fn() },
  showMermaidContextMenu: vi.fn(), showPlantumlContextMenu: vi.fn(),
  logDebug: vi.fn(), logWarn: vi.fn(), logException: vi.fn(),
  getMermaidExportBaseName: vi.fn(), getPlantUmlExportBaseName: vi.fn(),
}));
vi.mock('./mermaid', () => ({ renderMermaid: mocks.renderMermaid }));
vi.mock('./plantuml', () => ({ renderPlantUml: mocks.renderPlantUml }));
vi.mock('./plantuml-lazy', () => ({ isBlankPlantUmlSource: vi.fn(() => false) }));
vi.mock('./storage', () => ({ getCachedSettings: mocks.getCachedSettings }));
vi.mock('./store', () => ({ store: mocks.store }));
vi.mock('../components/mermaidContextMenu', () => ({ showMermaidContextMenu: mocks.showMermaidContextMenu }));
vi.mock('../components/plantumlContextMenu', () => ({ showPlantumlContextMenu: mocks.showPlantumlContextMenu }));
vi.mock('./editor.state', () => ({ getMermaidExportBaseName: mocks.getMermaidExportBaseName, getPlantUmlExportBaseName: mocks.getPlantUmlExportBaseName, assetToOriginalMap: new Map() }));
vi.mock('./logger', () => ({ logDebug: mocks.logDebug, logWarn: mocks.logWarn, logException: mocks.logException }));

function createAppEditor() {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ paragraph: false, codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
      SafeParagraph,
      BulletList, OrderedList, ListItem, ListKeymap,
      TaskList, TaskItem.configure({ nested: true }),
      MarkdownSafeTable.configure({ resizable: true }),
      TableRow, TableCell, TableHeader,
      CustomLink.configure({ openOnClick: false, autolink: false, linkOnPaste: false }),
      BlockImage.configure({ allowBase64: true }),
      mermaidCodeBlockExtension(),
      OpaqueNode,
      createMarkdownExtension(),
    ],
  });
}

const SUPPORTED = [
  'paragraph', '# Heading\n\nsome **bold** and *em* text.\n',
  'list', '- one\n- two\n  - nested\n',
  'table', '| A | B |\n| --- | --- |\n| 1 | 2 |\n',
  'code', '```ts\nconst a = 1;\n```\n',
  'link', '[a](https://x.test)\n',
];

describe('admission verification (6.4)', () => {
  const editor = createAppEditor();

  afterEach(() => {
    endOpaqueSession();
  });

  it('admits supported documents (parse→serialize→parse preserves semantics)', () => {
    for (const [name, src] of SUPPORTED) {
      expect(verifyAdmission(editor, src), `supported ${name} should pass verification`).toEqual({ ok: true });
    }
  });

  it('rejects a malformed table whose round-trip loses authored cell data', () => {
    // A malformed delimiter row (2 header cols, 1 delimiter col) is not a
    // stable GFM table across parse→serialize→parse; the recovery changes the
    // cell structure and the re-parsed fingerprint diverges.
    const r = verifyAdmission(editor, '| A | B |\n| --- |\n| only one cell |\n');
    expect(r.ok).toBe(false);
  });

  it('rejects inline code with a trailing space (documented limitation, issue decision)', () => {
    // A code span that ends with a space (`` `# ` ``) does not round-trip: the
    // v3 serializer moves the trailing space out of the code span (`` `# ` `` →
    // `` `#` `` + leading space on the following text), so the re-parsed
    // fingerprint differs from the source. This is a known-but-NOT-registered
    // canonicalization (see editor.markdown.fingerprint.ts) — such docs are
    // intentionally kept source-only until a lossless serializer fix or an
    // explicit, reviewed canonicalization exists. Pinned here so the behavior
    // (and any future re-decision) is visible.
    const src = '- H1 添加 `# `前缀\n';
    expect(classifyEligibility(src).verdict).not.toBe('source-only'); // classifier admits it
    expect(verifyAdmission(editor, src).ok).toBe(false); // but verification keeps it out of WYSIWYG
  });

  it('rejects an unclosed code fence (ambiguous boundary)', () => {
    // Unclosed fence: v3 keeps everything as code to EOF on both sides, so the
    // fingerprint may match — but the eligibility classifier (6.2) rejects it
    // as source-only before admission. Assert the classifier's contract rather
    // than pretending verification alone catches it.
    const src = '```\nnever closed\n';
    expect(classifyEligibility(src).verdict).toBe('source-only');
  });

  it('is deterministic for supported inputs (repeatable)', () => {
    const src = SUPPORTED[1][1];
    expect(verifyAdmission(editor, src)).toEqual(verifyAdmission(editor, src));
  });

  it('admits code literals that resemble unsupported prose constructs', () => {
    const src = [
      '# Code literals',
      '',
      'Use `Result<T, E>`, `<url>`, `$x$`, `[^1]`, and `[x][ref]`.',
      '',
      '```ts',
      'type Box<T> = { value: T };',
      'const literal = "$y$ [^2] [a][b]";',
      '```',
      '',
    ].join('\n');

    expect(decideAdmission(editor, src)).toMatchObject({
      mode: 'reconcile', verdict: 'eligible', reason: 'supported',
    });
  });

  it('admits frontmatter with supported tables, links and images', () => {
    const src = [
      '---',
      'title: Assets',
      '---',
      '',
      '# Assets',
      '',
      '| File | State |',
      '| --- | --- |',
      '| icon.png | missing |',
      '',
      '[docs](https://example.com "Docs")',
      '',
      '![icon](./icon.png "Icon")',
      '',
    ].join('\n');

    expect(decideAdmission(editor, src)).toMatchObject({
      mode: 'opaque', verdict: 'eligible-with-opaque', reason: 'opaque-covered',
    });
  });

  it('rejects a table that would lose an extra authored cell on first parse', () => {
    const src = '| A | B |\n| --- | --- |\n| one | two | must-not-disappear |\n';
    expect(decideAdmission(editor, src)).toMatchObject({
      mode: 'source-only', verdict: 'source-only', reason: 'malformed-table',
    });
  });

  // Guard against a regression where verification silently passes a lossy doc
  // by ensuring the supported set genuinely round-trips (matches differential
  // gate 5.4).
  it('reflects the differential corpus: supported constructs are lossless', () => {
    const src = SUPPORTED[2][1]; // table
    expect(verifyAdmission(editor, src).ok).toBe(true);
  });

  // issue #286: a paragraph that begins with a LITERAL (escaped-in-source)
  // block prefix must round-trip as a paragraph. The v3 serializer used to
  // drop the leading backslash (`6\.` → `6.`), so the re-parse lexed it as a
  // list/heading/HR and `verifyAdmission` rejected the doc as source-only.
  it('admits paragraphs whose first line starts with an escaped block prefix', () => {
    const cases = [
      '6\\. 这是一段以转义数字开头的正文\n',
      '1\\. 另一段\n',
      '10\\. 第三段\n',
      '999999999\\. x\n',
      '5\\) 正文\n',
      '\\- foo\n',
      '\\+ foo\n',
      '\\### foo\n',
      '\\---\n',
    ];
    for (const src of cases) {
      expect(verifyAdmission(editor, src), `${JSON.stringify(src)} should pass verification`).toEqual({ ok: true });
    }
  });

  // Negative / non-regression: real block structures still serialize exactly
  // as before (the paragraph renderer must not rewrite typed list/heading/HR
  // nodes), and plain paragraph text is not over-escaped.
  it('keeps real block structures and non-ambiguous paragraphs round-tripping identically', () => {
    // Each tuple asserts: (1) verification passes, (2) the serialized output is
    // byte-for-byte the pre-fix baseline (captured before SafeParagraph existed).
    const cases: Array<[string, string]> = [
      ['1. a\n2. b\n', '1. a\n2. b\n\n'], // real ordered list
      ['- a\n- b\n', '- a\n- b\n\n'], // real bullet list
      ['- [ ] a\n- [x] b\n', '- [ ] a\n- [x] b\n\n'], // task list
      ['> quote\n', '> quote\n\n'], // blockquote
      ['# hi\n', '# hi\n\n'], // H1
      ['---\n', '---\n\n'], // HR
      ['- a\n  - b\n', '- a\n  - b\n\n'], // nested list
      ['***bold***\n', '***bold***'], // emphasis (only inline ***)
      ['foo\n---\n', '## foo\n\n'], // setext heading (parses to an H2 node)
      ['-foo\n', '-foo'], // no space after '-' — plain text
      ['6.x\n', '6.x'], // no space after '6.' — plain text
      ['a 6. x\n', 'a 6. x'], // digits not at line start
      ['hello **world**\n', 'hello **world**'], // plain prose
    ];
    for (const [src, expectedOutput] of cases) {
      // Verification itself must pass.
      expect(verifyAdmission(editor, src), `${JSON.stringify(src)} should pass verification`).toEqual({ ok: true });
      // Serialized output is byte-for-byte unchanged from the pre-fix baseline.
      const parsed = parseTipTapMarkdown(editor, src);
      expect(parsed.ok, `${JSON.stringify(src)} should parse`).toBe(true);
      if (parsed.ok) {
        const serialized = serializeTipTapMarkdown(editor);
        expect(serialized.ok, `${JSON.stringify(src)} should serialize`).toBe(true);
        if (serialized.ok) expect(serialized.markdown, `${JSON.stringify(src)} output`).toBe(expectedOutput);
      }
    }
  });
});
