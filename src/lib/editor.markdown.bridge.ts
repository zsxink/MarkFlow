import type { Editor } from '@tiptap/core';
import { logWarn } from './logger';
import { normalizeImageMarkdown, replaceAssetUrlsWithOriginal } from './editor.serializer';
import { parseTipTapMarkdown, serializeTipTapMarkdown } from './editor.markdown.adapter';
import type {
  MarkdownConversionError,
  MarkdownParseResult,
  MarkdownSerializeResult,
} from './editor.markdown.types';

export type { MarkdownConversionError, MarkdownParseResult, MarkdownPipelineMode, MarkdownSerializeResult } from './editor.markdown.types';

const MAX_DETAIL_STRING_LENGTH = 96;

function boundedDetails(details: MarkdownConversionError['details']) {
  if (!details) return undefined;
  const output: NonNullable<MarkdownConversionError['details']> = {};
  for (const [key, value] of Object.entries(details).slice(0, 8)) {
    output[key.slice(0, 48)] = typeof value === 'string'
      ? value.replace(/\?.*$/, '').slice(0, MAX_DETAIL_STRING_LENGTH)
      : value;
  }
  return output;
}

/** Records structured diagnostics without exposing document text or URL query data. */
export function logMarkdownConversionFailure(error: MarkdownConversionError): void {
  logWarn('editor.markdown', 'Markdown conversion failed', {
    stage: error.stage,
    code: error.code.slice(0, 96),
    ...(error.range ? { from: error.range.from, to: error.range.to } : {}),
    ...(boundedDetails(error.details) ? { details: boundedDetails(error.details) } : {}),
  });
}

export function parseMarkdown(editor: Editor, source: string): MarkdownParseResult {
  const result = parseTipTapMarkdown(editor, normalizeImageMarkdown(source));
  if (!result.ok) logMarkdownConversionFailure(result.error);
  return result;
}

export function serializeMarkdown(editor: Editor): MarkdownSerializeResult {
  const result = serializeTipTapMarkdown(editor);
  if (!result.ok) {
    logMarkdownConversionFailure(result.error);
    return result;
  }
  return { ok: true, markdown: normalizeImageMarkdown(replaceAssetUrlsWithOriginal(result.markdown)) };
}
