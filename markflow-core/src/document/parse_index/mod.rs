mod heading;
mod update;
mod large_document_policy;
mod list;
mod scanner;
mod style_map;
mod table;
mod types;

use crate::document::{LineEndingKind, Revision};

use scanner::BlockScanner;

pub use large_document_policy::{DeferredWork, DocumentSizeClass, LargeDocumentPolicy};
pub use style_map::{
    BulletMarker, FenceMarker, FenceStyle, ListStyleSpan, OrderedDelimiter, OrderedMarker,
    PipePadding, QuoteStyleSpan, StyleMap, TableAlignment, TableStyleSpan,
};
pub use types::{
    AffectedRanges, BlockId, BlockKind, BlockNode, LineRange, OutlineItem, ParseIndex, ScanOutcome,
};

impl ParseIndex {
    pub fn scan(revision: Revision, text: &str) -> ScanOutcome {
        Self::scan_with_line_ending(revision, text, LineEndingKind::Lf)
    }

    pub fn scan_with_line_ending(
        revision: Revision,
        text: &str,
        dominant_line_ending: LineEndingKind,
    ) -> ScanOutcome {
        Self::scan_with_document_bytes(revision, text, dominant_line_ending, text.len())
    }

    pub fn scan_with_document_bytes(
        revision: Revision,
        text: &str,
        dominant_line_ending: LineEndingKind,
        document_byte_len: usize,
    ) -> ScanOutcome {
        BlockScanner::new(revision, text, dominant_line_ending, document_byte_len).scan()
    }
}
