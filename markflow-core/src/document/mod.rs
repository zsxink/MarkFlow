mod line_ending_map;
mod line_index;
mod patch;
mod position_map;
mod session;
mod snapshot;
mod text_buffer;

pub use line_ending_map::{LineEndingKind, LineEndingMap};
pub use line_index::{LineCol, LineIndex};
pub use patch::{PatchOutcome, Selection, TextChange, TextPatch};
pub use position_map::PositionMap;
pub use session::{
    ByteOffset, CoreError, CoreResult, DocumentId, DocumentSession, Revision, SavePayload,
    SessionId, SourceByteOffset, SourceOffsetError, SourceRange, TransactionId, Utf16Offset,
    TRANSACTION_RETRY_WINDOW_CAPACITY,
};
pub use snapshot::{BomKind, ContentHash, EncodingKind, OriginalSnapshot};
pub use text_buffer::TextBuffer;
