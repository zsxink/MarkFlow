import MarkdownIt from 'markdown-it';
import { BridgeError, EXPORT_IR_SCHEMA_VERSION, type ExportBlockDto, type ExportDocumentDto } from './coreBridge';

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
});

export function renderExportIrToHtmlContent(document: ExportDocumentDto): string {
  assertSupportedExportIr(document);

  const diagnostics = document.diagnostics
    .map(diagnostic => `<!-- ${escapeHtml(`${diagnostic.code}: ${diagnostic.message}`)} -->`)
    .join('\n');
  const body = document.blocks
    .map(renderBlock)
    .filter(Boolean)
    .join('\n');

  return [diagnostics, body].filter(Boolean).join('\n');
}

function assertSupportedExportIr(document: ExportDocumentDto): void {
  if (document.schema_version !== EXPORT_IR_SCHEMA_VERSION) {
    throw new BridgeError(
      'UNSUPPORTED_EXPORT_IR_VERSION',
      `Unsupported Export IR schema v${document.schema_version}`,
    );
  }
}

function renderBlock(block: ExportBlockDto): string {
  switch (block.kind.type) {
    case 'front_matter':
      return '';
    case 'diagram':
      return renderDiagramBlock(block);
    case 'unknown':
      return `<pre class="export-ir-unsupported" data-export-ir-block-id="${escapeHtml(block.id)}"><code>${escapeHtml(block.source)}</code></pre>`;
    default:
      return markdown.render(block.source);
  }
}

function renderDiagramBlock(block: ExportBlockDto): string {
  if (block.kind.type !== 'diagram') return markdown.render(block.source);
  const code = stripFence(block.source);
  return [
    `<pre class="export-ir-diagram" data-diagram-language="${escapeHtml(block.kind.language)}" data-diagram-target="${escapeHtml(block.kind.render_target)}">`,
    `<code>${escapeHtml(code)}</code>`,
    '</pre>',
  ].join('');
}

function stripFence(source: string): string {
  const lines = source.split(/\r?\n/);
  if (lines.length <= 2) return source;
  const opening = lines[0]?.trimStart() ?? '';
  const closing = lines[lines.length - 1]?.trim() ?? '';
  if (
    (opening.startsWith('```') && closing.startsWith('```')) ||
    (opening.startsWith('~~~') && closing.startsWith('~~~'))
  ) {
    return lines.slice(1, -1).join('\n');
  }
  return source;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]!);
}
