mod diagnostics;
mod diagrams;
mod edit_command;
mod export_ir;
mod frontmatter;
mod history;
mod line_ending_map;
mod line_index;
mod parse_index;
mod patch;
mod position_map;
mod render_ir;
mod search;
mod session;
mod snapshot;
mod text_buffer;
mod types;

pub use diagnostics::{
    Diagnostic, DiagnosticKind, DiagnosticSeverity, DiagnosticsReport, DiagnosticsRequest,
    MissingAssetDiagnostic,
};
pub use diagrams::{
    DiagramFallbackReason, DiagramLanguage, DiagramRenderError, DiagramRenderTarget,
    DiagramTargets, DiagramTargetsRequest,
};
pub use edit_command::{CommandResult, EditCommand, EditCommandRequest, EditOrigin, ListKind};
pub use export_ir::{
    ExportAsset, ExportBlock, ExportBlockKind, ExportDiagnostic, ExportDiagnosticCode,
    ExportDiagnosticSeverity, ExportDiagramRenderTarget, ExportDocument, ExportFrontMatter,
    ExportFrontMatterField, ExportMetadata, ExportOptions, ExportRange, ExportRequest,
    ExportTableAlignment, FrontMatterExportFormat, EXPORT_IR_SCHEMA_VERSION,
};
pub use frontmatter::{
    FrontMatterCommand, FrontMatterCommandRequest, FrontMatterCommandResult, FrontMatterField,
    FrontMatterFormat, FrontMatterModel, FrontMatterTrivia, FrontMatterTriviaKind,
    FrontMatterUnsafeReason, FrontMatterValue,
};
pub use history::{HistoryEntry, HistoryLabel, HistoryStack};
pub use line_ending_map::{LineEndingKind, LineEndingMap};
pub use line_index::{LineCol, LineIndex};
pub use parse_index::{
    AffectedRanges, BlockId, BlockKind, BlockNode, BulletMarker, DeferredWork, DocumentSizeClass,
    FenceMarker, FenceStyle, LargeDocumentPolicy, LineRange, ListStyleSpan, OrderedDelimiter,
    OrderedMarker, OutlineItem, ParseIndex, PipePadding, QuoteStyleSpan, ScanOutcome, StyleMap,
    TableAlignment, TableCell, TableColumn, TableModel, TableModelStyle, TableRow, TableRowRole,
    TableStyleSpan,
};
pub use patch::{PatchOutcome, Selection, TextChange, TextPatch};
pub use position_map::PositionMap;
pub use render_ir::{
    RenderBlock, RenderBlockKind, RenderDocument, RenderInline, RenderInlineKind, RenderRequest,
    UiRange,
};
pub use search::{
    ReplacePreview, ReplacePreviewRequest, ReplaceScope, SearchMatch, SearchOptions, SearchPage,
    SearchRequest, SearchResult, SEARCH_DEFAULT_PAGE_SIZE, SEARCH_MAX_PAGE_SIZE,
};
pub use session::{
    CoreError, CoreResult, DocumentSession, PlannedHistoryPatch, SavePayload,
    TRANSACTION_RETRY_WINDOW_CAPACITY,
};
pub use snapshot::{BomKind, ContentHash, EncodingKind, OriginalSnapshot};
pub use text_buffer::TextBuffer;
pub use types::{
    ByteOffset, DocumentId, Revision, SessionId, SourceByteOffset, SourceOffsetError, SourceRange,
    TransactionId, Utf16Offset,
};
