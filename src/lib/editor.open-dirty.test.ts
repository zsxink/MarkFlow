import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./storage', () => ({
  loadSettings: vi.fn(async () => ({})),
  getCachedSettings: vi.fn(() => ({})),
}));
vi.mock('./logger', () => ({ logDebug: vi.fn(), logWarn: vi.fn(), logException: vi.fn() }));

import { initEditor } from './editor.init';
import { setMarkdown } from './editor';
import { getDocumentState, getEditor, getRevision, setEditor } from './editor.state';
import { scheduler } from './taskScheduler';
import { store } from './store';

beforeEach(async () => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="editor-area"></div>';
  store.setState({ mode: 'wysiwyg', dirty: false, readOnly: false });
  await initEditor();
});

afterEach(() => {
  getEditor()?.destroy();
  setEditor(null);
  scheduler.cancelAll();
  vi.useRealTimers();
});

describe('opening without editing (production editor)', () => {
  it.each([
    '# Title\n\nbody',
    '# Title\n\nbody\n\n\n',
    '* first\n* second\n',
    '# Title\r\n\r\nbody\r\n',
    '---\ntitle: Example\n---\n\nbody\n',
    '',
  ])('editable-state updates leave the loaded document clean: %j', async (markdown) => {
    setMarkdown(markdown);
    const revision = getRevision();
    const baseline = getDocumentState().lastPersistedMarkdown;
    // Tiptap's default emits update even though no content has changed.
    getEditor()!.setEditable(true);
    getEditor()!.setEditable(false);
    getEditor()!.setEditable(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(getRevision()).toBe(revision);
    expect(store.getState().dirty).toBe(false);
    expect(getDocumentState().lastPersistedMarkdown).toBe(baseline);
  });

  it('a UI update does not cancel the pending dirty check for a real edit', async () => {
    setMarkdown('body');
    const revision = getRevision();
    getEditor()!.commands.insertContentAt(2, 'X');
    expect(getRevision()).toBeGreaterThan(revision);
    getEditor()!.setEditable(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(store.getState().dirty).toBe(true);
  });

  it('switching documents cancels a previous document edit check', async () => {
    setMarkdown('first');
    getEditor()!.commands.insertContentAt(2, 'X');
    setMarkdown('second\n\n');
    const revision = getRevision();
    getEditor()!.setEditable(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(getRevision()).toBe(revision);
    expect(store.getState().dirty).toBe(false);
  });
});
