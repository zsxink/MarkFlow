import { StateEffect, StateField, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import {
  type RenderBlockDto,
  type RenderDocumentDto,
  type UiRangeDto,
  getRenderBlocks,
} from '../../lib/coreBridge';

export interface CoreWysiwygContext {
  sessionId: number | string;
  documentId: number | string;
  revision: number;
  largeDocument?: boolean;
}

export interface CoreWysiwygRenderOptions {
  getContext(): CoreWysiwygContext;
  getLatestRequestId?(): string | null;
  requestRender?: (
    sessionId: number,
    revision: number,
    viewport: UiRangeDto,
    requestId: string,
  ) => Promise<RenderDocumentDto>;
  onRevealSource?: (range: UiRangeDto) => void;
  enableLargeDocumentWidgets?: boolean;
  requestIdFactory?: () => string;
}

interface RenderProjectionState {
  document: RenderDocumentDto | null;
  decorations: DecorationSet;
}

export const applyWysiwygRenderEffect = StateEffect.define<RenderDocumentDto>();

export function createCoreWysiwygRenderExtension(options: CoreWysiwygRenderOptions): Extension {
  let latestRequestId: string | null = null;
  const requestIdFactory = options.requestIdFactory ?? defaultRequestId;
  const requestRender = options.requestRender ?? getRenderBlocks;

  const renderField = StateField.define<RenderProjectionState>({
    create() {
      return { document: null, decorations: Decoration.none };
    },
    update(value, tr) {
      let document = value.document;
      for (const effect of tr.effects) {
        if (effect.is(applyWysiwygRenderEffect)) {
          const next = effect.value;
          if (isCurrentRender(next, options, latestRequestId)) {
            document = next;
          }
        }
      }

      if (!document) {
        return { document: null, decorations: Decoration.none };
      }

      return {
        document,
        decorations: buildRenderDecorations(tr.state, document, options),
      };
    },
    provide: field => EditorView.decorations.from(field, value => value.decorations),
  });

  const requestPlugin = ViewPlugin.fromClass(class {
    private disposed = false;
    private lastViewportKey = '';

    constructor(private readonly view: EditorView) {
      this.requestVisibleRender();
    }

    update(update: ViewUpdate): void {
      if (update.viewportChanged || update.docChanged) {
        this.requestVisibleRender();
      }
    }

    destroy(): void {
      this.disposed = true;
      latestRequestId = null;
    }

    private requestVisibleRender(): void {
      const context = options.getContext();
      const viewport = computeViewportWithOverscan(this.view, context.largeDocument === true);
      const viewportKey = `${context.sessionId}:${context.revision}:${viewport.start}:${viewport.end}`;
      if (viewportKey === this.lastViewportKey) return;
      this.lastViewportKey = viewportKey;

      const sessionId = Number(context.sessionId);
      if (!Number.isFinite(sessionId) || sessionId <= 0) return;

      const requestId = requestIdFactory();
      latestRequestId = requestId;
      void requestRender(sessionId, context.revision, viewport, requestId)
        .then(document => {
          if (this.disposed || !isCurrentRender(document, options, latestRequestId)) return;
          this.view.dispatch({ effects: applyWysiwygRenderEffect.of(document) });
        })
        .catch(() => {
          // Editable source remains the fallback projection.
        });
    }
  });

  return [wysiwygBaseTheme, renderField, requestPlugin];
}

export function buildRenderDecorations(
  viewState: EditorView['state'],
  document: RenderDocumentDto,
  options: Pick<CoreWysiwygRenderOptions, 'onRevealSource' | 'enableLargeDocumentWidgets'> = {},
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const selectionRanges = viewState.selection.ranges.map(range => ({
    start: range.from,
    end: range.to,
  }));

  for (const block of document.blocks) {
    addBlockDecorations(ranges, block, document, options);
    for (const inline of block.inlines) {
      ranges.push(Decoration.mark({
        class: `markflow-wysiwyg-inline markflow-wysiwyg-${inline.kind}`,
      }).range(
        inline.source_range.start,
        inline.source_range.end,
      ));
      const revealMarkers = rangeIntersectsAny(inline.source_range, selectionRanges);
      for (const markerRange of inline.marker_ranges) {
        ranges.push(Decoration.mark({
          class: revealMarkers
            ? 'markflow-wysiwyg-marker markflow-wysiwyg-marker-revealed'
            : 'markflow-wysiwyg-marker markflow-wysiwyg-marker-muted',
        }).range(
          markerRange.start,
          markerRange.end,
        ));
      }
    }
  }

  return Decoration.set(ranges, true);
}

export function computeViewportWithOverscan(view: EditorView, largeDocument: boolean): UiRangeDto {
  const overscan = largeDocument ? 2_000 : 8_000;
  const first = view.visibleRanges[0] ?? { from: 0, to: view.state.doc.length };
  const last = view.visibleRanges[view.visibleRanges.length - 1] ?? first;
  return {
    start: Math.max(0, first.from - overscan),
    end: Math.min(view.state.doc.length, last.to + overscan),
  };
}

export function isCurrentRender(
  document: RenderDocumentDto,
  options: Pick<CoreWysiwygRenderOptions, 'getContext' | 'getLatestRequestId'>,
  latestRequestId: string | null,
): boolean {
  const context = options.getContext();
  const expectedRequestId = options.getLatestRequestId?.() ?? latestRequestId;
  return (
    String(document.session_id) === String(context.sessionId) &&
    String(document.document_id) === String(context.documentId) &&
    document.revision === context.revision &&
    (!expectedRequestId || document.request_id === expectedRequestId)
  );
}

export function sanitizeImagePreviewUrl(target: string | null): string | null {
  if (!target) return null;
  const trimmed = target.trim();
  if (!trimmed || trimmed.length > 4096) return null;
  if (/\.svg(?:$|[?#])/i.test(trimmed)) return null;

  try {
    const parsed = new URL(trimmed, 'https://markflow.local/');
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === 'javascript:' || protocol === 'data:' || protocol === 'vbscript:') return null;
    if (protocol === 'http:' || protocol === 'https:') return trimmed;
  } catch {
    return null;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  return trimmed;
}

class ImagePreviewWidget extends WidgetType {
  constructor(
    private readonly target: string | null,
    private readonly alt: string,
    private readonly sourceRange: UiRangeDto,
    private readonly onRevealSource?: (range: UiRangeDto) => void,
  ) {
    super();
  }

  eq(other: ImagePreviewWidget): boolean {
    return (
      other.target === this.target &&
      other.alt === this.alt &&
      other.sourceRange.start === this.sourceRange.start &&
      other.sourceRange.end === this.sourceRange.end
    );
  }

  toDOM(): HTMLElement {
    const root = document.createElement('button');
    root.type = 'button';
    root.className = 'markflow-wysiwyg-image-widget';
    root.tabIndex = 0;
    root.contentEditable = 'false';
    root.setAttribute('aria-label', `Image preview: ${this.alt || this.target || 'Markdown image'}`);

    if (this.target) {
      const image = document.createElement('img');
      image.alt = this.alt;
      image.src = this.target;
      image.loading = 'lazy';
      root.appendChild(image);
    } else {
      root.textContent = this.alt || 'Image source';
    }

    root.addEventListener('click', () => this.onRevealSource?.(this.sourceRange));
    root.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.onRevealSource?.(this.sourceRange);
      }
    });
    return root;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function addBlockDecorations(
  ranges: Range<Decoration>[],
  block: RenderBlockDto,
  document: RenderDocumentDto,
  options: Pick<CoreWysiwygRenderOptions, 'onRevealSource' | 'enableLargeDocumentWidgets'>,
): void {
  const blockClass = block.level
    ? `markflow-wysiwyg-block markflow-wysiwyg-heading markflow-wysiwyg-heading-${block.level}`
    : `markflow-wysiwyg-block markflow-wysiwyg-${block.kind}`;
  ranges.push(Decoration.line({ class: blockClass }).range(block.source_range.start));

  if (block.kind !== 'image') return;
  if (document.large_document && options.enableLargeDocumentWidgets !== true) return;

  const imageInline = block.inlines.find(inline => inline.kind === 'image_reference');
  const safeTarget = sanitizeImagePreviewUrl(imageInline?.target ?? null);
  const widget = new ImagePreviewWidget(
    safeTarget,
    imageInline?.text ?? '',
    block.source_range,
    options.onRevealSource,
  );
  ranges.push(Decoration.widget({ widget, side: 1 }).range(
    block.source_range.end,
  ));
}

function rangeIntersectsAny(range: UiRangeDto, selectionRanges: UiRangeDto[]): boolean {
  return selectionRanges.some(selection => {
    if (selection.start === selection.end) {
      return selection.start >= range.start && selection.start <= range.end;
    }
    return range.start < selection.end && selection.start < range.end;
  });
}

function defaultRequestId(): string {
  return `wysiwyg_render_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const wysiwygBaseTheme = EditorView.baseTheme({
  '.markflow-wysiwyg-heading': {
    color: 'var(--accent)',
    fontWeight: '700',
  },
  '.markflow-wysiwyg-heading-1': { fontSize: '1.4em' },
  '.markflow-wysiwyg-heading-2': { fontSize: '1.25em' },
  '.markflow-wysiwyg-strong': { fontWeight: '700' },
  '.markflow-wysiwyg-emphasis': { fontStyle: 'italic' },
  '.markflow-wysiwyg-inline_code': {
    fontFamily: 'var(--font-code)',
    backgroundColor: 'var(--surface-muted)',
    borderRadius: '3px',
    padding: '0 3px',
  },
  '.markflow-wysiwyg-link': {
    color: 'var(--accent)',
    textDecoration: 'underline',
  },
  '.markflow-wysiwyg-blockquote': {
    borderLeft: '3px solid var(--border)',
    paddingLeft: '10px',
  },
  '.markflow-wysiwyg-bullet_list, .markflow-wysiwyg-ordered_list, .markflow-wysiwyg-task_list': {
    paddingLeft: '12px',
  },
  '.markflow-wysiwyg-code_fence': {
    fontFamily: 'var(--font-code)',
    backgroundColor: 'var(--surface-muted)',
  },
  '.markflow-wysiwyg-marker-muted': {
    opacity: '0.38',
  },
  '.markflow-wysiwyg-marker-revealed': {
    opacity: '1',
  },
  '.markflow-wysiwyg-image-widget': {
    display: 'block',
    maxWidth: '320px',
    margin: '6px 0',
    padding: '4px',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    background: 'var(--surface)',
    color: 'var(--fg)',
    textAlign: 'left',
  },
  '.markflow-wysiwyg-image-widget img': {
    display: 'block',
    maxWidth: '100%',
    maxHeight: '220px',
  },
});
