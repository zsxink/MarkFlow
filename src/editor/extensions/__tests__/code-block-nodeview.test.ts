import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

const { renderMermaid, renderPlantUml, isBlankPlantUmlSource, getCachedSettings, store } = vi.hoisted(() => ({
  renderMermaid: vi.fn(async () => '<svg>ok</svg>'),
  renderPlantUml: vi.fn(async () => '<svg>ok</svg>'),
  isBlankPlantUmlSource: vi.fn(() => false),
  getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })),
  store: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('../../../render/mermaid', () => ({ renderMermaid }));
vi.mock('../../../render/plantuml', () => ({ renderPlantUml }));
vi.mock('../../../render/plantuml-lazy', () => ({ isBlankPlantUmlSource }));
vi.mock('../../../infra/storage', () => ({ getCachedSettings }));
vi.mock('../../../infra/store', () => ({ store }));
vi.mock('../../state', () => ({ getMermaidExportBaseName: vi.fn(), getPlantUmlExportBaseName: vi.fn() }));

import { mermaidCodeBlockExtension } from '../code-block';

function createEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      mermaidCodeBlockExtension(),
    ],
  });
}

function setCodeContent(editor: Editor, language: string | null, code: string) {
  const langClass = language ? ` class="language-${language}"` : '';
  editor.commands.setContent(`<pre><code${langClass}>${code}</code></pre>`);
}

describe('code block NodeView toolbar', () => {
  it('mounts the toolbar on plain code blocks with the current language', () => {
    const editor = createEditor();
    setCodeContent(editor, 'ts', 'const a = 1;');
    const block = editor.view.dom.querySelector('.code-block-view');
    expect(block).toBeTruthy();
    const toolbar = block!.querySelector('.code-block-toolbar');
    expect(toolbar).toBeTruthy();
    expect(toolbar!.querySelector('.code-block-lang-label')?.textContent).toBe('ts');
    editor.destroy();
  });

  it('shows 纯文本 for code blocks without a language', () => {
    const editor = createEditor();
    setCodeContent(editor, null, 'plain');
    expect(editor.view.dom.querySelector('.code-block-lang-label')?.textContent).toBe('纯文本');
    editor.destroy();
  });

  it('copies node source text via clipboard without touching the document', () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const editor = createEditor();
    setCodeContent(editor, 'ts', 'const a = 1;');
    const docBefore = editor.state.doc;
    const copyBtn = editor.view.dom.querySelector<HTMLButtonElement>('.code-block-copy-btn')!;
    copyBtn.click();
    expect(writeText).toHaveBeenCalledWith('const a = 1;');
    expect(copyBtn.classList.contains('is-copied')).toBe(true);
    // 无事务派发：Doc 实例不变，即不弄脏、不进撤销栈
    expect(editor.state.doc).toBe(docBefore);
    expect(editor.state.doc.textContent).toBe('const a = 1;');
    editor.destroy();
  });

  it('switches language via setNodeAttribute and keeps content byte-identical', () => {
    const editor = createEditor();
    setCodeContent(editor, 'ts', 'const a = 1;');
    const toolbar = editor.view.dom.querySelector<HTMLElement>('.code-block-toolbar')!;
    (toolbar.querySelector('.code-block-lang-btn') as HTMLButtonElement).click();
    const rows = [...editor.view.dom.querySelectorAll<HTMLButtonElement>('.code-block-lang-list button')];
    rows.find(row => row.textContent === 'python')!.click();
    const node = editor.state.doc.firstChild;
    expect(node?.attrs.language).toBe('python');
    expect(node?.textContent).toBe('const a = 1;');
    // 切换重建 NodeView 后新工具条同步新语言
    expect(editor.view.dom.querySelector('.code-block-lang-label')?.textContent).toBe('python');
    editor.destroy();
  });

  it('clears the language to null when 纯文本 is chosen', () => {
    const editor = createEditor();
    setCodeContent(editor, 'ts', 'const a = 1;');
    const toolbar = editor.view.dom.querySelector<HTMLElement>('.code-block-toolbar')!;
    (toolbar.querySelector('.code-block-lang-btn') as HTMLButtonElement).click();
    const rows = [...editor.view.dom.querySelectorAll<HTMLButtonElement>('.code-block-lang-list button')];
    rows.find(row => row.textContent === '纯文本')!.click();
    expect(editor.state.doc.firstChild?.attrs.language).toBeNull();
    editor.destroy();
  });

  it('keeps diagram blocks free of the toolbar', () => {
    const editor = createEditor();
    setCodeContent(editor, 'mermaid', 'graph TD\nA-->B');
    expect(editor.view.dom.querySelector('.code-block-toolbar')).toBeNull();
    expect(editor.view.dom.querySelector('.mermaid-preview-panel')).toBeTruthy();
    editor.destroy();
  });

  it('stopEvent intercepts toolbar targets but not code content', () => {
    // addNodeView() 返回工厂，工厂再吃 props 才产出 NodeView（同 index.test.ts 的 BlockImage 用例）
    const factory = mermaidCodeBlockExtension().config.addNodeView!.call({} as never) as (args: unknown) => any;
    const node = { type: { name: 'codeBlock' }, attrs: { language: 'ts' }, textContent: 'x', nodeSize: 12 };
    const view = factory({
      node,
      editor: { view: { state: { tr: {} } } },
      getPos: () => 0,
    } as never);
    const copyBtn = view.dom.querySelector('.code-block-copy-btn');
    const code = view.dom.querySelector('pre code');
    expect(view.stopEvent({ type: 'mousedown', target: copyBtn, preventDefault: vi.fn() } as unknown as Event)).toBe(true);
    expect(view.stopEvent({ type: 'mousedown', target: code, preventDefault: vi.fn() } as unknown as Event)).toBe(false);
  });
});
