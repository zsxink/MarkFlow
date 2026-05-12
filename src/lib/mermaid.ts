import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'strict',
});

export async function renderMermaid(code: string): Promise<string> {
  try {
    const { svg } = await mermaid.render(`mermaid-${Date.now()}`, code);
    return svg;
  } catch {
    return `<pre class="mermaid-error">${code}</pre>`;
  }
}

export function isMermaidTheme(theme: string): string {
  return theme === 'dark' ? 'dark' : 'default';
}
