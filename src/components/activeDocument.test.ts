import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setMarkdown: vi.fn(),
  setEditable: vi.fn(),
  setState: vi.fn(),
  discardActiveImageDraft: vi.fn(),
  getActiveLosslessBinding: vi.fn(() => null),
  isLosslessCoreSessionEnabled: vi.fn(() => false),
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
vi.mock('../lib/lossless/registry', () => ({ getActiveLosslessBinding: mocks.getActiveLosslessBinding }));
vi.mock('../lib/lossless/flag', () => ({ isLosslessCoreSessionEnabled: mocks.isLosslessCoreSessionEnabled }));
vi.mock('../lib/lossless/integration', () => ({ closeLosslessActiveDocument: vi.fn(() => Promise.resolve()) }));

import { clearActiveDocument } from './activeDocument';

describe('active document image draft lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.discardActiveImageDraft.mockResolvedValue(undefined);
    mocks.getActiveLosslessBinding.mockReturnValue(null);
    mocks.isLosslessCoreSessionEnabled.mockReturnValue(false);
  });

  it('starts backend draft cleanup when the active document is cleared', () => {
    clearActiveDocument();
    expect(mocks.discardActiveImageDraft).toHaveBeenCalledOnce();
    expect(mocks.setMarkdown).toHaveBeenCalledWith('');
  });

  it('does NOT touch the hidden ProseMirror when clearing a lossless doc (reviewer F2)', async () => {
    mocks.isLosslessCoreSessionEnabled.mockReturnValue(true);
    mocks.getActiveLosslessBinding.mockReturnValue({ path: '/x.md' } as never);

    clearActiveDocument();

    // The lossless path must never call setMarkdown('') on the hidden PM.
    expect(mocks.setMarkdown).not.toHaveBeenCalled();
    // The active binding is disposed (flush/close) via the integration module.
    await vi.dynamicImportSettled();
    // discard draft still runs (draft lifecycle is shared).
    expect(mocks.discardActiveImageDraft).toHaveBeenCalledOnce();
  });
});