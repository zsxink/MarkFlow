import { describe, expect, it, vi } from 'vitest';

const { logWarn } = vi.hoisted(() => ({ logWarn: vi.fn() }));
vi.mock('../../../infra/logger', () => ({ logWarn }));

import { serializeTipTapMarkdown } from '../adapter';

function fakeEditor(json: unknown, markdown?: string) {
  return {
    getJSON: vi.fn(() => json),
    markdown: { serialize: vi.fn(() => markdown) },
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
    expect(editor.markdown.serialize).toHaveBeenCalledOnce();
    expect(editor.markdown.serialize).toHaveBeenCalledWith(editor.getJSON());
  });

  it('rejects a document with an unknown node type and does not call the serializer', () => {
    const editor = fakeEditor(
      { type: 'doc', content: [{ type: 'widget', content: [{ type: 'text', text: 'x' }] }] },
      undefined,
    );
    const result = serializeTipTapMarkdown(editor);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({ stage: 'serialize', code: 'unknown-node-type', details: { nodeType: 'widget' } });
    }
    expect(editor.markdown.serialize).not.toHaveBeenCalled();
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

  it('rejects when the markdown manager is unavailable', () => {
    const editor = { getJSON: vi.fn(() => ({ type: 'doc' })) } as any;
    const result = serializeTipTapMarkdown(editor);
    expect(result).toEqual({ ok: false, error: { stage: 'serialize', code: 'markdown-api-unavailable' } });
  });
});
