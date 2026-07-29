// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { RenderDocumentDto } from '../../lib/coreBridge';
import {
  applyWysiwygRenderEffect,
  computeViewportWithOverscan,
  createCoreWysiwygRenderExtension,
  sanitizeImagePreviewUrl,
} from './wysiwygRenderExtension';

function renderDoc(overrides: Partial<RenderDocumentDto> = {}): RenderDocumentDto {
  return {
    session_id: 1,
    document_id: 2,
    revision: 3,
    request_id: 'render-1',
    viewport: { start: 0, end: 64 },
    large_document: false,
    blocks: [
      {
        id: 'b1',
        kind: 'paragraph',
        level: null,
        source_range: { start: 0, end: 8 },
        content_range: { start: 0, end: 8 },
        line_range: { start: 0, end: 1 },
        text: '**bold**',
        inlines: [
          {
            kind: 'strong',
            source_range: { start: 0, end: 8 },
            content_range: { start: 2, end: 6 },
            marker_ranges: [
              { start: 0, end: 2 },
              { start: 6, end: 8 },
            ],
            text: 'bold',
            target: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function createView(doc = '**bold**\n![alt](img.png)\n', context = { sessionId: 1, documentId: 2, revision: 3 }) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const reveal = vi.fn();
  const view = new EditorView({
    doc,
    extensions: [
      createCoreWysiwygRenderExtension({
        getContext: () => context,
        getLatestRequestId: () => 'render-1',
        requestRender: vi.fn(() => new Promise<RenderDocumentDto>(() => undefined)),
        onRevealSource: reveal,
      }),
    ],
    parent,
  });
  return { view, parent, reveal };
}

describe('core WYSIWYG render extension', () => {
  it('applies decorations without replacing Markdown document text', () => {
    const { view, parent } = createView();

    view.dispatch({
      selection: EditorSelection.cursor(9),
      effects: applyWysiwygRenderEffect.of(renderDoc()),
    });

    expect(view.state.doc.toString()).toBe('**bold**\n![alt](img.png)\n');
    expect(parent.querySelector('.markflow-wysiwyg-strong')).not.toBeNull();
    expect(parent.querySelectorAll('.markflow-wysiwyg-marker-muted')).toHaveLength(2);
    view.destroy();
    parent.remove();
  });

  it('reveals marker decorations when selection enters the source range', () => {
    const { view, parent } = createView();

    view.dispatch({
      selection: EditorSelection.cursor(3),
      effects: applyWysiwygRenderEffect.of(renderDoc()),
    });

    expect(parent.querySelectorAll('.markflow-wysiwyg-marker-revealed')).toHaveLength(2);
    view.destroy();
    parent.remove();
  });

  it('drops stale revision and cross-session render documents', () => {
    const { view, parent } = createView();

    view.dispatch({
      effects: applyWysiwygRenderEffect.of(renderDoc({ revision: 2 })),
    });
    view.dispatch({
      effects: applyWysiwygRenderEffect.of(renderDoc({ session_id: 9, revision: 3 })),
    });

    expect(parent.querySelector('.markflow-wysiwyg-strong')).toBeNull();
    view.destroy();
    parent.remove();
  });

  it('creates an accessible image widget that reveals the Markdown source range', () => {
    const { view, parent, reveal } = createView();
    const documentWithImage = renderDoc({
      blocks: [
        {
          id: 'b2',
          kind: 'image',
          level: null,
          source_range: { start: 9, end: 24 },
          content_range: { start: 9, end: 24 },
          line_range: { start: 1, end: 2 },
          text: '![alt](img.png)',
          inlines: [
            {
              kind: 'image_reference',
              source_range: { start: 9, end: 24 },
              content_range: { start: 11, end: 14 },
              marker_ranges: [
                { start: 9, end: 11 },
                { start: 14, end: 16 },
                { start: 23, end: 24 },
              ],
              text: 'alt',
              target: 'img.png',
            },
          ],
        },
      ],
    });

    view.dispatch({ effects: applyWysiwygRenderEffect.of(documentWithImage) });
    const widget = parent.querySelector('.markflow-wysiwyg-image-widget') as HTMLButtonElement;

    expect(widget).not.toBeNull();
    expect(widget.getAttribute('aria-label')).toContain('alt');
    widget.click();
    widget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(reveal).toHaveBeenCalledWith({ start: 9, end: 24 });
    expect(reveal).toHaveBeenCalledTimes(2);
    view.destroy();
    parent.remove();
  });

  it('does not create automatic image widgets for large documents by default', () => {
    const { view, parent } = createView();

    view.dispatch({
      effects: applyWysiwygRenderEffect.of(
        renderDoc({
          large_document: true,
          blocks: [
            {
              id: 'b2',
              kind: 'image',
              level: null,
              source_range: { start: 9, end: 24 },
              content_range: { start: 9, end: 24 },
              line_range: { start: 1, end: 2 },
              text: '![alt](img.png)',
              inlines: [],
            },
          ],
        }),
      ),
    });

    expect(parent.querySelector('.markflow-wysiwyg-image-widget')).toBeNull();
    view.destroy();
    parent.remove();
  });

  it('sanitizes unsafe image preview targets', () => {
    expect(sanitizeImagePreviewUrl('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(sanitizeImagePreviewUrl('./images/a.png')).toBe('./images/a.png');
    expect(sanitizeImagePreviewUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeImagePreviewUrl('data:text/html,<script></script>')).toBeNull();
    expect(sanitizeImagePreviewUrl('diagram.svg')).toBeNull();
    expect(sanitizeImagePreviewUrl('x'.repeat(4097))).toBeNull();
  });

  it('computes bounded viewport overscan for large documents', () => {
    const { view, parent } = createView('a'.repeat(50_000));

    const viewport = computeViewportWithOverscan(view, true);

    expect(viewport.start).toBe(0);
    expect(viewport.end).toBeLessThanOrEqual(view.state.doc.length);
    expect(viewport.end).toBeLessThanOrEqual(50_000);
    view.destroy();
    parent.remove();
  });
});
