//! MarkFlow Core M1 document foundation.
//!
//! This crate is intentionally host-independent: no Tauri, DOM, network, or
//! file IO adapters belong here.

pub mod document;
pub mod testing;

pub use document::{
    AffectedRanges, BlockId, BlockKind, BlockNode, BomKind, BulletMarker, ByteOffset, ContentHash,
    CoreError, CoreResult, DeferredWork, DocumentId, DocumentSession, DocumentSizeClass,
    EncodingKind, FenceMarker, FenceStyle, LargeDocumentPolicy, LineCol, LineEndingKind,
    LineEndingMap, LineIndex, LineRange, ListStyleSpan, OrderedDelimiter, OrderedMarker,
    OriginalSnapshot, OutlineItem, ParseIndex, PatchOutcome, PipePadding, PositionMap,
    QuoteStyleSpan, Revision, SavePayload, ScanOutcome, Selection, SessionId, SourceByteOffset,
    SourceOffsetError, SourceRange, StyleMap, TableAlignment, TableStyleSpan, TextBuffer,
    TextChange, TextPatch, TransactionId, Utf16Offset, TRANSACTION_RETRY_WINDOW_CAPACITY,
};
