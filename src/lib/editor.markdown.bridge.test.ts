import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logWarn } = vi.hoisted(() => ({ logWarn: vi.fn() }));
vi.mock('./logger', () => ({ logWarn }));

import { logMarkdownConversionFailure, parseMarkdown, serializeMarkdown } from './editor.markdown.bridge';

describe('Markdown bridge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns exhaustive successful parse and serialize results without exposing storage to callers', () => {
    const editor = {
      commands: { setContent: vi.fn() },
      getJSON: vi.fn(() => ({ type: 'doc', content: [] })),
      getMarkdown: vi.fn(() => '# heading'),
    } as any;

    const parsed = parseMarkdown(editor, '# heading');
    const serialized = serializeMarkdown(editor);

    expect(parsed).toEqual({ ok: true, markdown: '# heading', doc: { type: 'doc', content: [] } });
    expect(serialized).toEqual({ ok: true, markdown: '# heading' });
    expect(editor.commands.setContent).toHaveBeenCalledWith('# heading', { contentType: 'markdown' });
  });

  it('returns an explicit parse failure with the untouched source', () => {
    const editor = {
      commands: { setContent: vi.fn(() => { throw new Error('bad markdown'); }) },
      getJSON: vi.fn(),
    } as any;

    const result = parseMarkdown(editor, 'original source');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.source).toBe('original source');
      expect(result.error).toMatchObject({ stage: 'parse', code: 'markdown-parse-failed' });
    }
  });

  it('returns an explicit serialization failure when the Markdown API is unavailable', () => {
    const result = serializeMarkdown({} as any);

    expect(result).toEqual({ ok: false, error: { stage: 'serialize', code: 'markdown-api-unavailable' } });
  });

  it('logs bounded structured diagnostics without source or URL query data', () => {
    logMarkdownConversionFailure({
      stage: 'serialize',
      code: 'unknown-node',
      range: { from: 4, to: 12 },
      details: { url: 'https://example.test/image.png?secret=never-log', body: 'x'.repeat(120) },
    });

    expect(logWarn).toHaveBeenCalledWith('editor.markdown', 'Markdown conversion failed', {
      stage: 'serialize', code: 'unknown-node', from: 4, to: 12,
      details: { url: 'https://example.test/image.png', body: 'x'.repeat(96) },
    });
  });
});
