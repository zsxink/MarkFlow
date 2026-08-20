/**
 * Lossless image source-range helpers — task 5.3.
 *
 * P4B owns the advanced image widget. In P3 the image stays readable,
 * selectable and editable as exact source fallback; this module locates the
 * source range of an image Markdown (`![alt](src)`) in the CodeMirror doc so
 * replace/delete can target ONLY that range with a local transaction (never a
 * full-text rewrite, never the hidden ProseMirror owner).
 */

/** One image occurrence in the document (UTF-16 offsets). */
export interface ImageSourceRange {
  /** Offset of the `!` of `![...](...)`. */
  start: number;
  /** Offset just past the closing `)`. */
  end: number;
  /** The alt text between `![` and `](`. */
  alt: { from: number; to: number; text: string };
  /** The src text between `](` and `)`. */
  src: { from: number; to: number; text: string };
  /** The full matched Markdown text (prefix for reparsing diagnostics). */
  markdown: string;
}

const IMAGE_LITERAL_RE = /!\[((?:[^\]\\]|\\.)*)\]\(([^)\s]*)\)/g;

/**
 * Find the image Markdown literal whose source range contains `pos`, or null.
 * Multiple matches per line are handled left-to-right; nested parens in the
 * URL are not supported (standard image Markdown does not allow them).
 */
export function findImageAt(text: string, pos: number): ImageSourceRange | null {
  IMAGE_LITERAL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMAGE_LITERAL_RE.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    if (pos >= start && pos <= end) {
      const altFrom = start + 2;
      const altTo = altFrom + m[1].length;
      const srcFrom = start + 2 + m[1].length + 2; // after "]("
      const srcTo = srcFrom + m[2].length;
      return {
        start,
        end,
        alt: { from: altFrom, to: altTo, text: m[1] },
        src: { from: srcFrom, to: srcTo, text: m[2] },
        markdown: m[0],
      };
    }
    if (start > pos) break;
  }
  return null;
}

/** Replace the src of the image occurrence at `pos` with `newSrc` (UTF-16). */
export function replaceImageSrcAt(text: string, pos: number, newSrc: string): {
  change: { from: number; to: number; insert: string };
  range: ImageSourceRange;
} | null {
  const range = findImageAt(text, pos);
  if (!range) return null;
  return {
    change: { from: range.src.from, to: range.src.to, insert: newSrc },
    range,
  };
}

/** Delete the whole image Markdown literal at `pos` (UTF-16). */
export function deleteImageAt(text: string, pos: number): {
  change: { from: number; to: number; insert: string };
  range: ImageSourceRange;
} | null {
  const range = findImageAt(text, pos);
  if (!range) return null;
  return { change: { from: range.start, to: range.end, insert: '' }, range };
}