import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  getCachedSettings: vi.fn(() => ({})),
}));
vi.mock('../../infra/ui-ports', () => ({ uiPorts: { notify: mocks.notify } }));
vi.mock('../../infra/storage', () => ({ getCachedSettings: mocks.getCachedSettings }));
import { complexityLimitExtension } from '../complexity';

function makeEditor() {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, complexityLimitExtension()],
  });
}

/** `count` paragraphs (plus their text nodes and the doc node) in one JSON doc. */
function paragraphDoc(count: number, text = '') {
  return {
    type: 'doc',
    content: Array.from({ length: count }, () => ({
      type: 'paragraph',
      content: text ? [{ type: 'text', text }] : [],
    })),
  };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('complexityLimitExtension', () => {
  it('notifies with the default node bound when settings lack the fields', () => {
    // Pre-upgrade settings carry none of the limit fields; DEFAULT_SETTINGS applies.
    mocks.getCachedSettings.mockReturnValue({});
    const editor = makeEditor();
    editor.commands.setContent(paragraphDoc(10_001));
    expect(mocks.notify).toHaveBeenCalledWith('文档过大（节点数 10001，超过上限 10000），部分编辑功能已限制');
    editor.destroy();
  });

  it('notifies at a lowered custom node bound', () => {
    mocks.getCachedSettings.mockReturnValue({ wysiwygMaxNodes: 5, wysiwygMaxTextLength: 500_000 });
    const editor = makeEditor();
    editor.commands.setContent(paragraphDoc(6));
    expect(mocks.notify).toHaveBeenCalledWith('文档过大（节点数 6，超过上限 5），部分编辑功能已限制');
    editor.destroy();
  });

  it('notifies with the configured text-length bound and measured length', () => {
    mocks.getCachedSettings.mockReturnValue({ wysiwygMaxNodes: 10_000, wysiwygMaxTextLength: 10 });
    const editor = makeEditor();
    editor.commands.setContent(paragraphDoc(2, '0123456789'));
    expect(mocks.notify).toHaveBeenCalledWith('文档过大（文本长度 20 字符，超过上限 10），部分编辑功能已限制');
    editor.destroy();
  });

  it('stays silent below the effective bounds', () => {
    mocks.getCachedSettings.mockReturnValue({ wysiwygMaxNodes: 10_000, wysiwygMaxTextLength: 500_000 });
    const editor = makeEditor();
    editor.commands.setContent(paragraphDoc(10, 'plain text'));
    expect(mocks.notify).not.toHaveBeenCalled();
    editor.destroy();
  });
});
