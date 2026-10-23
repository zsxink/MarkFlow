// ── 相邻同类型列表的序列化稳定性（issue #391）────────────────────────────
//
// 作者混用 `*` / `+` / `-`（或 `1)` / `1.`）标记时，解析会产生多个相邻的同
// 类型列表。序列化必须让它们在重解析后保持分离，否则整篇无损证明失败，把
// 本可局部保留的文档整体降级为源码模式。编辑器装配与 init.ts 保持一致
// （变体列表扩展 + RawMarkdown + OpaqueNode）。

import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, ListKeymap, OrderedList, TaskList } from '@tiptap/extension-list';
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { createMarkdownExtension } from '../editor/init';
import { BlockImage, CustomLink, MarkdownSafeTable, SafeParagraph, mermaidCodeBlockExtension } from '../editor/extensions';
import { VariantListItem, VariantTaskItem } from '../editor/extensions/list-marker-variants';
import { RawMarkdown, rawMarkdownSources } from '../editor/markdown/fallback';
import { OpaqueNode } from '../editor/markdown/opaque/extension';
import { serializeTipTapMarkdown } from '../editor/markdown/adapter';
import { decideAdmission } from '../editor/markdown/admission';

const mocks = vi.hoisted(() => ({
  renderMermaid: vi.fn(),
  renderPlantUml: vi.fn(),
  getCachedSettings: vi.fn(() => ({ plantumlServerUrl: '' })),
  store: { on: vi.fn(), off: vi.fn() },
  showMermaidContextMenu: vi.fn(),
  showPlantumlContextMenu: vi.fn(),
  logDebug: vi.fn(),
  logWarn: vi.fn(),
  logException: vi.fn(),
  getMermaidExportBaseName: vi.fn(),
  getPlantUmlExportBaseName: vi.fn(),
}));
vi.mock('../render/mermaid', () => ({ renderMermaid: mocks.renderMermaid }));
vi.mock('../render/plantuml', () => ({ renderPlantUml: mocks.renderPlantUml }));
vi.mock('../render/plantuml-lazy', () => ({ isBlankPlantUmlSource: vi.fn(() => false) }));
vi.mock('../infra/storage', () => ({ getCachedSettings: mocks.getCachedSettings }));
vi.mock('../infra/store', () => ({ store: mocks.store }));
vi.mock('../ui/mermaid-context-menu', () => ({ showMermaidContextMenu: mocks.showMermaidContextMenu }));
vi.mock('../ui/plantuml-context-menu', () => ({ showPlantumlContextMenu: mocks.showPlantumlContextMenu }));
vi.mock('../editor/state', () => ({ getActiveDocPath: () => null,
  assetToOriginalMap: new Map(),
  getMermaidExportBaseName: mocks.getMermaidExportBaseName,
  getPlantUmlExportBaseName: mocks.getPlantUmlExportBaseName,
}));
vi.mock('../infra/logger', () => ({ logDebug: mocks.logDebug, logWarn: mocks.logWarn, logException: mocks.logException }));

function createAppEditor() {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ paragraph: false, codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
      SafeParagraph,
      BulletList, OrderedList, VariantListItem, ListKeymap,
      TaskList, VariantTaskItem.configure({ nested: true }),
      MarkdownSafeTable.configure({ resizable: true }),
      TableRow, TableCell, TableHeader,
      CustomLink.configure({ openOnClick: false, autolink: false, linkOnPaste: false }),
      BlockImage.configure({ allowBase64: true }),
      mermaidCodeBlockExtension(),
      OpaqueNode,
      RawMarkdown,
      createMarkdownExtension(),
    ],
  });
}

/** 编辑器顶层节点类型序列。 */
function topLevelTypes(editor: Editor): string[] {
  return (editor.getJSON().content ?? []).map((node) => node.type ?? '?');
}

/** parse → serialize（走 adapter）→ reparse，返回两者结构与序列化字节。 */
function roundTrip(source: string) {
  const editor = createAppEditor();
  try {
    editor.commands.setContent(source, { contentType: 'markdown' });
    const first = editor.getJSON();
    const out = serializeTipTapMarkdown(editor);
    if (!out.ok) throw new Error('serialize failed');
    editor.commands.setContent(out.markdown, { contentType: 'markdown' });
    const reparsed = editor.getJSON();
    return { first, reparsed, markdown: out.markdown };
  } finally {
    editor.destroy();
  }
}

describe('相邻同类型列表的序列化稳定性', () => {
  it('混用 bullet 标记的三个相邻列表 round-trip 后保持独立', () => {
    const { first, reparsed, markdown } = roundTrip('* 星号\n\n+ 加号\n\n- 短横线\n');
    expect(topLevelTypes({ getJSON: () => first } as Editor)).toEqual(['bulletList', 'bulletList', 'bulletList', 'paragraph']);
    expect(reparsed).toEqual(first);
    // 变体标记让重解析能看到三个独立列表，而不是合并成一个松散列表。
    expect(markdown).toContain('* 加号');
  });

  it('混用 1) 与 1. 的相邻有序列表 round-trip 后保持独立', () => {
    const { first, reparsed } = roundTrip('1) 括号\n\n1. 点号\n');
    expect(reparsed).toEqual(first);
  });

  it('混用标记的相邻任务列表 round-trip 后保持独立', () => {
    const { first, reparsed } = roundTrip('- [ ] 短横线任务\n\n* [ ] 星号任务\n');
    expect(topLevelTypes({ getJSON: () => first } as Editor)).toEqual(['taskList', 'taskList', 'paragraph']);
    expect(reparsed).toEqual(first);
  });

  it('同标记空行分隔的松散列表不受变体影响（仍为一个列表）', () => {
    const { first, reparsed } = roundTrip('- a\n\n- b\n');
    expect(topLevelTypes({ getJSON: () => first } as Editor)).toEqual(['bulletList', 'paragraph']);
    expect(reparsed).toEqual(first);
  });

  it('嵌套在列表项内的相邻同类型列表 round-trip 后保持独立', () => {
    const source = '- 外层\n  * 内层甲\n\n  + 内层乙\n';
    const { first, reparsed } = roundTrip(source);
    expect(reparsed).toEqual(first);
  });

  it('畸形表格与相邻混标记列表共存的文档走局部保留准入而非整篇源码', () => {
    const source = [
      '# 标题',
      '',
      '| A | B |',
      '| --- | --- | --- |',
      '| 1 | 2 | 3 |',
      '',
      '* 甲',
      '',
      '+ 乙',
      '',
    ].join('\n');
    const editor = createAppEditor();
    try {
      const admission = decideAdmission(editor, source, { sourceRevision: 1, userRevisionAtAdmission: 0 });
      // spec（wysiwyg-markdown-reconciliation）：畸形表格 MUST 整块局部字面量
      // 保留，文档其余部分仍可编辑；只有局部保留证明失败才降级 source-only。
      expect(admission.mode).toBe('reconcile');
      expect(admission.reason).toBe('opaque-covered');
      // 编辑器文档持有畸形表格的原文原子，其余内容为富文本结构。
      const sources = rawMarkdownSources(editor.getJSON());
      expect(sources.join('\n')).toContain('| A | B |');
    } finally {
      editor.destroy();
    }
  });
});
