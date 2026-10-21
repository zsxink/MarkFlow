import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

const mocks = vi.hoisted(() => ({
  setMarkdown: vi.fn(),
  setEditable: vi.fn(),
  discardActiveImageDraft: vi.fn(),
}));

vi.mock('../lib/editor', () => ({
  setMarkdown: mocks.setMarkdown,
  getEditor: vi.fn(() => ({ setEditable: mocks.setEditable })),
}));
vi.mock('./outline', () => ({ refreshOutline: vi.fn() }));
vi.mock('./degradationBar', () => ({ hideDegradationBar: vi.fn() }));
vi.mock('../lib/imageUtils', () => ({ discardActiveImageDraft: mocks.discardActiveImageDraft }));

import { store } from '../lib/store';
import { clearActiveDocument } from './activeDocument';

describe('active document image draft lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.setState({ activeFilePath: '/tmp/active.md', dirty: true, readOnly: true });
    mocks.discardActiveImageDraft.mockResolvedValue(undefined);
  });

  it('clears editor content and resets observable active-document state', () => {
    const editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit] });
    editor.commands.setContent('<p>active content</p>');
    mocks.setMarkdown.mockImplementation((markdown: string) => {
      if (markdown === '') editor.commands.clearContent();
    });
    mocks.setEditable.mockImplementation((editable: boolean) => editor.setEditable(editable));
    mocks.setMarkdown.mockClear();
    clearActiveDocument();
    expect(mocks.discardActiveImageDraft).toHaveBeenCalledOnce();
    expect(mocks.setMarkdown).toHaveBeenCalledWith('');
    expect(editor.getText()).toBe('');
    expect(mocks.setEditable).toHaveBeenCalledWith(true);
    expect(store.getState()).toMatchObject({ activeFilePath: null, dirty: false, readOnly: false });
    editor.destroy();
  });
});
