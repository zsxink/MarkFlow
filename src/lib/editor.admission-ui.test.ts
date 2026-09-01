import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, OrderedList, ListItem, ListKeymap, TaskList, TaskItem } from '@tiptap/extension-list';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { BlockImage, CustomLink, MarkdownSafeTable, mermaidCodeBlockExtension } from './editor.extensions';
import { createMarkdownExtension } from './editor.init';
import { store } from './store';
import { getMode, setEditor, getMarkdownPipelineMode, getRevision, getDocumentState } from './editor.state';
import { setMarkdown, switchToWysiwyg, degradeToSourceOnly } from './editor';

const mocks = vi.hoisted(() => ({
  renderMermaid: vi.fn(), renderPlantUml: vi.fn(),
  getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })),
  showMermaidContextMenu: vi.fn(), showPlantumlContextMenu: vi.fn(),
  logDebug: vi.fn(), logWarn: vi.fn(), logException: vi.fn(),
  getMermaidExportBaseName: vi.fn(), getPlantUmlExportBaseName: vi.fn(),
  createSourceEditor: vi.fn((_wrapper: unknown, _content: string, _cb: unknown, _ro: unknown) => ({ focus: vi.fn() })),
  destroySourceEditor: vi.fn(),
  getSourceContent: vi.fn(),
  setSourceContent: vi.fn(),
  showToast: vi.fn(),
  cancel: vi.fn(), schedule: vi.fn(),
  testStoreState: { mode: 'wysiwyg', dirty: false, readOnly: false, autosaveErrorCount: 0, activeFilePath: null },
  testStore: {
    on: vi.fn(), off: vi.fn(), emit: vi.fn(),
    setState: (patch: Record<string, unknown>) => { Object.assign(mocks.testStoreState, patch); },
    getState: () => mocks.testStoreState,
  },
}));
vi.mock('./mermaid', () => ({ renderMermaid: mocks.renderMermaid }));
vi.mock('./plantuml', () => ({ renderPlantUml: mocks.renderPlantUml }));
vi.mock('./plantuml-lazy', () => ({ isBlankPlantUmlSource: vi.fn(() => false) }));
vi.mock('./storage', () => ({ getCachedSettings: mocks.getCachedSettings }));
vi.mock('./store', () => ({ store: mocks.testStore }));
vi.mock('../components/mermaidContextMenu', () => ({ showMermaidContextMenu: mocks.showMermaidContextMenu }));
vi.mock('../components/plantumlContextMenu', () => ({ showPlantumlContextMenu: mocks.showPlantumlContextMenu }));
vi.mock('./logger', () => ({ logDebug: mocks.logDebug, logWarn: mocks.logWarn, logException: mocks.logException }));
vi.mock('./editor.source', () => ({
  createSourceEditor: mocks.createSourceEditor,
  destroySourceEditor: mocks.destroySourceEditor,
  getSourceContent: mocks.getSourceContent,
  setSourceContent: mocks.setSourceContent,
}));
vi.mock('../components/toast', () => ({ showToast: mocks.showToast }));
vi.mock('./taskScheduler', () => ({ scheduler: { cancel: mocks.cancel, schedule: mocks.schedule } }));

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

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML =
    '<div id="editor-area"><div id="wysiwyg-editor"></div><div id="source-editor-wrapper" hidden></div></div>';
  store.setState({ mode: 'wysiwyg', dirty: false, readOnly: false, autosaveErrorCount: 0 });
  const st = getDocumentState();
  st.externallyModified = false;
  st.programmaticUpdate = false;
  st.programmaticUpdateDepth = 0;
  st.lastPersistedMarkdown = '';
  st.revision = 0;
  st.trailingNewlines = 0;
  setEditor(createAppEditor());
});

