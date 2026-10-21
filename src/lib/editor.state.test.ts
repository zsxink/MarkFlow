import { describe, expect, it, beforeEach } from 'vitest';
import {
  setMode,
  getMode,
  setActiveDocumentPath,
  getActiveDocPath,
  isDocumentDirty,
  hasExternalModification,
  markExternalModification,
  getMermaidExportBaseName,
  getPlantUmlExportBaseName,
  getDocumentState,
  bumpRevision,
  getRevision,
  setLastReadStats,
  getLastReadMtime,
  getLastReadSize,
  getMarkdownPipelineMode,
  isProgrammaticUpdate,
  setMarkdownPipelineMode,
  withProgrammaticUpdate,
} from './editor.state';
import { store } from './store';

beforeEach(() => {
  // Reset store to defaults so tests don't influence each other.
  store.setState({
    mode: 'wysiwyg',
    activeFilePath: null,
    workspacePath: null,
    expandedPaths: [],
    dirty: false,
  });
  // Reset module-level mutable state.
  getDocumentState().externallyModified = false;
  getDocumentState().programmaticUpdate = false;
  getDocumentState().programmaticUpdateDepth = 0;
  setMarkdownPipelineMode('v3-compatible');
  getDocumentState().lastPersistedMarkdown = '';
  getDocumentState().revision = 0;
  getDocumentState().trailingNewlines = 0;
  getDocumentState().lastReadMtime = 0;
  getDocumentState().lastReadSize = 0;
  // Clear DOM so getActiveDocPath() does not pick up stale elements.
  document.body.innerHTML = '';
});

describe('setMode / getMode', () => {
  it('stores the mode and retrieves it', () => {
    setMode('source');
    expect(getMode()).toBe('source');
  });

  it('stores a different mode', () => {
    setMode('wysiwyg');
    expect(getMode()).toBe('wysiwyg');
  });
});

describe('setActiveDocumentPath / getActiveDocPath', () => {
  it('returns null when no path is set and no DOM element exists', () => {
    expect(getActiveDocPath()).toBeNull();
  });

  it('reads from the store when no DOM element matches', () => {
    setActiveDocumentPath('/some/file.md');
    expect(getActiveDocPath()).toBe('/some/file.md');
  });

  it('prefers the DOM element over the store when both exist', () => {
    setActiveDocumentPath('/store/path.md');
    const el = document.createElement('div');
    el.className = 'tree-file active';
    el.dataset.path = '/dom/path.md';
    document.body.appendChild(el);

    expect(getActiveDocPath()).toBe('/dom/path.md');
  });

  it('falls back to the store when the DOM element has no dataset.path', () => {
    setActiveDocumentPath('/store/path.md');
    const el = document.createElement('div');
    el.className = 'tree-file active'; // no data-path attribute
    document.body.appendChild(el);

    expect(getActiveDocPath()).toBe('/store/path.md');
  });

  it('returns null after setting path to null', () => {
    setActiveDocumentPath('/some/file.md');
    setActiveDocumentPath(null);
    expect(getActiveDocPath()).toBeNull();
  });
});

describe('isDocumentDirty', () => {
  it('returns false by default', () => {
    expect(isDocumentDirty()).toBe(false);
  });

  it('returns true after dirty flag is set', () => {
    store.setState({ dirty: true });
    expect(isDocumentDirty()).toBe(true);
  });
});

describe('hasExternalModification / markExternalModification', () => {
  it('starts as false', () => {
    expect(hasExternalModification()).toBe(false);
  });

  it('returns true after being marked', () => {
    markExternalModification();
    expect(hasExternalModification()).toBe(true);
  });

  it('stays true after multiple calls', () => {
    markExternalModification();
    markExternalModification();
    expect(hasExternalModification()).toBe(true);
  });
});

describe.each([
  ['PlantUML', getPlantUmlExportBaseName, 'plantuml'],
  ['Mermaid', getMermaidExportBaseName, 'mermaid'],
] as const)('%s export base name', (_diagram, getBaseName, suffix) => {
  it('uses a diagram-specific fallback when no document is active', () => {
    expect(getBaseName()).toBe(`${suffix}-diagram`);
  });

  it.each([
    ['/path/to/report.md', `report-${suffix}`],
    ['/path/to/README', `README-${suffix}`],
    ['/path/to/my.file.name.md', `my.file.name-${suffix}`],
  ])('derives the base name from %s', (path, expected) => {
    setActiveDocumentPath(path);
    expect(getBaseName()).toBe(expected);
  });
});

describe('getMermaidExportBaseName hidden-file behavior', () => {
  it('uses full file name when the only dot is at position 0', () => {
    setActiveDocumentPath('/path/to/.gitignore');
    expect(getMermaidExportBaseName()).toBe('.gitignore-mermaid');
  });
});

describe('revision and file snapshot tracking', () => {
  it('increments revisions so an in-flight save can detect newer edits', () => {
    const saveRevision = getRevision();
    bumpRevision();
    expect(getRevision()).toBe(saveRevision + 1);
    expect(getRevision()).not.toBe(saveRevision);
  });

  it('stores the last-read mtime and size together', () => {
    setLastReadStats(1234, 56);
    expect(getLastReadMtime()).toBe(1234);
    expect(getLastReadSize()).toBe(56);
  });
});

describe('programmatic conversion guard and pipeline mode', () => {
  it('keeps the guard active until nested conversions complete', () => {
    withProgrammaticUpdate(() => {
      expect(isProgrammaticUpdate()).toBe(true);
      withProgrammaticUpdate(() => expect(isProgrammaticUpdate()).toBe(true));
      expect(isProgrammaticUpdate()).toBe(true);
    });
    expect(isProgrammaticUpdate()).toBe(false);
  });

  it('clears the guard when a conversion throws', () => {
    expect(() => withProgrammaticUpdate(() => { throw new Error('parse failed'); })).toThrow('parse failed');
    expect(isProgrammaticUpdate()).toBe(false);
  });

  it('keeps source-only as an explicit reduced-risk fallback mode', () => {
    setMarkdownPipelineMode('source-only');
    expect(getMarkdownPipelineMode()).toBe('source-only');
  });
});
