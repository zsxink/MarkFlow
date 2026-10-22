import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, OrderedList, ListItem, ListKeymap, TaskList, TaskItem } from '@tiptap/extension-list';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { BlockImage, CustomLink, MarkdownSafeTable, SafeParagraph, mermaidCodeBlockExtension } from './editor.extensions';
import { createMarkdownExtension } from './editor.init';
import { parseTipTapMarkdown } from './editor.markdown.adapter';
import { placeCaretAfterContentLoad } from './editor';
import { OpaqueNode } from './editor.markdown.opaque.extension';

const mocks = vi.hoisted(() => ({
  renderMermaid: vi.fn(), renderPlantUml: vi.fn(),
  getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })),
  store: { on: vi.fn(), off: vi.fn(), setState: vi.fn(), emit: vi.fn(), getState: vi.fn(() => ({})) },
  showMermaidContextMenu: vi.fn(), showPlantumlContextMenu: vi.fn(),
  logDebug: vi.fn(), logWarn: vi.fn(), logException: vi.fn(),
  getMermaidExportBaseName: vi.fn(), getPlantUmlExportBaseName: vi.fn(),
}));
vi.mock('./mermaid', () => ({ renderMermaid: mocks.renderMermaid }));
vi.mock('./plantuml', () => ({ renderPlantUml: mocks.renderPlantUml }));
vi.mock('./plantuml-lazy', () => ({ isBlankPlantUmlSource: vi.fn(() => false) }));
vi.mock('./storage', () => ({ getCachedSettings: mocks.getCachedSettings }));
vi.mock('./store', () => ({ store: mocks.store }));
vi.mock('../components/toast', () => ({ showToast: vi.fn() }));
vi.mock('../components/mermaidContextMenu', () => ({ showMermaidContextMenu: mocks.showMermaidContextMenu }));
vi.mock('../components/plantumlContextMenu', () => ({ showPlantumlContextMenu: mocks.showPlantumlContextMenu }));
vi.mock('./editor.state', () => ({
  getActiveDocPath: () => null,
  getMermaidExportBaseName: mocks.getMermaidExportBaseName,
  getPlantUmlExportBaseName: mocks.getPlantUmlExportBaseName,
  assetToOriginalMap: new Map(),
  getMode: () => 'wysiwyg',
  getEditor: () => null,
}));
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

const README = '# Skill-Hub\n\n一个 AI Agent 技能仓库。\n';

describe('caret after a whole-document load', () => {
  it('documents the raw setContent behaviour: the old caret is mapped to the end', () => {
    const editor = createAppEditor();
    editor.commands.setContent('<p></p>');
    editor.commands.setTextSelection(1);
    parseTipTapMarkdown(editor, README);
    // This is the defect: an empty document's caret at 1 becomes the last
    // text position of the loaded document.
    expect(editor.state.selection.from).toBe(editor.state.doc.content.size - 1);
    expect(editor.state.selection.$from.parent.type.name).not.toBe('heading');
    editor.destroy();
  });

  it('places the caret inside the first block for document loads', () => {
    const editor = createAppEditor();
    editor.commands.setContent('<p></p>');
    editor.commands.setTextSelection(1);
    parseTipTapMarkdown(editor, README);
    placeCaretAfterContentLoad(editor, 'start', 1);
    const { selection, doc } = editor.state;
    expect(selection.from).toBe(1);
    expect(selection.empty).toBe(true);
    // The caret must live inside the heading's text, not at the document edge;
    // otherwise the browser paints a body-sized caret above the heading.
    expect(selection.$from.parent.type.name).toBe('heading');
    expect(selection.$from.parentOffset).toBe(0);
    expect(doc.textContent.startsWith('Skill-Hub')).toBe(true);
    editor.destroy();
  });

  it('keeps an in-place re-render near the previous position', () => {
    const editor = createAppEditor();
    parseTipTapMarkdown(editor, `${README}\nsecond paragraph here.\n`);
    const tail = editor.state.doc.content.size - 5;
    editor.commands.setTextSelection(tail);
    parseTipTapMarkdown(editor, `---\ntitle: x\n---\n${README}\nsecond paragraph here.\n`);
    placeCaretAfterContentLoad(editor, 'preserve', tail);
    expect(editor.state.selection.from).toBeGreaterThan(1);
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
    editor.destroy();
  });

  it('marks the caret transaction as non-history and non-updating', () => {
    const editor = createAppEditor();
    editor.commands.setContent('<p></p>');
    editor.commands.setTextSelection(1);
    parseTipTapMarkdown(editor, README);

    const seen: { history: unknown; preventUpdate: unknown; docChanged: boolean }[] = [];
    const dispatch = editor.view.dispatch.bind(editor.view);
    // Intercept the transaction so its metas are observable instead of inferred.
    (editor.view as unknown as { dispatch: typeof dispatch }).dispatch = tr => {
      seen.push({
        history: tr.getMeta('addToHistory'),
        preventUpdate: tr.getMeta('preventUpdate'),
        docChanged: tr.docChanged,
      });
      return dispatch(tr);
    };
    placeCaretAfterContentLoad(editor, 'start', 1);
    // One selection-only transaction: excluded from undo history, flagged as
    // non-updating, and carrying no document step.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ history: false, preventUpdate: true, docChanged: false });
    editor.destroy();
  });

  it('only writes the browser selection back when the view owns focus', () => {
    const editor = createAppEditor();
    document.body.append(editor.view.dom);
    editor.commands.setContent('<p></p>');
    editor.commands.setTextSelection(1);
    parseTipTapMarkdown(editor, README);

    // Unfocused: the caret must be re-anchored in the model without stealing
    // focus away from whatever the user is actually doing.
    const outside = document.createElement('input');
    document.body.append(outside);
    outside.focus();
    placeCaretAfterContentLoad(editor, 'start', 1);
    expect(editor.state.selection.from).toBe(1);
    expect(document.activeElement).toBe(outside);

    // Focused: the same call must additionally hand focus back to the editor so
    // the painted caret matches the model.
    editor.view.focus();
    placeCaretAfterContentLoad(editor, 'start', 1);
    expect(document.activeElement).toBe(editor.view.dom);
    const dom = editor.view.dom;
    editor.destroy();
    outside.remove();
    // Leave no detached editor node behind for later cases in this file.
    dom.remove();
  });
});
