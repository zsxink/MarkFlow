//! MarkFlow Core M1 document foundation.
//!
//! This crate is intentionally host-independent: no Tauri, DOM, network, or
//! file IO adapters belong here.

pub mod document;
#[cfg(feature = "testing")]
#[cfg(feature = "testing")]
pub mod testing;

pub use document::{
    AffectedRanges, BlockId, BlockKind, BlockNode, BomKind, BulletMarker, ByteOffset,
    CommandResult, ContentHash, CoreError, CoreResult, DeferredWork, Diagnostic, DiagnosticKind,
    DiagnosticSeverity, DiagnosticsReport, DiagnosticsRequest, DiagramFallbackReason,
    DiagramLanguage, DiagramRenderError, DiagramRenderTarget, DiagramTargets,
    DiagramTargetsRequest, DocumentId, DocumentSession, DocumentSizeClass, EditCommand,
    EditCommandRequest, EditOrigin, EncodingKind, ExportAsset, ExportBlock, ExportBlockKind,
    ExportDiagnostic, ExportDiagnosticCode, ExportDiagnosticSeverity, ExportDiagramRenderTarget,
    ExportDocument, ExportFrontMatter, ExportFrontMatterField, ExportMetadata, ExportOptions,
    ExportRange, ExportRequest, ExportTableAlignment, FenceMarker, FenceStyle, FrontMatterCommand,
    FrontMatterCommandRequest, FrontMatterCommandResult, FrontMatterExportFormat, FrontMatterField,
    FrontMatterFormat, FrontMatterModel, FrontMatterTrivia, FrontMatterTriviaKind,
    FrontMatterUnsafeReason, FrontMatterValue, HistoryEntry, HistoryLabel, HistoryStack,
    LargeDocumentPolicy, LineCol, LineEndingKind, LineEndingMap, LineIndex, LineRange, ListKind,
    ListStyleSpan, MissingAssetDiagnostic, OrderedDelimiter, OrderedMarker, OriginalSnapshot,
    OutlineItem, ParseIndex, PatchOutcome, PipePadding, PlannedHistoryPatch, PositionMap,
    QuoteStyleSpan, RenderBlock, RenderBlockKind, RenderDocument, RenderInline, RenderInlineKind,
    RenderRequest, ReplacePreview, ReplacePreviewRequest, ReplaceScope, Revision, SavePayload,
    ScanOutcome, SearchMatch, SearchOptions, SearchPage, SearchRequest, SearchResult, Selection,
    SessionId, SourceByteOffset, SourceOffsetError, SourceRange, StyleMap, TableAlignment,
    TableCell, TableColumn, TableModel, TableModelStyle, TableRow, TableRowRole, TableStyleSpan,
    TextBuffer, TextChange, TextPatch, TransactionId, UiRange, Utf16Offset,
    EXPORT_IR_SCHEMA_VERSION, SEARCH_DEFAULT_PAGE_SIZE, SEARCH_MAX_PAGE_SIZE,
    TRANSACTION_RETRY_WINDOW_CAPACITY,
};
