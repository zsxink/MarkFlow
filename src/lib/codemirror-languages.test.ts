import { describe, expect, it, vi } from 'vitest';

const javascript = vi.hoisted(() => vi.fn());

vi.mock('@codemirror/lang-javascript', () => ({ javascript }));

import { getLanguageExtension, hasLanguageLoader } from './codemirror-languages';

describe('CodeMirror language loader', () => {
  it('shares an in-flight language load and caches its result', async () => {
    const extension = {};
    javascript.mockReturnValue(extension);

    const [first, second] = await Promise.all([
      getLanguageExtension('javascript'),
      getLanguageExtension('javascript'),
    ]);
    const cached = await getLanguageExtension('javascript');

    expect(javascript).toHaveBeenCalledTimes(1);
    expect(first).toBe(extension);
    expect(second).toBe(extension);
    expect(cached).toBe(extension);
  });

  it('identifies supported and unsupported language names', () => {
    expect(hasLanguageLoader('rust')).toBe(true);
    expect(hasLanguageLoader('unknown')).toBe(false);
  });
});
