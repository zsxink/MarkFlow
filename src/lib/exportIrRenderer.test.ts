import { describe, expect, it } from 'vitest';
import { BridgeError, type ExportDocumentDto } from './coreBridge';
import { renderExportIrToHtmlContent } from './exportIrRenderer';

function document(blocks: ExportDocumentDto['blocks']): ExportDocumentDto {
  return {
    schema_version: 1,
    session_id: 7,
    document_id: 11,
    base_revision: 3,
    export_request_id: 'export-1',
    metadata: { frontmatter: null },
    blocks,
    assets: [],
    diagnostics: [],
  };
}

describe('Export IR HTML renderer', () => {
  it('renders semantic Markdown blocks without reading DOM', () => {
    const html = renderExportIrToHtmlContent(document([
      {
        id: 'b1',
        kind: { type: 'heading', level: 1, title: '标题' },
        source_range: { start: 0, end: 8 },
        content_range: { start: 2, end: 8 },
        line_range: { start: 0, end: 1 },
        source: '# 标题',
      },
      {
        id: 'b2',
        kind: { type: 'paragraph' },
        source_range: { start: 10, end: 43 },
        content_range: { start: 10, end: 43 },
        line_range: { start: 2, end: 3 },
        source: 'paragraph with `code` and [link](https://example.com)',
      },
    ]));

    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<a href="https://example.com">link</a>');
  });

  it('keeps unsupported block source visible', () => {
    const html = renderExportIrToHtmlContent(document([
      {
        id: 'b9',
        kind: { type: 'unknown', reason: 'link_reference' },
        source_range: { start: 0, end: 27 },
        content_range: { start: 0, end: 27 },
        line_range: { start: 0, end: 1 },
        source: '[ref]: https://example.com',
      },
    ]));

    expect(html).toContain('data-export-ir-block-id="b9"');
    expect(html).toContain('[ref]: https://example.com');
  });

  it('rejects unsupported schema versions with a stable code', () => {
    expect(() => renderExportIrToHtmlContent({
      ...document([]),
      schema_version: 2,
    })).toThrow(BridgeError);
  });
});
