import type { Node as PMNode } from '@tiptap/pm/model';
import { assetToOriginalMap } from './editor.state';

// ── Asset URL replacement ──────────────────────────────────────────────

export function replaceAssetUrlsWithOriginal(markdown: string): string {
  let result = markdown;
  for (const [asset, original] of assetToOriginalMap) {
    const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), original);
  }
  return result;
}

// ── Markdown normalization ─────────────────────────────────────────────

// Repair legacy corruption where heading was glued after image.
function fixCorruptedImageNewlines(markdown: string): string {
  let result = markdown;
  result = result.replace(/(^\s*!\[[^\]]*\]\([^\n)]*\))\s*\\\s*(#{1,6}\s+)/gm, '$1\n\n$2');
  result = result.replace(/(^\s*!\[[^\]]*\]\([^\n)]*\))\s*(#{1,6}\s+)/gm, '$1\n\n$2');
  return result;
}

// Normalize standalone image blocks: image on its own line, blank line before and after.
function fixImageNewlines(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const out: string[] = [];
  const isStandaloneImage = (line: string) => /^\s*!\[[^\]]*\]\([^\n)]*\)\s*$/.test(line);

  for (const line of lines) {
    if (isStandaloneImage(line)) {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      out.push(line.trim());
      out.push('');
      continue;
    }
    out.push(line);
  }

  const joined = out.join('\n');
  return joined.replace(/(```[\s\S]*?```)|(\n{3,})/g, (_match, codeFence) => {
    if (codeFence) return codeFence;
    return '\n\n';
  });
}

export function normalizeImageMarkdown(markdown: string): string {
  return fixImageNewlines(fixCorruptedImageNewlines(markdown));
}

// ── Emergency fallback ─────────────────────────────────────────────────

export function extractDocAsFallback(doc: PMNode): string {
  const lines: string[] = [];
  doc.forEach((node) => {
    if (node.type.name === 'paragraph') {
      lines.push(node.textContent);
    } else if (node.type.name === 'heading') {
      const level = node.attrs.level || 1;
      lines.push('#'.repeat(level) + ' ' + node.textContent);
    } else if (node.type.name === 'bulletList' || node.type.name === 'orderedList' || node.type.name === 'taskList') {
      node.forEach((item, _pos) => {
        const prefix = node.type.name === 'orderedList'
          ? '1. '
          : node.type.name === 'taskList'
            ? `- [${item.attrs.checked ? 'x' : ' '}] `
            : '- ';
        lines.push(prefix + item.textContent);
      });
    } else if (node.type.name === 'blockquote') {
      lines.push('> ' + node.textContent);
    } else if (node.type.name === 'codeBlock') {
      lines.push('```');
      lines.push(node.textContent);
      lines.push('```');
    } else {
      lines.push(node.textContent || '');
    }
  });
  return lines.join('\n\n');
}

