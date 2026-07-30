mod edit_command;
mod history;
mod line_ending_map;
mod line_index;
mod parse_index;
mod patch;
mod position_map;
mod render_ir;
mod session;
mod snapshot;
mod text_buffer;
mod types;

pub use edit_command::{CommandResult, EditCommand, EditCommandRequest, EditOrigin, ListKind};
pub use history::{HistoryEntry, HistoryLabel, HistoryStack};
pub use line_ending_map::{LineEndingKind, LineEndingMap};
pub use line_index::{LineCol, LineIndex};
pub use parse_index::{
    AffectedRanges, BlockId, BlockKind, BlockNode, BulletMarker, DeferredWork, DocumentSizeClass,
    FenceMarker, FenceStyle, LargeDocumentPolicy, LineRange, ListStyleSpan, OrderedDelimiter,
    OrderedMarker, OutlineItem, ParseIndex, PipePadding, QuoteStyleSpan, ScanOutcome, StyleMap,
    TableAlignment, TableStyleSpan,
};
pub use patch::{PatchOutcome, Selection, TextChange, TextPatch};
pub use position_map::PositionMap;
pub use render_ir::{
    RenderBlock, RenderBlockKind, RenderDocument, RenderInline, RenderInlineKind, RenderRequest,
    UiRange,
};
pub use session::{
    CoreError, CoreResult, DocumentSession, SavePayload, TRANSACTION_RETRY_WINDOW_CAPACITY,
};
pub use snapshot::{BomKind, ContentHash, EncodingKind, OriginalSnapshot};
pub use text_buffer::TextBuffer;
pub use types::{
    ByteOffset, DocumentId, Revision, SessionId, SourceByteOffset, SourceOffsetError, SourceRange,
    TransactionId, Utf16Offset,
};
