import { describe, expect, it } from 'vitest';
import { validateLatex } from './katex-validate';

describe('validateLatex', () => {
  it('returns null for valid simple formula', () => {
    expect(validateLatex('E=mc^2', false)).toBeNull();
  });

  it('returns null for valid block formula', () => {
    expect(validateLatex('\\frac{a}{b}', true)).toBeNull();
  });

  it('returns error for empty formula', () => {
    expect(validateLatex('', false)).toBe('公式内容为空');
  });

  it('returns error for whitespace-only formula', () => {
    expect(validateLatex('   ', false)).toBe('公式内容为空');
  });

  it('returns error for unmatched opening brace', () => {
    expect(validateLatex('\\frac{a}{b', false)).toBe('缺少右花括号 }');
  });

  it('returns error for unmatched closing brace', () => {
    expect(validateLatex('\\frac{a}}{b}', false)).toBe('多余的右花括号 }');
  });

  it('returns error for invalid command', () => {
    expect(validateLatex('\\invalid', false)).toBe('无效的 LaTeX 命令');
  });

  it('returns null for valid commands', () => {
    expect(validateLatex('\\alpha \\beta \\gamma', false)).toBeNull();
  });

  it('returns error for unclosed begin environment', () => {
    expect(validateLatex('\\begin{align} a &= b', false)).toBe('缺少 \\end 环境');
  });

  it('returns error for unclosed end environment', () => {
    expect(validateLatex('a &= b \\end{align}', false)).toBe('缺少 \\begin 环境');
  });

  it('returns error for mismatched environments', () => {
    expect(validateLatex('\\begin{align} a \\end{equation}', false)).toBe('环境 begin/end 不匹配');
  });

  it('returns null for matched environments', () => {
    expect(validateLatex('\\begin{align} a \\end{align}', false)).toBeNull();
  });
});
