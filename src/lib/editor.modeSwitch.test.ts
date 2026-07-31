import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const storeState = {
    mode: 'source' as 'source' | 'wysiwyg',
    dirty: false,
    readOnly: false,
    activeFilePath: '/docs/m5.md',
  };
  const documentState = {
    externallyModified: false,
    programmaticUpdate: false,
    lastPersistedMarkdown: '## Hi',
    revision: 0,
    lastReadMtime: 0,
    lastReadSize: 0,
    trailingNewlines: 0,
  };
  const legacyEditor = {
    commands: {
      setContent: vi.fn(),
      focus: vi.fn(),
    },
    storage: {
      markdown: {
        getMarkdown: vi.fn(() => 'legacy markdown'),
      },
    },
    state: {
      doc: { textContent: 'legacy text' },
    },
  };
  const sourceView = { focus: vi.fn(), dispatch: vi.fn() };
  const coreWysiwygView = { focus: vi.fn(), dispatch: vi.fn() };
  const controller = {
    flush: vi.fn(async () => 7),
    detach: vi.fn(),
    attach: vi.fn(),
    processTransactions: vi.fn(),
  };
  const sessionState = {
    sessionId: 42,
    documentId: 8,
    confirmedRevision: 7,
    persistedRevision: 7,
    pendingCount: 0,
    pendingBytes: 0,
    syncState: 'idle',
    isActive: true,
    filePath: '/docs/m5.md',
    sizeClass: 'normal',
    stats: { lineCount: 1, byteCount: 5 },
  };
  const flags = {
    coreBackedSourceModeEnabled: true,
  };

  return {
    storeState,
    documentState,
    legacyEditor,
    sourceView,
    coreWysiwygView,
    controller,
    sessionState,
    flags,
    createSourceEditor: vi.fn(() => sourceView),
    createCoreWysiwygEditor: vi.fn(() => coreWysiwygView),
    destroySourceEditor: vi.fn(),
    getSourceContent: vi.fn(() => '## Hi\n'),
    setSourceContent: vi.fn(),
    closeCoreSession: vi.fn(async () => undefined),
    openCoreSession: vi.fn(),
    setSourceSyncController: vi.fn(),
    normalizeImageMarkdown: vi.fn((value: string) => value),
    replaceAssetUrlsWithOriginal: vi.fn((value: string) => value),
    extractDocAsFallback: vi.fn(() => 'fallback'),
    checkSerializationIntegrity: vi.fn(() => ({ truncated: false })),
    logDebug: vi.fn(),
    logException: vi.fn(),
    showToast: vi.fn(),
    showDegradationBar: vi.fn(),
    hideDegradationBar: vi.fn(),
    saveActiveDocument: vi.fn(),
  };
});

vi.mock('./editor.state', () => ({
  assetToOriginalMap: new Map(),
  getEditor: () => mocks.legacyEditor,
  getDocumentState: () => mocks.documentState,
  getMode: () => mocks.storeState.mode,
  setMode: (mode: 'source' | 'wysiwyg') => {
    mocks.storeState.mode = mode;
  },
  isDocumentDirty: () => mocks.storeState.dirty,
  hasExternalModification: vi.fn(() => false),
  markExternalModification: vi.fn(),
  setActiveDocumentPath: vi.fn(),
  bumpRevision: vi.fn(() => ++mocks.documentState.revision),
  getRevision: vi.fn(() => mocks.documentState.revision),
  getLastReadMtime: vi.fn(() => 0),
  getLastReadSize: vi.fn(() => 0),
  setLastReadStats: vi.fn(),
  getActiveDocPath: vi.fn(() => '/docs/m5.md'),
}));

vi.mock('./store', () => ({
  store: {
    getState: () => ({ ...mocks.storeState }),
    setState: vi.fn((partial: Partial<typeof mocks.storeState>) => {
      Object.assign(mocks.storeState, partial);
    }),
    emit: vi.fn(),
  },
}));

vi.mock('./taskScheduler', () => ({
  scheduler: { cancel: vi.fn(), schedule: vi.fn() },
}));

vi.mock('./editor.source', () => ({
  createSourceEditor: mocks.createSourceEditor,
  createCoreWysiwygEditor: mocks.createCoreWysiwygEditor,
  destroySourceEditor: mocks.destroySourceEditor,
  getSourceContent: mocks.getSourceContent,
  setSourceContent: mocks.setSourceContent,
}));

vi.mock('./coreSession', () => ({
  openCoreSession: mocks.openCoreSession,
  closeCoreSession: mocks.closeCoreSession,
  isCoreBackedSourceModeEnabled: vi.fn(() => mocks.flags.coreBackedSourceModeEnabled),
  getCoreSessionState: () => ({ ...mocks.sessionState }),
  setSourceSyncController: mocks.setSourceSyncController,
  getSourceSyncController: () => mocks.controller,
}));

vi.mock('./editor.helpers', () => ({
  checkSerializationIntegrity: mocks.checkSerializationIntegrity,
}));

vi.mock('./editor.serializer', () => ({
  normalizeImageMarkdown: mocks.normalizeImageMarkdown,
  replaceAssetUrlsWithOriginal: mocks.replaceAssetUrlsWithOriginal,
  extractDocAsFallback: mocks.extractDocAsFallback,
}));

