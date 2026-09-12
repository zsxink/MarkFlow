import { describe, expect, it } from 'vitest';
import { loadKatex } from './katex-lazy';

describe('katex-lazy', () => {
  it('loadKatex returns a promise that resolves to katex', async () => {
    const katex = await loadKatex();
    expect(katex).toBeDefined();
    expect(typeof katex.renderToString).toBe('function');
  });

  it('repeated calls return the same promise (singleton)', async () => {
    const p1 = loadKatex();
    const p2 = loadKatex();
    // Both should resolve to the same value
    const [k1, k2] = await Promise.all([p1, p2]);
    expect(k1).toBe(k2);
  });
});
