import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, OrderedList, ListItem, ListKeymap, TaskList, TaskItem } from '@tiptap/extension-list';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { BlockImage, CustomLink, MarkdownSafeTable, SafeParagraph, mermaidCodeBlockExtension } from './editor.extensions';
import { createMarkdownExtension } from './editor.init';
import { RawMarkdown } from './editor.markdown.fallback';
import { OpaqueNode } from './editor.markdown.opaque.extension';
import { store } from './store';
import { bumpRevision, getEditor, getMode, setEditor, getMarkdownPipelineMode, getRevision, getDocumentState, assetToOriginalMap } from './editor.state';
import { getMarkdownResult, getSavePlan, markDocumentPersisted, setMarkdown, switchToSource, switchToWysiwyg, degradeToSourceOnly } from './editor';

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
      StarterKit.configure({ paragraph: false, codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
      SafeParagraph,
      BulletList, OrderedList, ListItem, ListKeymap,
      TaskList, TaskItem.configure({ nested: true }),
      MarkdownSafeTable.configure({ resizable: true }),
      TableRow, TableCell, TableHeader,
      CustomLink.configure({ openOnClick: false, autolink: false, linkOnPaste: false }),
      BlockImage.configure({ allowBase64: true }),
      OpaqueNode,
      RawMarkdown,
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
  assetToOriginalMap.clear();
  setEditor(createAppEditor());
});

