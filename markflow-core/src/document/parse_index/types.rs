use super::large_document_policy::LargeDocumentPolicy;
use super::style_map::StyleMap;
use crate::document::{Revision, SourceRange};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct BlockId(pub usize);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LineRange {
    pub start: usize,
    pub end: usize,
}

impl LineRange {
    pub fn new(start: usize, end: usize) -> Self {
        Self { start, end }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BlockKind {
    Document,
    FrontMatter,
    HtmlComment,
    Heading { level: u8 },
    Paragraph,
    Blockquote,
    BulletList,
    OrderedList,
    TaskList,
    CodeFence,
    Table,
    LinkReference,
    ImageBlock,
    ThematicBreak,
}

impl BlockKind {
    pub fn requires_conservative_reparse(&self) -> bool {
        matches!(
            self,
            BlockKind::HtmlComment
                | BlockKind::Blockquote
                | BlockKind::BulletList
                | BlockKind::OrderedList
                | BlockKind::TaskList
                | BlockKind::CodeFence
                | BlockKind::Table
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlockNode {
    pub id: BlockId,
    pub kind: BlockKind,
    pub range: SourceRange,
    pub content_range: SourceRange,
    pub line_range: LineRange,
    pub parent: Option<BlockId>,
    pub children: Vec<BlockId>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutlineItem {
    pub block_id: BlockId,
    pub level: u8,
    pub title: String,
    pub range: SourceRange,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseIndex {
    pub revision: Revision,
    pub blocks: Vec<BlockNode>,
    pub outline: Vec<OutlineItem>,
    pub block_by_line: Vec<BlockId>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanOutcome {
    pub parse_index: ParseIndex,
    pub style_map: StyleMap,
    pub large_document_policy: LargeDocumentPolicy,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AffectedRanges {
    pub revision: Revision,
    pub stale_ranges: Vec<SourceRange>,
    pub requires_background_full_parse: bool,
    pub synchronous_budget_exhausted: bool,
}
