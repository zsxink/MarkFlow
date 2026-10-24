import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BlockImage, SafeHardBreak } from '../extensions';
import { imageSrcResolverPlugin } from '../image-resolver';
import { createMarkdownExtension } from '../init';

const mocks = vi.hoisted(() => ({
  getActiveDocPath: vi.fn(() => '/work/notes/note.md'),
  assetToOriginalMap: new Map<string, string>(),
  imagePathToSrc: vi.fn(() => 'asset://same-runtime-image'),
  getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })),
  store: { on: vi.fn(), off: vi.fn(), setState: vi.fn(), emit: vi.fn() },
}));

vi.mock('../state', () => ({
  getActiveDocPath: mocks.getActiveDocPath,
  assetToOriginalMap: mocks.assetToOriginalMap,
  getMermaidExportBaseName: vi.fn(),
  getPlantUmlExportBaseName: vi.fn(),
}));
vi.mock('../../infra/images/core', () => ({ imagePathToSrc: mocks.imagePathToSrc }));
vi.mock('../../infra/storage', () => ({ getCachedSettings: mocks.getCachedSettings }));
vi.mock('../../infra/store', () => ({ store: mocks.store }));
vi.mock('../../render/mermaid', () => ({ renderMermaid: vi.fn() }));
vi.mock('../../render/plantuml', () => ({ renderPlantUml: vi.fn() }));
vi.mock('../../render/plantuml-lazy', () => ({ isBlankPlantUmlSource: vi.fn(() => false) }));
vi.mock('../../infra/logger', () => ({ logDebug: vi.fn(), logWarn: vi.fn(), logException: vi.fn() }));
vi.mock('../../ui/mermaid-context-menu', () => ({ showMermaidContextMenu: vi.fn() }));
vi.mock('../../ui/plantuml-context-menu', () => ({ showPlantumlContextMenu: vi.fn() }));

afterEach(() => {
  mocks.assetToOriginalMap.clear();
  mocks.imagePathToSrc.mockClear();
});

describe('image resolver authored source retention', () => {
  it('keeps distinct node-local authored paths when both resolve to one runtime URL', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ hardBreak: false }),
        SafeHardBreak,
        BlockImage.configure({ allowBase64: true }),
        createMarkdownExtension(),
        imageSrcResolverPlugin(),
      ],
    });
    editor.commands.setContent({
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: './images/one.png', alt: 'one' } },
        { type: 'image', attrs: { src: 'images/two.png', alt: 'two' } },
      ],
    });

    const images: Array<Record<string, unknown>> = [];
    editor.state.doc.descendants(node => {
      if (node.type.name === 'image') images.push(node.attrs as Record<string, unknown>);
    });
    expect(images).toEqual([
      expect.objectContaining({ src: 'asset://same-runtime-image', authoredSrc: './images/one.png' }),
      expect.objectContaining({ src: 'asset://same-runtime-image', authoredSrc: 'images/two.png' }),
    ]);
    const markdown = editor.getMarkdown();
    expect(markdown).toContain('![one](./images/one.png)');
    expect(markdown).toContain('![two](images/two.png)');
    expect(markdown).not.toContain('authoredSrc');
    editor.destroy();
  });
});