describe('stage-two eligibility UI wiring (6.5)', () => {
  it('opens a supported document into WYSIWYG with pipeline = gated', () => {
    setMarkdown('# Title\n\nsupported **body** and *em*.\n');
    expect(getMarkdownPipelineMode()).toBe('gated');
    expect(getMode()).toBe('wysiwyg');
    // No degradation toast for a supported doc.
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('keeps a source-only document in Source with a stable reason and does not rewrite', () => {
    const src = '[ref]: /some/url\n\n# Body\n';
    setMarkdown(src);
    expect(getMarkdownPipelineMode()).toBe('source-only');
    // A reason toast is shown (stable, content-free).
    expect(mocks.showToast).toHaveBeenCalledWith(expect.stringContaining('源码模式'));
    // CM6 editor is created (Source surface shown, WYSIWYG hidden).
    expect(mocks.createSourceEditor).toHaveBeenCalled();
    const sourceWrapper = document.getElementById('source-editor-wrapper') as HTMLElement;
    expect(sourceWrapper.hidden).toBe(false);
    const wysiwygEditor = document.getElementById('wysiwyg-editor') as HTMLElement;
    expect(wysiwygEditor.hidden).toBe(true);
    // Not marked dirty, no revision bump from the programmatic gating.
    expect(getRevision()).toBe(0);
    expect(store.getState().dirty).toBe(false);
  });

  it('rejects a Source→WYSIWYG switch for a source-only doc without destroying CM6', () => {
    const src = '- [ ] task\n\nthis is [text][ref] style\n';
    // First load into Source (source-only).
    setMarkdown(src);
    expect(getMarkdownPipelineMode()).toBe('source-only');
    // Attempt to switch to WYSIWYG — must be rejected and CM6 preserved.
    mocks.getSourceContent.mockReturnValue(src);
    switchToWysiwyg();
    expect(getMarkdownPipelineMode()).toBe('source-only');
    expect(getMode()).toBe('source');
    // CM6 not destroyed.
    expect(mocks.destroySourceEditor).not.toHaveBeenCalled();
    expect(document.getElementById('source-editor-wrapper')?.hidden).toBe(false);
  });

  it('does not dirty or bump revision when admitting a supported doc', () => {
    setMarkdown('# Open\n\n- one\n- two\n');
    expect(getRevision()).toBe(0);
    expect(store.getState().dirty).toBe(false);
    expect(getMarkdownPipelineMode()).toBe('gated');
  });
});

describe('stage-two gated kill-switch (6.6)', () => {
  it('degrades gated → source-only and reloads Source from the ORIGINAL source', () => {
    const original = '# Hello\n\nworld\n';
    setMarkdown(original);
    expect(getMarkdownPipelineMode()).toBe('gated');

    // Force a canonicalization so the editor's serialization differs from the
    // original source baseline (this is what a kill-switch must NOT leak back).
    mocks.createSourceEditor.mockClear();
    mocks.getSourceContent.mockReturnValue(original);

    degradeToSourceOnly();

    expect(getMarkdownPipelineMode()).toBe('source-only');
    expect(getMode()).toBe('source');
    // Source editor is rebuilt from the last ORIGINAL source baseline
    // (setMarkdown stored lastPersistedMarkdown = stripped original), never
    // from the canonicalized editor serialization.
    expect(mocks.createSourceEditor).toHaveBeenCalledTimes(1);
    const reloadedContent = mocks.createSourceEditor.mock.calls[0][1];
    expect(reloadedContent).toContain('# Hello');
    expect(reloadedContent).toContain('world');
    // It must not feed the v3-serialized (canonicalized) document back.
    expect(reloadedContent).not.toContain('| canonicalized marker |');
  });

  it('is safe to call at source-only (idempotent kill-switch)', () => {
    setMarkdown('[ref]: /url\n\n# x\n'); // source-only from the start
    expect(getMarkdownPipelineMode()).toBe('source-only');
    mocks.createSourceEditor.mockClear();
    degradeToSourceOnly(); // no-op-ish: stays source-only
    expect(getMarkdownPipelineMode()).toBe('source-only');
  });
});
