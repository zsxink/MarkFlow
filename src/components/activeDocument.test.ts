import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setMarkdown: vi.fn(),
  setEditable: vi.fn(),
  setState: vi.fn(),
  discardActiveImageDraft: vi.fn(),
}));

vi.mock('../lib/editor', () => ({
  setMarkdown: mocks.setMarkdown,
  getEditor: vi.fn(() => ({ setEditable: mocks.setEditable })),
}));
vi.mock('../lib/store', () => ({
  store: {
    getState: vi.fn(() => ({ activeFilePath: null })),
    setState: mocks.setState,
  },
}));
vi.mock('./outline', () => ({ refreshOutline: vi.fn() }));
vi.mock('./degradationBar', () => ({ hideDegradationBar: vi.fn() }));
vi.mock('../lib/imageUtils', () => ({ discardActiveImageDraft: mocks.discardActiveImageDraft }));

import { clearActiveDocument } from './activeDocument';

describe('active document image draft lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.discardActiveImageDraft.mockResolvedValue(undefined);
  });

  it('starts backend draft cleanup when the active document is cleared', () => {
    clearActiveDocument();
    expect(mocks.discardActiveImageDraft).toHaveBeenCalledOnce();
    expect(mocks.setMarkdown).toHaveBeenCalledWith('');
  });
});
