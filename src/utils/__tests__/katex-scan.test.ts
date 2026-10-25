import { describe, expect, it } from 'vitest';
import { scanFormulas, scanMathBlockRegions } from '../katex-scan';

describe('scanFormulas', () => {
  it('identifies inline $..$', () => {
    const result = scanFormulas('This is $E=mc^2$ inline.');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'inline',
      from: 8,
      to: 16,
      content: 'E=mc^2',
    });
  });

  it('identifies block $$..$$', () => {
    const result = scanFormulas('$$\n\\frac{a}{b}\n$$');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'block',
      from: 0,
      to: 17,
      content: '\n\\frac{a}{b}\n',
    });
  });

  it('identifies block $$..$$ on single line', () => {
    const result = scanFormulas('$$x^2$$');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'block',
      from: 0,
      to: 7,
      content: 'x^2',
    });
  });

  it('keeps double-dollar math inline when it is embedded in a sentence', () => {
    const result = scanFormulas('Task text $$a=c$$ and more text.');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'inline', content: 'a=c' });
  });

  it('keeps line-leading double-dollar math as a display block', () => {
    const result = scanFormulas('before\n$$a=c$$\nafter');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'block', content: 'a=c' });
  });

  it('handles multiple formulas', () => {
    const result = scanFormulas('$a+b$ and $$x^2$$');
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('inline');
    expect(result[1].type).toBe('inline');
  });

  it('does not treat currency $100 as formula', () => {
    const result = scanFormulas('Price is $100');
    expect(result).toHaveLength(0);
  });

  it('does not treat $ followed by space as formula', () => {
    const result = scanFormulas('Use $ for currency');
    expect(result).toHaveLength(0);
  });

  it('does not treat single $ as formula', () => {
    const result = scanFormulas('Just a $ sign');
    expect(result).toHaveLength(0);
  });

  it('handles escaped \\$ not as formula', () => {
    // \$ should not start a formula
    const result = scanFormulas('Price: \\$50');
    expect(result).toHaveLength(0);
  });

  it('handles formula at start of line', () => {
    const result = scanFormulas('$x$ at start');
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('x');
  });

  it('handles formula at end of line', () => {
    const result = scanFormulas('end with $y$');
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('y');
  });

  it('handles empty content between delimiters', () => {
    // Empty $$ is not a valid formula
    const result = scanFormulas('$$  $$');
    expect(result).toHaveLength(0);
  });

  it('handles block formula spanning multiple lines', () => {
    const input = '$$\n\\begin{align}\na &= b \\\\\n\\end{align}\n$$';
    const result = scanFormulas(input);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('block');
    expect(result[0].content).toContain('\\begin{align}');
  });

  it('block formula takes priority over overlapping inline', () => {
    // $$...$..$...$$ should be treated as one block
    const result = scanFormulas('$$x$y$$');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('block');
  });

  it('preserves source positions correctly', () => {
    const input = 'text $a$ more $$b$$ end';
    const result = scanFormulas(input);
    expect(result).toHaveLength(2);
    expect(input.slice(result[0].from, result[0].to)).toBe('$a$');
    expect(input.slice(result[1].from, result[1].to)).toBe('$$b$$');
  });
});

describe('scanMathBlockRegions (#417)', () => {
  it('finds a line-leading multi-line block with exact offsets', () => {
    const source = '$$\n\\begin{align}\n  a &= b \\\\\n\\end{align}\n$$';
    const regions = scanMathBlockRegions(source);
    expect(regions).toHaveLength(1);
    expect(regions[0].from).toBe(0);
    expect(regions[0].to).toBe(source.length);
    expect(regions[0].latex).toBe('\\begin{align}\n  a &= b \\\\\n\\end{align}');
    expect(source.slice(regions[0].from, regions[0].to)).toBe(source);
  });

  it('allows up to 3 leading spaces and trims the latex', () => {
    expect(scanMathBlockRegions('  $$x$$').map((r) => r.latex)).toEqual(['x']);
    expect(scanMathBlockRegions('   $$ x $$').map((r) => r.latex)).toEqual(['x']);
  });

  it('does not match mid-line delimiters', () => {
    expect(scanMathBlockRegions('text $$a$$ tail')).toEqual([]);
  });

  it('skips empty content between delimiters', () => {
    expect(scanMathBlockRegions('$$\n$$')).toEqual([]);
    expect(scanMathBlockRegions('$$   $$')).toEqual([]);
  });

  it('finds nothing when the block is unclosed', () => {
    expect(scanMathBlockRegions('$$\nx\ny')).toEqual([]);
  });

  it('finds consecutive blocks without overlap', () => {
    const source = '$$a$$\n$$\nb\n$$';
    const regions = scanMathBlockRegions(source);
    expect(regions).toHaveLength(2);
    expect(source.slice(regions[0].from, regions[0].to)).toBe('$$a$$');
    expect(source.slice(regions[1].from, regions[1].to)).toBe('$$\nb\n$$');
  });

  it('matches blocks after a preceding paragraph line', () => {
    const source = 'para line\n$$\na &= b\n$$';
    const regions = scanMathBlockRegions(source);
    expect(regions).toHaveLength(1);
    expect(regions[0].from).toBe(10);
    expect(regions[0].latex).toBe('a &= b');
  });
});
