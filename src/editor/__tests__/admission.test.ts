import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, OrderedList, ListItem, ListKeymap, TaskList, TaskItem } from '@tiptap/extension-list';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { BlockImage, CustomLink, MarkdownSafeTable, SafeParagraph, mermaidCodeBlockExtension } from '../extensions';
import { createMarkdownExtension } from '../init';
import { parseTipTapMarkdown, serializeTipTapMarkdown } from '../markdown/adapter';
import { decideAdmission, verifyAdmission, admissionReasonLabel } from '../markdown/admission';
import { classifyEligibility, WYSIWYG_MAX_ADMISSION_BYTES, WYSIWYG_MAX_ADMISSION_LINES } from '../markdown/eligibility';
import { RawMarkdown } from '../markdown/fallback';
import { OpaqueNode } from '../markdown/opaque/extension';
import { endOpaqueSession } from '../markdown/opaque/session';

const mocks = vi.hoisted(() => ({
  renderMermaid: vi.fn(), renderPlantUml: vi.fn(),
  getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })),
  store: { on: vi.fn(), off: vi.fn(), setState: vi.fn(), emit: vi.fn() },
  showMermaidContextMenu: vi.fn(), showPlantumlContextMenu: vi.fn(),
  logDebug: vi.fn(), logWarn: vi.fn(), logException: vi.fn(),
  getMermaidExportBaseName: vi.fn(), getPlantUmlExportBaseName: vi.fn(),
}));
vi.mock('../../render/mermaid', () => ({ renderMermaid: mocks.renderMermaid }));
vi.mock('../../render/plantuml', () => ({ renderPlantUml: mocks.renderPlantUml }));
vi.mock('../../render/plantuml-lazy', () => ({ isBlankPlantUmlSource: vi.fn(() => false) }));
vi.mock('../../infra/storage', () => ({ getCachedSettings: mocks.getCachedSettings }));
vi.mock('../../infra/store', () => ({ store: mocks.store }));
vi.mock('../../ui/mermaid-context-menu', () => ({ showMermaidContextMenu: mocks.showMermaidContextMenu }));
vi.mock('../../ui/plantuml-context-menu', () => ({ showPlantumlContextMenu: mocks.showPlantumlContextMenu }));
vi.mock('../state', () => ({ getActiveDocPath: () => null, getMermaidExportBaseName: mocks.getMermaidExportBaseName, getPlantUmlExportBaseName: mocks.getPlantUmlExportBaseName, assetToOriginalMap: new Map() }));
vi.mock('../../infra/logger', () => ({ logDebug: mocks.logDebug, logWarn: mocks.logWarn, logException: mocks.logException }));

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
      RawMarkdown,
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

  it('preserves inline code with trailing spaces through round-trip verification', () => {
    const src = '- H1 添加 `# `前缀\n';
    expect(classifyEligibility(src).verdict).not.toBe('source-only');
    expect(verifyAdmission(editor, src).ok).toBe(true);
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

  it('keeps a table that would lose an extra authored cell as a literal block', () => {
    const src = '| A | B |\n| --- | --- |\n| one | two | must-not-disappear |\n';
    expect(decideAdmission(editor, src)).toMatchObject({
      mode: 'reconcile', verdict: 'eligible-with-opaque', reason: 'opaque-covered',
    });
    // The lossy table is retained verbatim instead of forcing the whole
    // document to source-only (issue #291).
    const raw: string[] = [];
    editor.state.doc.descendants(node => {
      if (node.type.name === 'markflowRawMarkdown') raw.push(String(node.attrs.source));
    });
    expect(raw.join('\n')).toContain('must-not-disappear');
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

  // issue #395: undefined adjacent brackets (`[S1][S2]` traceability markers)
  // are literal text per CommonMark — classification must admit them and the
  // round-trip verification proves the losslessness (escapes added by the
  // serializer re-parse to the same literal text).
  it('admits PRD-style traceability markers without reference definitions', () => {
    const src = [
      '# 需求文档',
      '',
      '需求 A [S1][S2] 关联，[S3][S4] 与单标记 [S5] 并存。',
      '',
      '资料来源：`https://example.com/source`。',
      '',
    ].join('\n');
    expect(classifyEligibility(src)).toEqual({ verdict: 'eligible', reason: 'supported' });
    expect(verifyAdmission(editor, src)).toEqual({ ok: true });
    expect(decideAdmission(editor, src)).toMatchObject({
      mode: 'reconcile', verdict: 'eligible', reason: 'supported',
    });
  });

  it('reports the measured size with the too-large admission decision', () => {
    const oversized = 'a'.repeat(WYSIWYG_MAX_ADMISSION_BYTES);
    expect(decideAdmission(editor, oversized)).toMatchObject({
      mode: 'source-only',
      reason: 'too-large',
      size: { bytes: WYSIWYG_MAX_ADMISSION_BYTES, lines: 1 },
    });
  });

  it('names the exceeded limit in the too-large notice', () => {
    expect(admissionReasonLabel('too-large', { bytes: 300 * 1024, lines: 500 }))
      .toBe('文档过大（300KB，超过所见即所得准入上限 256KB）');
    expect(admissionReasonLabel('too-large', { bytes: 1024, lines: WYSIWYG_MAX_ADMISSION_LINES + 1 }))
      .toBe(`文档过大（${WYSIWYG_MAX_ADMISSION_LINES + 1} 行，超过所见即所得准入上限 ${WYSIWYG_MAX_ADMISSION_LINES} 行）`);
    expect(admissionReasonLabel('too-large')).toBe('文档过大');
  });

  // issue #397: definitions nested in containers (or written with escaped
  // label brackets) ARE registered by Marked — the usage resolves into a link
  // and the definition line vanishes from the parsed doc. That silent save-time
  // loss is invisible to the round-trip fingerprints (the first parse already
  // dropped it), so the classifier must reject these forms up front. Each
  // fixture pairs with the href Marked resolves, proving the rejection is
  // justified rather than a false positive.
  it('rejects container-nested and escaped-label definitions that Marked would drop', () => {
    const forms: Array<[string, string]> = [
      ['[text][ref]\n\n> [ref]: /url\n', '/url'],
      ['[text][ref]\n\n>[ref]: /url\n', '/url'],
      ['[text][ref]\n\n> > [ref]: /url\n', '/url'],
      ['[text][ref]\n\n- [ref]: /url\n', '/url'],
      ['[text][ref]\n\n- a\n  - [ref]: /url\n', '/url'],
      ['see [ref] here\n\n> [ref]: /url\n', '/url'],
      ['[text][foo\\]]\n\n[foo\\]]: /url\n', '/url'],
      ['[text][a\\-b]\n\n[a\\-b]: /url\n', '/url'],
      ['[text][ref]\n\n[ref]:\n/url\n', '/url'],
      ['[text][WIP]\n\n[WIP]: 开发中\n', '开发中'],
      ['[text][x]\n\n- [x]: note\n', 'note'],
    ];
    const hrefsOf = (doc: JSONContent): string[] => {
      const hrefs: string[] = [];
      const walk = (node: JSONContent): void => {
        for (const mark of node.marks ?? []) {
          if (mark.type === 'link') hrefs.push(String(mark.attrs?.href ?? ''));
        }
        for (const child of node.content ?? []) walk(child);
      };
      walk(doc);
      return hrefs;
    };
    for (const [src, href] of forms) {
      expect(classifyEligibility(src), `${JSON.stringify(src)} classifier`)
        .toMatchObject({ verdict: 'source-only', category: 'reference-link' });
      const parsed = parseTipTapMarkdown(editor, src);
      expect(parsed.ok, `${JSON.stringify(src)} parses`).toBe(true);
      if (parsed.ok) {
        expect(hrefsOf(parsed.doc), `${JSON.stringify(src)} resolved links`).toContain(href);
      }
    }
  });

  // Conservative over-rejects: shapes Marked 17 keeps as literals but that are
  // definitions under CommonMark — the classifier still refuses them (issue
  // #397: a missed definition silently deletes a line on save).
  it('conservatively rejects definition-shaped forms Marked 17 keeps literal', () => {
    for (const src of ['1. [ref]: /url\n', '2) [ref]: /url\n', '- item\n  [ref]: /url\n', '    [ref]: /url\n']) {
      expect(classifyEligibility(src), `${JSON.stringify(src)} classifier`)
        .toMatchObject({ verdict: 'source-only', category: 'reference-link' });
    }
  });

  // Non-regression: bracket usages that are NOT definitions stay admitted,
  // including through round-trip verification.
  it('keeps literal bracket usages without definitions admitted', () => {
    for (const src of [
      '- [ ] todo\n- [x] done\n',
      '- [WIP] 还在开发\n',
      '[text][a[b]]\n\n[a[b]]: /url\n',
      '[foo]:\n\nplain paragraph\n',
      '1.[ref]: /url\n',
    ]) {
      expect(classifyEligibility(src), `${JSON.stringify(src)} classifier`).toEqual({ verdict: 'eligible', reason: 'supported' });
      expect(verifyAdmission(editor, src), `${JSON.stringify(src)} verification`).toEqual({ ok: true });
    }
  });
});
