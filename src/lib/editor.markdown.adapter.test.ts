import { describe, expect, it, vi } from 'vitest';

const { logWarn } = vi.hoisted(() => ({ logWarn: vi.fn() }));
vi.mock('./logger', () => ({ logWarn }));

import { serializeTipTapMarkdown } from './editor.markdown.adapter';

function fakeEditor(json: unknown, markdown?: string) {
  return {
    getJSON: vi.fn(() => json),
    getMarkdown: vi.fn(() => markdown),
  } as any;
}

describe('serializeTipTapMarkdown unknown-type detection (task 18)', () => {
  it('returns a successful serialize for a fully transparent document', () => {
    const editor = fakeEditor(
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] },
      '# heading',
    );
    const result = serializeTipTapMarkdown(editor);
    expect(result).toEqual({ ok: true, markdown: '# heading' });
    expect(editor.getMarkdown).toHaveBeenCalledOnce();
  });

  it('rejects a document with an unknown node type and does not call getMarkdown', () => {
    const editor = fakeEditor(
      { type: 'doc', content: [{ type: 'widget', content: [{ type: 'text', text: 'x' }] }] },
      undefined,
    );
    const result = serializeTipTapMarkdown(editor);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({ stage: 'serialize', code: 'unknown-node-type', details: { nodeType: 'widget' } });
    }
    expect(editor.getMarkdown).not.toHaveBeenCalled();
  });

  it('rejects a document with an unknown mark type', () => {
    const editor = fakeEditor({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'x', marks: [{ type: 'highlight' }] }],
      }],
    });
    const result = serializeTipTapMarkdown(editor);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({ stage: 'serialize', code: 'unknown-mark-type', details: { markType: 'highlight' } });
    }
  });

  it('accepts nested serializable children (table row/cell/header, listItem)', () => {
    const editor = fakeEditor({
      type: 'doc',
      content: [
        { type: 'table', content: [
          { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'h' }] }] }] },
        ] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'li' }] }] }] },
      ],
    }, '| h |');
    const result = serializeTipTapMarkdown(editor);
    expect(result).toEqual({ ok: true, markdown: '| h |' });
  });
});