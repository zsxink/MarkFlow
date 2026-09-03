import { describe, expect, it } from 'vitest';
import { renderKatex } from './katex-render';

describe('renderKatex', () => {
  it('renders valid inline formula', async () => {
    const result = await renderKatex('E=mc^2', false);
    expect(result.ok).toBe(true);
    expect(result.html).toContain('katex');
    expect(result.html).toContain('E=mc');
  });

  it('renders valid block formula', async () => {
    const result = await renderKatex('\\frac{a}{b}', true);
    expect(result.ok).toBe(true);
    expect(result.html).toContain('katex');
    expect(result.html).toContain('frac');
  });

  it('returns error for invalid formula', async () => {
    const result = await renderKatex('\\invalid', false);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('无效的 LaTeX 命令');
    expect(result.html).toContain('katex-error-inline');
  });

  it('returns error for empty formula', async () => {
    const result = await renderKatex('', false);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('公式内容为空');
  });

  it('renders complex formula', async () => {
    const result = await renderKatex('\\int_{0}^{\\infty} e^{-x} dx', true);
    expect(result.ok).toBe(true);
    expect(result.html).toContain('katex');
  });
});
