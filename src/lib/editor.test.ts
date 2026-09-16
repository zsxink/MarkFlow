import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSourceEditor: vi.fn(() => ({ focus: vi.fn() })),
  destroySourceEditor: vi.fn(),
  getSourceContent: vi.fn(),
  setSourceContent: vi.fn(),
  showToast: vi.fn(),
  logWarn: vi.fn(),
  cancel: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock('./editor.source', () => ({
  createSourceEditor: mocks.createSourceEditor,
  destroySourceEditor: mocks.destroySourceEditor,
  getSourceContent: mocks.getSourceContent,
  setSourceContent: mocks.setSourceContent,
}));
vi.mock('../components/toast', () => ({ showToast: mocks.showToast }));
vi.mock('./logger', () => ({ logWarn: mocks.logWarn }));
vi.mock('./taskScheduler', () => ({ scheduler: { cancel: mocks.cancel, schedule: mocks.schedule } }));

import { getMode, getRevision, setEditor, setMode, getDocumentState, assetToOriginalMap, setMarkdownPipelineMode } from './editor.state';
import { store } from './store';
import { getMarkdownResult, getSavePlan, setMarkdown, switchToSource, switchToWysiwyg } from './editor';

function editorDouble(overrides: Record<string, unknown> = {}) {
  return {
    commands: { setContent: vi.fn(), focus: vi.fn() },
    getJSON: vi.fn(() => ({ type: 'doc', content: [] })),
    getMarkdown: vi.fn(() => '# markdown'),
    ...overrides,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '<div id="wysiwyg-editor"></div><div id="source-editor-wrapper" hidden></div>';
  store.setState({ mode: 'wysiwyg', dirty: false, readOnly: false, autosaveErrorCount: 0 });
  const state = getDocumentState();
  state.externallyModified = false;
  state.programmaticUpdate = false;
  state.programmaticUpdateDepth = 0;
  state.lastPersistedMarkdown = '';
  state.revision = 0;
  state.sourceRevision = 0;
  state.trailingNewlines = 0;
  assetToOriginalMap.clear();
  setMarkdownPipelineMode('v3-compatible');
  mocks.getSourceContent.mockReturnValue('');
  setEditor(editorDouble());
});

describe('stage-one Markdown bridge integration', () => {
  it('loads Markdown with the v3 Markdown content type without dirtying or revising the document', () => {
    const editor = editorDouble();
    setEditor(editor);

    setMarkdown('# loaded\n\n');

    expect(editor.commands.setContent).toHaveBeenCalledWith('# loaded', { contentType: 'markdown', emitUpdate: false });
    expect(store.getState().dirty).toBe(false);
    expect(getRevision()).toBe(0);
    expect(getDocumentState().trailingNewlines).toBe(2);
  });

  it('resets dirty state when a source-only document is loaded after a dirty one', () => {
    // A reference-style link is classified `source-only` (kept in Source mode),
    // which early-returns from setMarkdown before the normal persisted-baseline
    // reset. The freshly loaded file must not inherit the previous dirty state.
    store.setState({ dirty: true, autosaveErrorCount: 1 });
    getDocumentState().lastPersistedMarkdown = '<previous-document-baseline>';

    setMarkdown('[text][ref]\n\n[ref]: https://example.com\n');

    expect(store.getState().dirty).toBe(false);
    expect(store.getState().autosaveErrorCount).toBe(0);
    // Source mode keeps the normalized content (including any trailing newline)
    // as the persisted baseline, not a WYSIWYG-stripped form.
    expect(getDocumentState().lastPersistedMarkdown).toBe('[text][ref]\n\n[ref]: https://example.com\n');
  });

  it('keeps an unedited WYSIWYG → Source round trip clean and restores original image URLs and tail newlines', () => {
    const editor = editorDouble({ getMarkdown: vi.fn(() => 'before ![](asset://runtime-image) after') });
    setEditor(editor);
    assetToOriginalMap.set('asset://runtime-image', 'images/original.png');
    getDocumentState().trailingNewlines = 2;

    switchToSource();

    const source = (mocks.createSourceEditor.mock.calls as unknown as Array<[HTMLElement, string]>)[0][1];
    expect(source).toBe('before ![](images/original.png) after\n\n');
    expect(store.getState().dirty).toBe(false);
    expect(getRevision()).toBe(0);
    expect(getMode()).toBe('source');
  });

  it('parses Source into WYSIWYG with the v3 Markdown content type and destroys Source only on success', () => {
    const editor = editorDouble({
      getMarkdown: vi.fn(() => '# source'),
      markdown: { parse: vi.fn(() => ({ type: 'doc', content: [] })) },
    });
    setEditor(editor);
    setMode('source');
    (document.getElementById('source-editor-wrapper') as HTMLElement).hidden = false;
    mocks.getSourceContent.mockReturnValue('# source\n\n');

    switchToWysiwyg();

    expect(editor.commands.setContent).toHaveBeenCalledWith('# source', { contentType: 'markdown', emitUpdate: false });
    expect(mocks.destroySourceEditor).toHaveBeenCalledOnce();
    expect(getMode()).toBe('wysiwyg');
  });

  it('keeps Source mounted and unchanged when Source → WYSIWYG parsing fails', () => {
    const editor = editorDouble({
      commands: { setContent: vi.fn(() => { throw new Error('bad source'); }), focus: vi.fn() },
    });
    setEditor(editor);
    setMode('source');
    const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement;
    wrapper.hidden = false;
    mocks.getSourceContent.mockReturnValue('unparseable source');

    switchToWysiwyg();

    expect(mocks.destroySourceEditor).not.toHaveBeenCalled();
    expect(getMode()).toBe('source');
    expect(wrapper.hidden).toBe(false);
    expect(mocks.showToast).toHaveBeenCalledWith('Markdown 无法安全转换，请继续在源码模式编辑');
  });

  it('uses the last persisted Source baseline when WYSIWYG serialization fails', () => {
    const editor = editorDouble();
    delete editor.getMarkdown;
    setEditor(editor);
    getDocumentState().lastPersistedMarkdown = '# safe baseline';

    switchToSource();

    expect(mocks.createSourceEditor).toHaveBeenCalledWith(
      document.getElementById('source-editor-wrapper'),
      '# safe baseline',
      expect.any(Function),
      false,
    );
    expect(getMode()).toBe('source');
    expect(mocks.showToast).toHaveBeenCalledWith('Markdown 序列化失败，已恢复到上次安全源码');
  });

  it('fails closed through production serialization and save-plan entry points when a verified session disappears', () => {
    setMode('wysiwyg');
    setMarkdownPipelineMode('reconcile');
    expect(getMarkdownResult()).toMatchObject({ ok: false, error: { code: 'reconcile-session-missing' } });
    expect(getSavePlan()).toEqual({ kind: 'conflict', write: false, code: 'session-missing' });
  });

  it('keeps an opaque reload in Source as raw authored markdown and no session-backed sentinel surface', () => {
    setMode('source');
    const opaque = '---\ntitle: raw\n---\n\n<!-- keep -->\n';
    setMarkdown(opaque);
    mocks.getSourceContent.mockReturnValue(opaque);
    expect(mocks.setSourceContent).toHaveBeenCalledWith(opaque);
    expect(mocks.setSourceContent).not.toHaveBeenCalledWith(expect.stringContaining('__MARKFLOW_OPAQUE'));
    expect(getMarkdownResult()).toEqual({ ok: true, markdown: opaque });
  });
});
