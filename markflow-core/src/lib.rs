//! MarkFlow Core M1 document foundation.
//!
//! This crate is intentionally host-independent: no Tauri, DOM, network, or
//! file IO adapters belong here.

pub mod document;
pub mod testing;

pub use document::{
    BomKind, ByteOffset, ContentHash, CoreError, CoreResult, DocumentId, DocumentSession,
    EncodingKind, LineCol, LineEndingKind, LineEndingMap, LineIndex, OriginalSnapshot,
    PatchOutcome, PositionMap, Revision, SavePayload, Selection, SessionId, SourceByteOffset,
    SourceOffsetError, SourceRange, TextBuffer, TextChange, TextPatch, TransactionId, Utf16Offset,
    TRANSACTION_RETRY_WINDOW_CAPACITY,
};