vi.mock('../components/toast', () => ({ showToast: mocks.showToast }));
vi.mock('./logger', () => ({
  logDebug: mocks.logDebug,
  logException: mocks.logException,
}));
vi.mock('../components/degradationBar', () => ({
  showDegradationBar: mocks.showDegradationBar,
  hideDegradationBar: mocks.hideDegradationBar,
}));
vi.mock('../components/sidebar', () => ({
  saveActiveDocument: mocks.saveActiveDocument,
}));
vi.mock('./fileSizeTier', () => ({ formatFileSize: vi.fn(() => '5 B') }));
vi.mock('./SourceSyncController', () => ({
  SourceSyncController: vi.fn(() => mocks.controller),
}));
vi.mock('./editor.stats', () => ({
  getWordCount: vi.fn(() => 0),
  getLineCount: vi.fn(() => 0),
  getCursorPos: vi.fn(() => ({ line: 1, col: 1 })),
}));
vi.mock('./editor.init', () => ({ initEditor: vi.fn() }));

describe('Core-backed WYSIWYG mode switch integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storeState.mode = 'source';
    mocks.storeState.dirty = false;
    mocks.documentState.lastPersistedMarkdown = '## Hi';
    mocks.documentState.trailingNewlines = 0;
    mocks.sessionState.isActive = true;
    mocks.sessionState.confirmedRevision = 7;
    mocks.flags.coreBackedSourceModeEnabled = true;
    mocks.getSourceContent.mockReturnValue('## Hi\n');
    mocks.saveActiveDocument.mockResolvedValue('saved');
    document.body.innerHTML = `
      <div id="wysiwyg-editor"></div>
      <div id="source-editor-wrapper"></div>
    `;
  });

  it('round-trips Source and Core WYSIWYG without legacy setContent or serializer', async () => {
    const editor = await import('./editor');
    const wysiwygEditor = document.getElementById('wysiwyg-editor') as HTMLElement;
    const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement;

    await editor.switchToWysiwyg();

    expect(editor.getWysiwygEngine()).toBe('core-codemirror');
    expect(editor.isCoreBackedWysiwygActive()).toBe(true);
    expect(mocks.createCoreWysiwygEditor).toHaveBeenCalledWith(
      wrapper,
      '## Hi\n',
      expect.any(Object),
      expect.any(Function),
      false,
      expect.any(Function),
    );
    expect(mocks.legacyEditor.commands.setContent).not.toHaveBeenCalled();
    expect(mocks.legacyEditor.storage.markdown.getMarkdown).not.toHaveBeenCalled();
    expect(mocks.closeCoreSession).not.toHaveBeenCalled();
    expect(wysiwygEditor.hidden).toBe(true);
    expect(wrapper.hidden).toBe(false);
    expect(wrapper.dataset.coreWysiwyg).toBe('true');
    expect(editor.getCurrentSourceMarkdown()).toBe('## Hi\n');
    expect(mocks.legacyEditor.storage.markdown.getMarkdown).not.toHaveBeenCalled();

    await editor.switchToSource();

    expect(mocks.createSourceEditor).toHaveBeenCalledWith(
      wrapper,
      '## Hi\n',
      expect.any(Function),
      false,
      expect.any(Function),
    );
    expect(editor.getWysiwygEngine()).toBe('legacy-prosemirror');
    expect(mocks.legacyEditor.commands.setContent).not.toHaveBeenCalled();
    expect(mocks.legacyEditor.storage.markdown.getMarkdown).not.toHaveBeenCalled();
    expect(mocks.closeCoreSession).not.toHaveBeenCalled();
    expect(mocks.storeState.mode).toBe('source');
    expect(wrapper.dataset.coreWysiwyg).toBeUndefined();
    expect(editor.getCurrentSourceMarkdown()).toBe('## Hi\n');
  });

  it('does not fall back to legacy ProseMirror when Core WYSIWYG feature flag is disabled', async () => {
    mocks.flags.coreBackedSourceModeEnabled = false;
    const editor = await import('./editor');
    const wysiwygEditor = document.getElementById('wysiwyg-editor') as HTMLElement;
    const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement;

    await editor.switchToWysiwyg();
    await Promise.resolve();

    expect(mocks.createCoreWysiwygEditor).not.toHaveBeenCalled();
    expect(mocks.legacyEditor.commands.setContent).not.toHaveBeenCalled();
    expect(mocks.closeCoreSession).not.toHaveBeenCalled();
    expect(editor.getWysiwygEngine()).toBe('legacy-prosemirror');
    expect(editor.isCoreBackedWysiwygActive()).toBe(false);
    expect(mocks.storeState.mode).toBe('source');
    expect(wysiwygEditor.hidden).toBe(false);
    expect(wrapper.hidden).toBe(false);
    expect(wrapper.dataset.coreWysiwyg).toBeUndefined();
    expect(mocks.showToast).toHaveBeenCalledWith('所见即所得模式需要 Core 会话，当前文档暂不能切换');
  });

  it('does not switch away from dirty legacy WYSIWYG when save fails closed', async () => {
    mocks.storeState.mode = 'wysiwyg';
    mocks.storeState.dirty = true;
    mocks.sessionState.isActive = false;
    mocks.saveActiveDocument.mockResolvedValue('failed');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const editor = await import('./editor');

    await editor.switchToSource();

    expect(mocks.saveActiveDocument).toHaveBeenCalledOnce();
    expect(mocks.createSourceEditor).not.toHaveBeenCalled();
    expect(mocks.storeState.mode).toBe('wysiwyg');
  });

  it('sets a WYSIWYG document baseline without reading Core source content', async () => {
    mocks.storeState.mode = 'wysiwyg';
    mocks.getSourceContent.mockImplementation(() => {
      throw new Error('source should not be read');
    });
    const editor = await import('./editor');

    expect(() => editor.setMarkdown('# opened\n')).not.toThrow();

    expect(mocks.legacyEditor.commands.setContent).toHaveBeenCalledWith('# opened');
    expect(mocks.documentState.lastPersistedMarkdown).toBe('# opened');
  });
});
