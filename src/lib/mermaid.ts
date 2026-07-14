import { loadMermaid } from './mermaid-lazy';

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

const MERMAID_RENDER_TIMEOUT = 5000; // 5 seconds

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

export async function renderMermaid(code: string): Promise<string> {
  const mermaid = await loadMermaid();
  renderId += 1;
  const result = await withTimeout<{ svg: string }>(
    mermaid.render(`mermaid-${Date.now()}-${renderId}`, code) as Promise<{ svg: string }>,
    MERMAID_RENDER_TIMEOUT,
    'Mermaid 渲染超时（超过 5 秒）',
  );
  const svg = result.svg;
  return sanitizeMermaidSvg(svg);
}

export function isMermaidTheme(theme: string): string {
  return theme === 'dark' ? 'dark' : 'default';
}