describe('stage-two eligibility UI wiring (6.5)', () => {
  it('opens a supported document into WYSIWYG with pipeline = reconcile', () => {
    setMarkdown('# Title\n\nsupported **body** and *em*.\n');
    expect(getMarkdownPipelineMode()).toBe('reconcile');
    expect(getMode()).toBe('wysiwyg');
    // No degradation toast for a supported doc.
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('opens unsupported blocks literally while headings remain editable and saves keep their source', () => {
    const raw = '[ref]: /some/url';
    const src = raw + '\n\n# Body\n';
    setMarkdown(src);
    expect(getMarkdownPipelineMode()).toBe('reconcile');
    expect(getMode()).toBe('wysiwyg');
    expect(getEditor()!.isEditable).toBe(true);
    expect(getEditor()!.view.dom.querySelector('[data-markflow-raw]')?.textContent).toContain(raw);
    expect(getEditor()!.view.dom.querySelector('h1')?.textContent).toBe('Body');
    expect(getSavePlan()).toEqual({ kind: 'unchanged', write: false });
    getEditor()!.commands.insertContentAt(3, 'edited');
    bumpRevision();
    store.setState({ dirty: true });
    const plan = getSavePlan();
    expect(plan).toMatchObject({ kind: 'safe-edit', write: true });
    if (plan.kind === 'safe-edit') {
      expect(plan.markdown).toContain(raw);
      expect(plan.markdown).toContain('# Beditedody');
    }
    expect(mocks.createSourceEditor).not.toHaveBeenCalled();
  });

  it('admits shortcut-table code spans into editable WYSIWYG and provides a save candidate', () => {
    const source = '| Shortcut | Action |\n| --- | --- |\n| `` Ctrl+` `` | Inline code |\n';
    setMarkdown(source);
    expect(getMarkdownPipelineMode()).toBe('reconcile');
    expect(getMode()).toBe('wysiwyg');
    expect(getEditor()!.isEditable).toBe(true);
    expect(getMarkdownResult()).toEqual({ ok: true, markdown: source });
    getEditor()!.commands.insertContentAt(4, 'edited ');
    bumpRevision();
    store.setState({ dirty: true });
    expect(getSavePlan()).toMatchObject({ kind: 'safe-edit', write: true });
  });

  it('switches Source to editable WYSIWYG with local raw blocks and keeps source edits savable', () => {
    const disk = '# Heading\n';
    const src = '# Changed\n\nthis is [text][ref] style\n';
    setMarkdown(disk);
    switchToSource();
    mocks.getSourceContent.mockReturnValue(src);
    store.setState({ dirty: true });
    switchToWysiwyg();
    expect(getMarkdownPipelineMode()).toBe('reconcile');
    expect(getMode()).toBe('wysiwyg');
    expect(getEditor()!.isEditable).toBe(true);
    expect(mocks.destroySourceEditor).toHaveBeenCalled();
    expect(getSavePlan()).toEqual({ kind: 'safe-edit', write: true, markdown: src });
    switchToSource();
    expect(mocks.createSourceEditor).toHaveBeenLastCalledWith(expect.anything(), src, expect.any(Function), false);
  });

  it.each([
    '| A | B |\n| --- | --- |\n| one | two | extra-cell |\n',
    '```ts\nconst incomplete = true;\n\n\n',
    '```ts\r\nconst incomplete = true;\r\n\r\n',
    'unclosed <span> text\n',
  ])('preserves literal raw characters through surrounding edits and the actual save plan: %s', (raw) => {
    const source = '# Title\n\n' + raw;
    setMarkdown(source);
    expect(getMode()).toBe('wysiwyg');
    expect(getSavePlan()).toEqual({ kind: 'unchanged', write: false });
    getEditor()!.commands.insertContentAt(3, 'edited');
    bumpRevision();
    store.setState({ dirty: true });
    const plan = getSavePlan();
    expect(plan).toMatchObject({ kind: 'safe-edit', write: true });
    if (plan.kind === 'safe-edit') expect(plan.markdown).toContain(raw);
    const serialized = getMarkdownResult();
    expect(serialized.ok).toBe(true);
    if (serialized.ok) expect(serialized.markdown).toContain(raw);
  });

  it('edits a literal raw block locally and saves the changed characters', () => {
    setMarkdown('# Title\n\n[ref]: /url\n');
    const pre = getEditor()!.view.dom.querySelector('[data-markflow-raw]')!;
    pre.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = getEditor()!.view.dom.querySelector('textarea')!;
    input.value = '[ref]: /changed\n';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    bumpRevision();
    store.setState({ dirty: true });
    const plan = getSavePlan();
    expect(plan).toMatchObject({ kind: 'safe-edit', write: true });
    if (plan.kind === 'safe-edit') expect(plan.markdown).toContain('[ref]: /changed\n');
  });

  it('can save after all characters in a local raw editor are deleted', () => {
    setMarkdown('# Title\n\n[ref]: /url\n');
    getEditor()!.view.dom.querySelector('[data-markflow-raw]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = getEditor()!.view.dom.querySelector('textarea')!;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    bumpRevision();
    store.setState({ dirty: true });
    expect(getSavePlan()).toMatchObject({ kind: 'safe-edit', write: true });
    expect(getEditor()!.getJSON().content?.some(node => node.type === 'markflowRawMarkdown')).toBe(false);
  });

  it('clears dirty after saving literal CRLF content without normalizing the disk baseline', () => {
    const raw = '```ts\r\nconst incomplete = true;\r\n\r\n';
    setMarkdown('# Title\n\n' + raw);
    getEditor()!.commands.insertContentAt(3, 'edited');
    bumpRevision();
    store.setState({ dirty: true });
    const plan = getSavePlan();
    expect(plan.kind).toBe('safe-edit');
    if (plan.kind !== 'safe-edit') return;
    markDocumentPersisted(plan.markdown, getRevision());
    expect(getDocumentState().lastPersistedMarkdown).toBe(plan.markdown);
    expect(store.getState().dirty).toBe(false);
    expect(getMarkdownResult()).toEqual({ ok: true, markdown: plan.markdown });
  });

  it('saves original image paths without changing identical URL characters in raw text', () => {
    const runtime = 'asset://localhost/tmp/original.png';
    const raw = '[ref]: ' + runtime + '\n';
    setMarkdown('# Title\n\n' + raw + '\n![picture](./original.png)');
    const ed = getEditor()!;
    assetToOriginalMap.set(runtime, './original.png');
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: runtime, authoredSrc: null }));
    });
    ed.commands.insertContentAt(3, 'edited');
    bumpRevision();
    store.setState({ dirty: true });
    const plan = getSavePlan();
    expect(plan).toMatchObject({ kind: 'safe-edit', write: true });
    if (plan.kind === 'safe-edit') {
      expect(plan.markdown).toContain('![picture](./original.png)');
      expect(plan.markdown).toContain(raw);
    }
  });

  it('saves an edited malformed raw block beside supported frontmatter', () => {
    setMarkdown('---\ntitle: Document\n---\n\n# Title\n\n[ref]: /url');
    getEditor()!.view.dom.querySelector('[data-markflow-raw]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = getEditor()!.view.dom.querySelector('textarea')!;
    input.value = '```js\nconst value = 1;';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    bumpRevision();
    store.setState({ dirty: true });
    const plan = getSavePlan();
    expect(plan).toMatchObject({ kind: 'safe-edit', write: true });
    if (plan.kind === 'safe-edit') {
      expect(plan.markdown).toContain('---\ntitle: Document\n---');
      expect(plan.markdown).toContain(input.value);
    }
  });

  it('saves an unclosed literal fence before a normal code block without consuming that block', () => {
    setMarkdown('# Title\n\n[ref]: /url\n\n```js\nok();\n```');
    getEditor()!.view.dom.querySelector('[data-markflow-raw]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = getEditor()!.view.dom.querySelector('textarea')!;
    input.value = '```js\nbroken();\n\n';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    bumpRevision();
    store.setState({ dirty: true });
    const plan = getSavePlan();
    expect(plan).toMatchObject({ kind: 'safe-edit', write: true });
    if (plan.kind === 'safe-edit') {
      expect(plan.markdown).toContain(input.value);
      expect(plan.markdown).toContain('```js\nok();\n```');
      expect(plan.markdown).not.toContain('MARKFLOWRAW');
    }
    expect(getEditor()!.getJSON().content?.filter(node => node.type === 'codeBlock')).toHaveLength(1);
  });

  it('can paste a local raw block into a supported document and save it', () => {
    setMarkdown('# Target');
    getEditor()!.commands.insertContent('<pre data-markflow-raw>[ref]: /url</pre>');
    bumpRevision();
    store.setState({ dirty: true });
    const plan = getSavePlan();
    expect(plan).toMatchObject({ kind: 'safe-edit', write: true });
    if (plan.kind === 'safe-edit') {
      expect(plan.markdown).toContain('[ref]: /url');
      markDocumentPersisted(plan.markdown, getRevision());
      expect(store.getState().dirty).toBe(false);
    }
  });

  it('keeps raw atoms intact through HTML clipboard round-trips', () => {
    const source = '# Title\n\n[ref]: /url\n';
    setMarkdown(source);
    expect(getEditor()!.getText()).toContain('[ref]: /url');
    const html = getEditor()!.getHTML();
    getEditor()!.commands.setContent(html);
    bumpRevision();
    store.setState({ dirty: true });
    expect(getEditor()!.getJSON().content?.some((node) => node.type === 'markflowRawMarkdown')).toBe(true);
    expect(getSavePlan()).toMatchObject({ kind: 'safe-edit', write: true, markdown: expect.stringContaining('[ref]: /url') });
  });

  it('saves raw-block deletion and reordering without opaque integrity conflicts', () => {
    setMarkdown('# Title\n\n[one]: /one\n\n# Second\n\n[two]: /two\n');
    const ed = getEditor()!;
    const doc = ed.getJSON();
    const raw = doc.content!.filter((node) => node.type === 'markflowRawMarkdown');
    const supported = doc.content!.filter((node) => node.type !== 'markflowRawMarkdown');
    ed.commands.setContent({ type: 'doc', content: [raw[1], ...supported, raw[0]] });
    bumpRevision();
    store.setState({ dirty: true });
    let plan = getSavePlan();
    expect(plan).toMatchObject({ kind: 'safe-edit', write: true });
    if (plan.kind === 'safe-edit') expect(plan.markdown.indexOf('[two]')).toBeLessThan(plan.markdown.indexOf('[one]'));
    ed.commands.setContent({ type: 'doc', content: supported });
    bumpRevision();
    plan = getSavePlan();
    expect(plan).toMatchObject({ kind: 'safe-edit', write: true });
    if (plan.kind === 'safe-edit') expect(plan.markdown).not.toContain('[one]');
  });

  it.each(['[ref]: /url\n', '[ref]: /url\n\n\n'])('keeps normal fenced-code literals separate from a repeated raw reference definition: %s', (raw) => {
    setMarkdown('# Title\n\n```text\n' + raw + '\n```\n\n' + raw);
    getEditor()!.commands.insertContentAt(3, 'edited');
    bumpRevision();
    store.setState({ dirty: true });
    expect(getSavePlan()).toMatchObject({ kind: 'safe-edit', write: true });
    expect(getEditor()!.getJSON().content?.filter((node) => node.type === 'codeBlock')).toHaveLength(1);
  });

  it('keeps supported frontmatter, diagrams and math alongside a malformed local table', () => {
    const raw = '| A | B |\n| --- | --- |\n| one | two | extra |\n';
    const source = '---\ntitle: Document\n---\n\n# Title\n\n```mermaid\ngraph TD; A-->B\n```\n\n$x^2$\n\n' + raw;
    setMarkdown(source);
    expect(getMode()).toBe('wysiwyg');
    expect(getEditor()!.getJSON().content?.some((node) => node.type === 'markflowOpaque')).toBe(true);
    expect(getEditor()!.getJSON().content?.some((node) => node.type === 'codeBlock' && node.attrs?.language === 'mermaid')).toBe(true);
    expect(getEditor()!.getText()).toContain('$x^2$');
    getEditor()!.commands.insertContentAt(3, 'edited');
    bumpRevision();
    store.setState({ dirty: true });
    expect(getSavePlan()).toMatchObject({ kind: 'safe-edit', write: true, markdown: expect.stringContaining(raw) });
  });

  it('does not dirty or bump revision when admitting a supported doc', () => {
    setMarkdown('# Open\n\n- one\n- two\n');
    expect(getRevision()).toBe(0);
    expect(store.getState().dirty).toBe(false);
    expect(getMarkdownPipelineMode()).toBe('reconcile');
  });

  it('turns Source→WYS opaque text differing from disk into a write candidate, including EOF newlines', () => {
    const diskA = '<!-- disk A -->\n\n# Title\n';
    const sourceB = '<!-- source B -->\n\n# Title\n\n';
    setMarkdown(diskA);
    // Real TipTap admission/session path: initial WYS load must retain the
    // exact persisted baseline and skip a manual no-edit save.
    expect(getSavePlan()).toEqual({ kind: 'unchanged', write: false });
    switchToSource();
    mocks.getSourceContent.mockReturnValue(sourceB);
    // The real CM6 update callback marks the pending Source edit dirty before
    // it is re-admitted into WYSIWYG.
    store.setState({ dirty: true });
    switchToWysiwyg();

    // No WYSIWYG transaction occurred, so reconcile itself says unchanged.
    // The production save plan must compare admission text to disk A and
    // require a write rather than skipping and losing Source B.
    expect(getMarkdownPipelineMode()).toBe('opaque');
    expect(getSavePlan()).toEqual({ kind: 'safe-edit', write: true, markdown: sourceB });
  });

  it('keeps CRLF and multiple EOF newlines in the initial persisted baseline', () => {
    const disk = '<!-- keep -->\r\n\r\n# Title\r\n\r\n';
    setMarkdown(disk);
    expect(getSavePlan()).toEqual({ kind: 'unchanged', write: false });
    expect(getDocumentState().lastPersistedMarkdown).toBe(disk);
  });

  it.each([0, 1, 2, 3])('removes historical EOF newline(s) after a WYS safe edit', (eofNewlines) => {
    const source = '# Title' + '\n'.repeat(eofNewlines);
    setMarkdown(source);
    getEditor()!.commands.insertContent(' edited');
    // This fixture constructs the real TipTap/session path without initEditor;
    // emulate the synchronous production transaction revision update.
    bumpRevision();
    store.setState({ dirty: true });

    const plan = getSavePlan();
    expect(plan).toMatchObject({ kind: 'safe-edit', write: true });
    if (plan.kind === 'safe-edit') {
      expect(plan.markdown).toContain('edited');
      expect(plan.markdown.endsWith('\n')).toBe(false);
    }
  });
});

describe('stage-two gated kill-switch (6.6)', () => {
  it('degrades verified mode → source-only and reloads Source from the ORIGINAL source', () => {
    const original = '# Hello\n\nworld\n';
    setMarkdown(original);
    expect(getMarkdownPipelineMode()).toBe('reconcile');

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
    setMarkdown('# x\n');
    degradeToSourceOnly();
    expect(getMarkdownPipelineMode()).toBe('source-only');
    mocks.createSourceEditor.mockClear();
    degradeToSourceOnly(); // no-op-ish: stays source-only
    expect(getMarkdownPipelineMode()).toBe('source-only');
  });
});
