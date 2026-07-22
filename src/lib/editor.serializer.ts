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
// Does NOT collapse blank lines elsewhere — user-entered whitespace is preserved.
// Skips content inside code fences.
function fixImageNewlines(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const out: string[] = [];
  const isStandaloneImage = (line: string) => /^\s*!\[[^\]]*\]\([^\n)]*\)\s*$/.test(line);
  let insideFence = false;

  for (const line of lines) {
    // Toggle fence state
    if (/^\s*```/.test(line.trim())) {
      insideFence = !insideFence;
      out.push(line);
      continue;
    }

    if (!insideFence && isStandaloneImage(line)) {
      // Ensure exactly one blank line before image (if not at document start
      // and previous output isn't already blank)
      if (out.length > 0 && out[out.length - 1] !== '') {
        out.push('');
      }
      out.push(line.trim());
      continue;
    }
    out.push(line);
  }

  // Ensure each standalone image is followed by a blank line when the next
  // content line is non-empty (needed for proper Markdown block rendering).
  for (let i = 0; i < out.length - 1; i++) {
    if (isStandaloneImage(out[i]) && out[i + 1] !== '') {
      out.splice(i + 1, 0, '');
      i++; // skip the blank we just inserted
    }
  }

  return out.join('\n');
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

