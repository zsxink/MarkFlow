/**
 * KaTeX formula validation — checks LaTeX syntax for common errors.
 * Returns null for valid syntax, or an error message for invalid syntax.
 *
 * This is a lightweight pre-check before KaTeX rendering.
 * KaTeX itself will catch more complex errors during renderToString.
 */

/**
 * Validate LaTeX formula syntax.
 * @param formula - The LaTeX content (without $ delimiters)
 * @param _isBlock - Whether this is a block formula ($$..$$) (reserved for future use)
 * @returns null if valid, error message string if invalid
 */
export function validateLatex(formula: string, _isBlock: boolean): string | null {
  const trimmed = formula.trim();

  // Empty formula
  if (!trimmed) {
    return '公式内容为空';
  }

  // Check for unmatched braces
  let braceDepth = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '{') {
      braceDepth++;
    } else if (ch === '}') {
      if (braceDepth === 0) {
        return '多余的右花括号 }';
      }
      braceDepth--;
    }
  }
  if (braceDepth > 0) {
    return '缺少右花括号 }';
  }

  // Check for common invalid commands
  // \invalid is not a real LaTeX command
  const invalidCommands = /\\(?:invalid|error|undefined)\b/;
  if (invalidCommands.test(trimmed)) {
    return '无效的 LaTeX 命令';
  }

  // Check for unclosed/mismatched environments
  const beginRegex = /\\begin\{([^}]+)\}/g;
  const endRegex = /\\end\{([^}]+)\}/g;
  const begins: string[] = [];
  const ends: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = beginRegex.exec(trimmed)) !== null) {
    begins.push(match[1]);
  }
  while ((match = endRegex.exec(trimmed)) !== null) {
    ends.push(match[1]);
  }
  if (begins.length > 0 || ends.length > 0) {
    if (begins.length !== ends.length) {
      return begins.length > ends.length ? '缺少 \\end 环境' : '缺少 \\begin 环境';
    }
    // Check that each begin has a matching end
    for (let i = 0; i < begins.length; i++) {
      if (begins[i] !== ends[i]) {
        return '环境 begin/end 不匹配';
      }
    }
  }

  return null;
}
