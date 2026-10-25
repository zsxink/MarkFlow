// ── O(prefix) entry guards for upstream list block tokenizers (#411) ────
//
// `@tiptap/extension-list`'s orderedList/taskList `tokenize` starts by
// splitting or recursively indent-parsing the WHOLE remaining source
// (`src.split('\n')` / `parseIndentedBlocks`), and Marked invokes every block
// tokenizer with the un-cut source at each block boundary. On fragmented
// documents that made the lexer quadratic — measured 1.9MB in ~22s (11.2s in
// `parseIndentedBlocks`, 10.9s in orderedList's `split`), while a bare Marked
// instance lexes the same text in 82ms.
//
// The guards below only reject what the upstream tokenizer would reject
// anyway (first line can never start that list kind), using a deliberately
// LOOSE prefix test so acceptance — and therefore parse results — are
// unchanged. A 512-unit head keeps each guard O(prefix); the head slice is a
// V8 SlicedString, so no large copy happens here either.

import type { MarkdownLexerConfiguration, MarkdownToken } from '@tiptap/core';
import { OrderedList, TaskList } from '@tiptap/extension-list';

/** Longest inspected prefix (UTF-16 units) for the first-line guards. */
const GUARD_HEAD = 512;

function firstLineHead(src: string): string {
  const head = src.length <= GUARD_HEAD ? src : src.substring(0, GUARD_HEAD);
  const nl = head.indexOf('\n');
  return nl === -1 ? head : head.slice(0, nl);
}

// Marker forms mirror upstream's ORDERED_LIST_ITEM_REGEX
// (`^(\s*)(\d+|[ivxlcdmIVXLCDM]+|[a-zA-Z]{1,2})([.)])\s+(.*)$`): a first line
// without `whitespace? marker delimiter blank` can never open an ordered
// list, and `collectOrderedListItems` stops at its first non-item line.
const ORDERED_ITEM_START = /^\s*(?:\d+|[ivxlcdmIVXLCDM]+|[a-zA-Z]{1,2})[.)](?:\s|$)/;

// Upstream task items match `^(\s*)([-+*])\s+\[([ xX])\]\s+(.*)$`; anything
// not starting with a bullet and a `[` cannot be one.
const TASK_ITEM_START = /^\s*[-+*]\s*\[/;

type UpstreamTokenizer = {
  name: string;
  level: 'block';
  start?: (src: string) => number;
  tokenize: (src: string, tokens: MarkdownToken[], lexer: MarkdownLexerConfiguration) => MarkdownToken | undefined;
};

function extendWithTokenizeGuard(
  Base: typeof OrderedList | typeof TaskList,
  canOpen: (firstLine: string) => boolean,
) {
  const upstream = (Base as unknown as { config: { markdownTokenizer: UpstreamTokenizer } }).config.markdownTokenizer;
  return Base.extend({
    markdownTokenizer: {
      ...upstream,
      tokenize(src: string, tokens: MarkdownToken[], lexer: MarkdownLexerConfiguration) {
        if (!canOpen(firstLineHead(src))) return undefined;
        return upstream.tokenize(src, tokens, lexer);
      },
    },
  });
}

/** OrderedList with an O(prefix) entry guard on its Markdown tokenizer. */
export const FastOrderedList = extendWithTokenizeGuard(OrderedList, (line) => ORDERED_ITEM_START.test(line));

/** TaskList with an O(prefix) entry guard on its Markdown tokenizer. */
export const FastTaskList = extendWithTokenizeGuard(TaskList, (line) => TASK_ITEM_START.test(line));
