// ── annotateAdjacentListRuns 纯单元测试 ──────────────────────────────────
import { describe, expect, it } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { annotateAdjacentListRuns } from '../adjacent-list-runs';

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const bullet = (text: string) => ({ type: 'bulletList', content: [{ type: 'listItem', content: [para(text)] }] });
const ordered = (text: string) => ({ type: 'orderedList', content: [{ type: 'listItem', content: [para(text)] }] });

describe('annotateAdjacentListRuns', () => {
  it('为相邻同类型列表的奇数位成员标注 listVariant', () => {
    const doc = { type: 'doc', content: [bullet('a'), bullet('b'), bullet('c')] };
    const content = annotateAdjacentListRuns(doc).content ?? [];
    expect(content[0].attrs?.listVariant).toBeUndefined();
    expect(content[1].attrs?.listVariant).toBe(1);
    expect(content[2].attrs?.listVariant).toBeUndefined();
  });

  it('不同类型的相邻列表互不算作同一 run', () => {
    const doc = { type: 'doc', content: [bullet('a'), ordered('b')] };
    const content = annotateAdjacentListRuns(doc).content ?? [];
    expect(content[0].attrs?.listVariant).toBeUndefined();
    expect(content[1].attrs?.listVariant).toBeUndefined();
  });

  it('间隔其他块类型后重新计数', () => {
    const doc = { type: 'doc', content: [bullet('a'), para('分隔'), bullet('b')] };
    const content = annotateAdjacentListRuns(doc).content ?? [];
    expect(content[2].attrs?.listVariant).toBeUndefined();
  });

  it('递归处理嵌套内容中的相邻列表', () => {
    const nested: JSONContent = {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [para('外层'), bullet('内层甲'), bullet('内层乙')] },
      ],
    };
    const doc = { type: 'doc', content: [nested] };
    const inner = annotateAdjacentListRuns(doc).content?.[0].content?.[0].content;
    expect(inner?.[1].type).toBe('bulletList');
    expect(inner?.[2].attrs?.listVariant).toBe(1);
  });

  it('不修改输入文档（返回新对象）', () => {
    const child = bullet('a');
    const doc: JSONContent = { type: 'doc', content: [child, bullet('b')] };
    const annotated = annotateAdjacentListRuns(doc);
    expect(annotated).not.toBe(doc);
    expect(annotated.content?.[1]).not.toBe(doc.content?.[1]);
    expect(doc.content?.[1].attrs?.listVariant).toBeUndefined();
  });
});
