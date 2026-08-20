// Lossless command router — Slice 3.1/3.2.
//
// Toolbar buttons, the link dialog and keyboard shortcuts must operate on the
// ACTIVE CodeMirror document. On the lossless path the single EditorView
// (binding.editor.view) is the only author: every command here builds a LOCAL
// CodeMirror transaction that wraps/toggles the selection with Markdown
// delimiters (or inserts line-level markup) and dispatches it on that view.
// The binding's updateListener captures the transaction as a user edit and
// queues the Core patch (design 03 §7: commands must produce local CodeMirror
// transactions; never touch the hidden ProseMirror owner or a legacy textarea).
//
// Selection model: CodeMirror positions are UTF-16 offsets. The helper works in
// `from`/`to` selection coordinates (anchor = min(from,to), head = max) and
// maps the post-change caret through the same coordinates it constructs.

import type { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { getActiveLosslessBinding } from './registry';

/**
 * The active lossless EditorView, or null when the current document is NOT
 * owned by a lossless Core session (legacy WYSIWYG / legacy source mode).
 */
export function getActiveLosslessView(): EditorView | null {
  return getActiveLosslessBinding()?.editor.view ?? null;
}

/** True when a lossless Core session owns the current document. */
export function isLosslessActive(): boolean {
  return getActiveLosslessBinding() !== null;
}

interface WrapSpec {
  /** Prefix inserted before the selected text (or cursor). */
  before: string;
  /** Suffix inserted after the selected text (or cursor). */
  after: string;
  /** When the selection is empty, true = wrap placeholder text and select it. */
  wrapCursor?: boolean;
  /** Placeholder text inserted when the selection is empty and `wrapCursor`. */
  placeholder?: string;
}

const INLINE_SPECS: Record<'bold' | 'italic' | 'strike' | 'code', WrapSpec> = {
  bold: { before: '**', after: '**' },
  italic: { before: '*', after: '*' },
  strike: { before: '~~', after: '~~' },
  code: { before: '`', after: '`' },
};

/**
 * Toggle an inline Markdown delimiter pair around the current selection. If the
 * whole selection is already wrapped by the delimiters, unwrap it; otherwise
 * wrap. Dispatches a doc-changing transaction on `view` and moves the caret to
 * a sensible position (inside the wrapping for a fresh wrap, spanning the
 * content after an unwrap).
 */
export function toggleInlineWrap(view: EditorView, kind: keyof typeof INLINE_SPECS): void {
  const spec = INLINE_SPECS[kind];
  const { state } = view;
  const { from, to } = state.selection.main;
  const [selFrom, selTo] = from <= to ? [from, to] : [to, from];
  const text = state.sliceDoc(selFrom, selTo);

  const delims = spec.before;
  if (text.length > 0) {
    // Unwrap when the selection is exactly `**content**` / `*content*` etc.
    const docText = state.doc.toString();
    const expandedFrom = selFrom - delims.length;
    const expandedTo = selTo + spec.after.length;
    if (
      expandedFrom >= 0 &&
      docText.slice(expandedFrom, selFrom) === delims &&
      docText.slice(selTo, expandedTo) === spec.after
    ) {
      view.dispatch({
        changes: { from: expandedFrom, to: expandedTo, insert: text },
        selection: EditorSelection.single(expandedFrom, expandedFrom + text.length),
        userEvent: 'command',
      });
      view.focus();
      return;
    }
    // Wrap the selected text and place the caret right after the closing delim.
    view.dispatch({
      changes: { from: selFrom, to: selTo, insert: delims + text + spec.after },
      selection: EditorSelection.single(selTo + delims.length + spec.after.length),
      userEvent: 'command',
    });
    view.focus();
    return;
  }

  // Empty selection: insert a placeholder wrapped by delimiters and select it.
  const placeholder = spec.placeholder ?? '文字';
  const insert = spec.before + placeholder + spec.after;
  const start = selFrom;
  view.dispatch({
    changes: { from: selFrom, to: selTo, insert },
    selection: EditorSelection.single(start + spec.before.length, start + spec.before.length + placeholder.length),
    userEvent: 'command',
  });
  view.focus();
}

/**
 * Toggle a heading prefix on the current line(s). `# ` is inserted (or removed)
 * at the start of every line the selection spans. The caret stays at its
 * original position, mapped through the inserted/removed prefix.
 */
export function toggleHeading(view: EditorView, level: 1 | 2): void {
  const { state } = view;
  const { from, to } = state.selection.main;
  const [selFrom, selTo] = from <= to ? [from, to] : [to, from];
  const firstLine = state.doc.lineAt(selFrom);
  const lastLine = state.doc.lineAt(Math.max(selTo - 1, selFrom));
  const marker = '#'.repeat(level) + ' ';

  const lines: Array<{ start: number; text: string }> = [];
  for (let lineNum = firstLine.number; lineNum <= lastLine.number; lineNum++) {
    const line = state.doc.line(lineNum);
    lines.push({ start: line.from, text: line.text });
  }

  const allAtLevel = lines.every(({ text }) => text.startsWith(marker));
  const anyHasMarker = lines.some(({ text }) => /^#+\s/.test(text));

  const changes: Array<{ from: number; to: number; insert: string }> = [];
  let caret = state.selection.main.anchor;

  if (allAtLevel) {
    // Remove the marker from each line.
    for (let i = lines.length - 1; i >= 0; i--) {
      const { start } = lines[i];
      changes.push({ from: start, to: start + marker.length, insert: '' });
      if (caret >= start && caret <= start + marker.length) caret = start;
    }
  } else if (anyHasMarker) {
    // Mixed levels / a lower level present: normalize every line to the target.
    for (let i = lines.length - 1; i >= 0; i--) {
      const { start, text } = lines[i];
      const m = text.match(/^#+\s/);
      const existing = m ? m[0] : '';
      if (existing) {
        changes.push({ from: start, to: start + existing.length, insert: marker });
        if (caret >= start && caret <= start + existing.length) caret = start + marker.length;
      } else {
        changes.push({ from: start, to: start, insert: marker });
        if (caret >= start && caret <= start) caret = start + marker.length;
      }
    }
  } else {
    // No marker: add the target level.
    for (let i = lines.length - 1; i >= 0; i--) {
      const { start } = lines[i];
      changes.push({ from: start, to: start, insert: marker });
      if (caret >= start && caret <= start) caret = start + marker.length;
    }
  }

  view.dispatch({ changes, selection: { anchor: caret }, userEvent: 'command' });
  view.focus();
}

/**
 * Toggle a blockquote prefix on the current line(s): `> ` is added to every
 * selected line when none has it, otherwise removed from lines that have it.
 * Mirrors the legacy source-mode `btn-quote` handler, routed to any active view.
 */
export function toggleQuote(view: EditorView): void {
  const { state } = view;
  const { from, to } = state.selection.main;
  const [selFrom, selTo] = from <= to ? [from, to] : [to, from];
  const firstLine = state.doc.lineAt(selFrom);
  const lastLine = state.doc.lineAt(Math.max(selTo - 1, selFrom));

  const lines: Array<{ start: number; text: string }> = [];
  for (let lineNum = firstLine.number; lineNum <= lastLine.number; lineNum++) {
    const line = state.doc.line(lineNum);
    lines.push({ start: line.from, text: line.text });
  }

  const anyQuoted = lines.some(({ text }) => text.startsWith('> '));
  const changes: Array<{ from: number; to: number; insert: string }> = [];
  let caret = state.selection.main.anchor;

  for (let i = lines.length - 1; i >= 0; i--) {
    const { start, text } = lines[i];
    if (anyQuoted && text.startsWith('> ')) {
      changes.push({ from: start, to: start + 2, insert: '' });
      if (caret >= start && caret <= start + 2) caret = start;
    } else if (!anyQuoted) {
      changes.push({ from: start, to: start, insert: '> ' });
      if (caret >= start && caret <= start) caret = start + 2;
    }
  }

  view.dispatch({ changes, selection: { anchor: caret }, userEvent: 'command' });
  view.focus();
}

/**
 * Toggle an unordered (`- `) or ordered (`1. `) list marker on the selected
 * lines. When every line already carries that marker, remove them; otherwise
 * add the marker to lines that lack it.
 */
export function toggleList(view: EditorView, ordered: boolean): void {
  const { state } = view;
  const { from, to } = state.selection.main;
  const [selFrom, selTo] = from <= to ? [from, to] : [to, from];
  const firstLine = state.doc.lineAt(selFrom);
  const lastLine = state.doc.lineAt(Math.max(selTo - 1, selFrom));

  const lines: Array<{ start: number; text: string }> = [];
  for (let lineNum = firstLine.number; lineNum <= lastLine.number; lineNum++) {
    const line = state.doc.line(lineNum);
    lines.push({ start: line.from, text: line.text });
  }

  const marker = ordered ? '1. ' : '- ';
  const hasMarker = (text: string) =>
    ordered ? /^(\d+)\.\s/.test(text) : /^[-*+]\s/.test(text);

  const allMarked = lines.every(({ text }) => hasMarker(text));
  const changes: Array<{ from: number; to: number; insert: string }> = [];
  let caret = state.selection.main.anchor;

  for (let i = lines.length - 1; i >= 0; i--) {
    const { start, text } = lines[i];
    if (allMarked && hasMarker(text)) {
      const m = text.match(/^[-*+]\s|^(\d+)\.\s/);
      const len = m ? m[0].length : marker.length;
      changes.push({ from: start, to: start + len, insert: '' });
      if (caret >= start && caret <= start + len) caret = start;
    } else if (!allMarked && !hasMarker(text)) {
      changes.push({ from: start, to: start, insert: marker });
      if (caret >= start && caret <= start) caret = start + marker.length;
    }
  }

  view.dispatch({ changes, selection: { anchor: caret }, userEvent: 'command' });
  view.focus();
}

/**
 * Insert a Markdown horizontal rule (`---`) at the current position. If the
 * current line is non-empty, the rule is placed on a new line after it.
 */
export function insertHorizontalRule(view: EditorView): void {
  const { state } = view;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const lineIsEmpty = line.text.trim().length === 0;

  let insert: string;
  let anchor: number;
  if (lineIsEmpty && head === line.from) {
    insert = '---\n';
    anchor = head + 4;
  } else {
    insert = '\n---\n';
    anchor = head + 5;
  }
  view.dispatch({
    changes: { from: head, to: head, insert },
    selection: { anchor },
    userEvent: 'command',
  });
  view.focus();
}

/**
 * Toggle a fenced code block around the selection. With a non-empty selection
 * the selected lines are wrapped in ``` fences (cursor before the closing
 * fence). When the selection is ALREADY the inside of a fenced block, the
 * fence lines are removed (unwrap) so the byte range returns to plain text.
 * With an empty selection an empty fence is inserted with the caret inside it.
 * Mirrors the legacy source-mode `btn-codeblock` handler.
 */
export function toggleCodeBlock(view: EditorView): void {
  const { state } = view;
  const { from, to } = state.selection.main;
  const [selFrom, selTo] = from <= to ? [from, to] : [to, from];
  const text = state.sliceDoc(selFrom, selTo);

  if (text.length > 0) {
    const firstLine = state.doc.lineAt(selFrom);
    const lastLine = state.doc.lineAt(Math.max(selTo - 1, selFrom));
    const insertAt = firstLine.from;
    const insertTo = lastLine.to;

    // Unwrap when the selected region is already wrapped by an enclosing ```
    // fence: the first selection line is a fence opener and the last is a
    // closer (the opener/closer may BE the selection endpoints).
    const isFenceOpener = /^```$/.test(firstLine.text) && firstLine.to >= selFrom && firstLine.from <= selTo;
    const isFenceCloser = /^```$/.test(lastLine.text) && lastLine.to >= selFrom && lastLine.from <= selTo;
    if (isFenceOpener && isFenceCloser && firstLine.number < lastLine.number) {
      const openerTo = firstLine.to;
      const closerFrom = lastLine.from;
      // The body slice may end with the newline that precedes the closer;
      // drop it so the unwrapped result is the body text without a dangling LF.
      let body = state.sliceDoc(openerTo + 1, closerFrom);
      if (body.endsWith('\n')) body = body.slice(0, -1);
      // Remove the opener line (incl. its newline) and the closer line
      // (incl. its preceding newline); keep the body bytes exactly. The
      // changes apply left-to-right in one transaction: removing the closer
      // first (at a later offset) does not shift the opener offsets, so the
      // body is anchored at its own length after the opener is removed.
      view.dispatch({
        changes: [
          { from: closerFrom - 1, to: lastLine.to, insert: '' },
          { from: firstLine.from, to: openerTo + 1, insert: '' },
        ],
        selection: { anchor: body.length },
        userEvent: 'command',
      });
      view.focus();
      return;
    }

    const body = state.sliceDoc(insertAt, insertTo);
    view.dispatch({
      changes: { from: insertAt, to: insertTo, insert: '```\n' + body + '\n```' },
      selection: { anchor: insertAt + 4 + body.length },
      userEvent: 'command',
    });
  } else {
    view.dispatch({
      changes: { from: selFrom, to: selTo, insert: '```\n\n```' },
      selection: { anchor: selFrom + 4 },
      userEvent: 'command',
    });
  }
  view.focus();
}

/**
 * Insert a Markdown link at the current selection. When `text` is empty the
 * URL itself is used as the visible text. The caret lands after the closing
 * `)` when wrapping a selection, or selects the text slot when inserting a
 * fresh link (so the user can overwrite the placeholder).
 */
export function insertLinkMarkdown(view: EditorView, url: string, text: string): void {
  const { state } = view;
  const { from, to } = state.selection.main;
  const [selFrom, selTo] = from <= to ? [from, to] : [to, from];
  const selected = state.sliceDoc(selFrom, selTo);
  const visible = text.length > 0 ? text : url;
  const hasSelection = selFrom !== selTo;

  if (hasSelection) {
    // Replace the selected text with the link, keep the original as visible text.
    const link = `[${selected}](${url})`;
    view.dispatch({
      changes: { from: selFrom, to: selTo, insert: link },
      selection: EditorSelection.single(selFrom + link.length),
      userEvent: 'command',
    });
  } else {
    const link = `[${visible}](${url})`;
    view.dispatch({
      changes: { from: selFrom, to: selTo, insert: link },
      selection: EditorSelection.single(selFrom + 1, selFrom + 1 + visible.length),
      userEvent: 'command',
    });
  }
  view.focus();
}

/** Insert a Markdown image at the current caret. */
export function insertImageMarkdown(view: EditorView, src: string, alt = ''): void {
  const { state } = view;
  const head = state.selection.main.head;
  const md = `![${alt}](${src})`;
  view.dispatch({
    changes: { from: head, to: head, insert: md },
    selection: { anchor: head + md.length },
    userEvent: 'command',
  });
  view.focus();
}
