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
    CommandResult, ContentHash, CoreError, CoreResult, DeferredWork, DocumentId, DocumentSession,
    DocumentSizeClass, EditCommand, EditCommandRequest, EditOrigin, EncodingKind, FenceMarker,
    FenceStyle, HistoryEntry, HistoryLabel, HistoryStack, LargeDocumentPolicy, LineCol,
    LineEndingKind, LineEndingMap, LineIndex, LineRange, ListKind, ListStyleSpan, OrderedDelimiter,
    OrderedMarker, OriginalSnapshot, OutlineItem, ParseIndex, PatchOutcome, PipePadding,
    PlannedHistoryPatch, PositionMap, QuoteStyleSpan, RenderBlock, RenderBlockKind, RenderDocument,
    RenderInline, RenderInlineKind, RenderRequest, Revision, SavePayload, ScanOutcome, Selection,
    SessionId, SourceByteOffset, SourceOffsetError, SourceRange, StyleMap, TableAlignment,
    TableCell, TableColumn, TableModel, TableModelStyle, TableRow, TableRowRole, TableStyleSpan,
    TextBuffer, TextChange, TextPatch, TransactionId, UiRange, Utf16Offset,
    TRANSACTION_RETRY_WINDOW_CAPACITY,
};
