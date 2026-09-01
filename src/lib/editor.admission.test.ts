import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, OrderedList, ListItem, ListKeymap, TaskList, TaskItem } from '@tiptap/extension-list';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { BlockImage, CustomLink, MarkdownSafeTable, mermaidCodeBlockExtension } from './editor.extensions';
import { createMarkdownExtension } from './editor.init';
import { verifyAdmission } from './editor.markdown.admission';
import { classifyEligibility } from './editor.markdown.eligibility';

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
vi.mock('./editor.state', () => ({ getMermaidExportBaseName: mocks.getMermaidExportBaseName, getPlantUmlExportBaseName: mocks.getPlantUmlExportBaseName }));
vi.mock('./logger', () => ({ logDebug: mocks.logDebug, logWarn: mocks.logWarn, logException: mocks.logException }));

function createAppEditor() {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
      BulletList, OrderedList, ListItem, ListKeymap,
      TaskList, TaskItem.configure({ nested: true }),
      MarkdownSafeTable.configure({ resizable: true }),
      TableRow, TableCell, TableHeader,
      CustomLink.configure({ openOnClick: false, autolink: false, linkOnPaste: false }),
      BlockImage.configure({ allowBase64: true }),
      mermaidCodeBlockExtension(),
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

  // Guard against a regression where verification silently passes a lossy doc
  // by ensuring the supported set genuinely round-trips (matches differential
  // gate 5.4).
  it('reflects the differential corpus: supported constructs are lossless', () => {
    const src = SUPPORTED[2][1]; // table
    expect(verifyAdmission(editor, src).ok).toBe(true);
  });
});
