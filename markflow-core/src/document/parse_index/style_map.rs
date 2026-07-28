use super::types::{BlockId, LineRange};
use crate::document::LineEndingKind;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BulletMarker {
    Dash,
    Asterisk,
    Plus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OrderedMarker {
    pub delimiter: OrderedDelimiter,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrderedDelimiter {
    Dot,
    Paren,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FenceStyle {
    pub marker: FenceMarker,
    pub length: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FenceMarker {
    Backtick,
    Tilde,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ListStyleSpan {
    pub block_id: BlockId,
    pub line_range: LineRange,
    pub bullet: Option<BulletMarker>,
    pub ordered: Option<OrderedMarker>,
    pub task: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QuoteStyleSpan {
    pub block_id: BlockId,
    pub line_range: LineRange,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TableStyleSpan {
    pub block_id: BlockId,
    pub line_range: LineRange,
    pub alignments: Vec<TableAlignment>,
    pub has_leading_pipe: bool,
    pub has_trailing_pipe: bool,
    pub delimiter_padding: Vec<PipePadding>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TableAlignment {
    None,
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PipePadding {
    pub left: bool,
    pub right: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StyleMap {
    pub dominant_line_ending: LineEndingKind,
    pub default_bullet: Option<BulletMarker>,
    pub default_ordered_marker: Option<OrderedMarker>,
    pub default_fence: Option<FenceStyle>,
    pub list_spans: Vec<ListStyleSpan>,
    pub quote_spans: Vec<QuoteStyleSpan>,
    pub table_spans: Vec<TableStyleSpan>,
}
