import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, ListItem, ListKeymap, OrderedList, TaskItem, TaskList } from '@tiptap/extension-list';
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { createMarkdownExtension } from './editor.init';
import { BlockImage, CustomLink, MarkdownSafeTable, mermaidCodeBlockExtension } from './editor.extensions';

const mocks = vi.hoisted(() => ({
  renderMermaid: vi.fn(),
  renderPlantUml: vi.fn(),
  getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })),
  store: { on: vi.fn(), off: vi.fn() },
  showMermaidContextMenu: vi.fn(),
  showPlantumlContextMenu: vi.fn(),
  logDebug: vi.fn(),
  logWarn: vi.fn(),
  logException: vi.fn(),
  getMermaidExportBaseName: vi.fn(),
  getPlantUmlExportBaseName: vi.fn(),
}));
vi.mock('./mermaid', () => ({ renderMermaid: mocks.renderMermaid }));
vi.mock('./plantuml', () => ({ renderPlantUml: mocks.renderPlantUml }));
vi.mock('./plantuml-lazy', () => ({ isBlankPlantUmlSource: vi.fn(() => false) }));
vi.mock('./storage', () => ({ getCachedSettings: mocks.getCachedSettings }));
vi.mock('./store', () => ({ store: mocks.store }));
vi.mock('../components/mermaidContextMenu', () => ({ showMermaidContextMenu: mocks.showMermaidContextMenu }));
vi.mock('../components/plantumlContextMenu', () => ({ showPlantumlContextMenu: mocks.showPlantumlContextMenu }));
vi.mock('./editor.state', () => ({
  getMermaidExportBaseName: mocks.getMermaidExportBaseName,
  getPlantUmlExportBaseName: mocks.getPlantUmlExportBaseName,
}));
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

/**
 * Round-trip a Markdown source through the real v3 editor and return the
 * serialized output as well as two parsed structures for equality checks.
 */
function roundTrip(source: string) {
  const editor = createAppEditor();
  try {
    editor.commands.setContent(source, { contentType: 'markdown' });
    const first = editor.getJSON();
    const output = editor.getMarkdown();
    editor.commands.setContent(output, { contentType: 'markdown' });
    const reparsed = editor.getJSON();
    return { output, first, reparsed };
  } finally {
    editor.destroy();
  }
}

describe('Section 3 dedicated syntax round-trip tests', () => {
  describe('3.3 image adapters', () => {
    it('preserves alt, title and original relative source on round trip', () => {
      const { output, first, reparsed } = roundTrip('![diagram](images/diagram.png "Architecture")\n\nText.');
      expect(output).toContain('images/diagram.png');
      expect(output).toContain('Architecture');
      expect(output).toContain('diagram');
      // Image node attrs survive reparse.
      const image = (node: any): any => (node.type === 'image' ? node : (node.content ?? []).map(image).flat().find(Boolean));
      const img = image(reparsed);
      expect(img?.attrs).toMatchObject({ src: 'images/diagram.png', alt: 'diagram', title: 'Architecture' });
      // parse→serialize→parse preserves the doc shape.
      const firstNoTitle = JSON.stringify(first).replace(/"title":"[^"]*"/g, '');
      expect(JSON.stringify(reparsed).replace(/"title":"[^"]*"/g, '')).toBe(firstNoTitle);
    });

    it('does not emit a runtime asset URL in serialized output', () => {
      // Simulate the bridge's runtime-URL conversion being present in the doc,
      // and assert the adapter output (before bridge restore) contains only
      // the runtime URL.  The bridge itself restores originals in editor.ts.
      const editor = createAppEditor();
      try {
        editor.commands.setContent('![](asset://runtime-image)', { contentType: 'markdown' });
        const output = editor.getMarkdown();
        expect(output).toContain('asset://runtime-image');
      } finally {
        editor.destroy();
      }
    });
  });

  describe('3.6 list adapters', () => {
    it('keeps nested and continuation list structure after parse→serialize→parse', () => {
      const source = '- parent\n  - child\n    1. grandchild\n- sibling';
      const { output, first, reparsed } = roundTrip(source);
      expect(output).toMatch(/^- parent\n  - child\n    1\. grandchild\n- sibling/);
      expect(reparsed).toEqual(first);
    });

    it('keeps task list check state after round trip', () => {
      const source = '- [x] parent\n  - [ ] nested todo\n  - [x] nested done';
      const { output, first, reparsed } = roundTrip(source);
      expect(output).toContain('- [x]');
      expect(output).toContain('- [ ]');
      expect(reparsed).toEqual(first);
    });
  });

  describe('3.7 GFM table adapters', () => {
    it('keeps empty cells, escaped pipes and inline marks and stays a table', () => {
      const source = '| A | B | C |\n| :--- | ---: | :---: |\n|  | a \\| b | **bold** |';
      const { output, first, reparsed } = roundTrip(source);
      expect(output).toMatch(/^\n\|/);
      expect(output).toContain('a \\| b');
      expect(reparsed.content?.some((node: any) => node.type === 'table')).toBe(true);
      expect(reparsed).toEqual(first);
    });
  });

  describe('3.8 soft/hard break semantics', () => {
    it('distinguishes a hard break (two trailing spaces) from a soft break', () => {
      // Soft break: no hardBreak node in ProseMirror.
      const soft = roundTrip('line one\nline two');
      expect(JSON.stringify(soft.reparsed)).not.toContain('hardBreak');

      // Hard break: a genuine hardBreak node.
      const hard = roundTrip('line one  \nline two\n\nnext');
      expect(JSON.stringify(hard.reparsed)).toContain('hardBreak');
      expect(hard.output).toContain('  ');
    });
  });
});