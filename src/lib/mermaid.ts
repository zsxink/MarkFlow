import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'strict',
  htmlLabels: false,
});

let renderId = 0;

function sanitizeMermaidSvg(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.tagName.toLowerCase() !== 'svg') {
    throw new Error('Mermaid 返回了无效 SVG');
  }

  root.querySelectorAll('script, iframe, object, embed, audio, video').forEach(node => {
    node.remove();
  });

  root.querySelectorAll('*').forEach(node => {
    Array.from(node.attributes).forEach(attr => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on')) {
        node.removeAttribute(attr.name);
        return;
      }
      if ((name === 'href' || name === 'xlink:href') && value && !value.startsWith('#')) {
        node.removeAttribute(attr.name);
      }
    });
  });

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Mermaid SVG 解析失败');
  }

  return root.outerHTML;
}

export async function renderMermaid(code: string): Promise<string> {
  renderId += 1;
  const { svg } = await mermaid.render(`mermaid-${Date.now()}-${renderId}`, code);
  return sanitizeMermaidSvg(svg);
}

export function isMermaidTheme(theme: string): string {
  return theme === 'dark' ? 'dark' : 'default';
}
