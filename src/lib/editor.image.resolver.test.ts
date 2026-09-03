import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BlockImage } from './editor.extensions';
import { imageSrcResolverPlugin } from './editor.image.resolver';
import { createMarkdownExtension } from './editor.init';

const mocks = vi.hoisted(() => ({
  getActiveDocPath: vi.fn(() => '/work/notes/note.md'),
  assetToOriginalMap: new Map<string, string>(),
  imagePathToSrc: vi.fn(() => 'asset://same-runtime-image'),
  getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })),
  store: { on: vi.fn(), off: vi.fn(), setState: vi.fn(), emit: vi.fn() },
}));

vi.mock('./editor.state', () => ({
  getActiveDocPath: mocks.getActiveDocPath,
  assetToOriginalMap: mocks.assetToOriginalMap,
  getMermaidExportBaseName: vi.fn(),
  getPlantUmlExportBaseName: vi.fn(),
}));
vi.mock('./imageUtils', () => ({ imagePathToSrc: mocks.imagePathToSrc }));
vi.mock('./storage', () => ({ getCachedSettings: mocks.getCachedSettings }));
vi.mock('./store', () => ({ store: mocks.store }));
vi.mock('./mermaid', () => ({ renderMermaid: vi.fn() }));
vi.mock('./plantuml', () => ({ renderPlantUml: vi.fn() }));
vi.mock('./plantuml-lazy', () => ({ isBlankPlantUmlSource: vi.fn(() => false) }));
vi.mock('./logger', () => ({ logDebug: vi.fn(), logWarn: vi.fn(), logException: vi.fn() }));
vi.mock('../components/mermaidContextMenu', () => ({ showMermaidContextMenu: vi.fn() }));
vi.mock('../components/plantumlContextMenu', () => ({ showPlantumlContextMenu: vi.fn() }));

afterEach(() => {
  mocks.assetToOriginalMap.clear();
  mocks.imagePathToSrc.mockClear();
});

describe('image resolver authored source retention', () => {
  it('keeps distinct node-local authored paths when both resolve to one runtime URL', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit,
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
