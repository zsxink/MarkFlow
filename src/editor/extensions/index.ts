// Barrel for the editor's Tiptap extensions. `editor.init.ts` imports only from
// here; the individual extension modules stay internal.
export { CustomLink } from './link';
export { SafeParagraph, escapeParagraphMarkdown } from './paragraph';
export { SafeHardBreak } from './hard-break';
export {
  MarkdownSafeTable,
  parseTableInput,
  splitTableLine,
} from './table';
export { BlockImage } from './image';
export { mermaidCodeBlockExtension, renderFencedCodeBlock } from './code-block';
export { MathBlock, MATH_BLOCK_NODE_NAME, MATH_BLOCK_TOKEN_NAME } from './math-block';
