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
  getDocumentState,
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
  getDocumentState().lastPersistedMarkdown = '';
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

describe('getMermaidExportBaseName', () => {
  it('returns "mermaid-diagram" when no active document path', () => {
    expect(getMermaidExportBaseName()).toBe('mermaid-diagram');
  });

  it('derives base name from document file name with extension', () => {
    setActiveDocumentPath('/path/to/report.md');
    expect(getMermaidExportBaseName()).toBe('report-mermaid');
  });

  it('handles document path without extension', () => {
    setActiveDocumentPath('/path/to/README');
    expect(getMermaidExportBaseName()).toBe('README-mermaid');
  });

  it('handles document with multiple dots in the name', () => {
    setActiveDocumentPath('/path/to/my.file.name.md');
    expect(getMermaidExportBaseName()).toBe('my.file.name-mermaid');
  });

  it('uses full file name when the only dot is at position 0 (hidden file)', () => {
    setActiveDocumentPath('/path/to/.gitignore');
    expect(getMermaidExportBaseName()).toBe('.gitignore-mermaid');
  });
});
