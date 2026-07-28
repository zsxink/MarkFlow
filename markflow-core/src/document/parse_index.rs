use super::{ByteOffset, LineEndingKind, Revision, SourceRange, TextPatch};

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

    pub fn update_after_patch(&mut self, patch: &TextPatch) -> AffectedRanges {
        let mut ranges = Vec::new();
        let mut requires_background_full_parse = false;
        for change in &patch.changes {
            let affected = self.affected_block_window(change.range.start.0, change.range.end.0);
            let (start, end, structure_sensitive) =
                affected.unwrap_or((change.range.start.0, change.range.end.0, false));
            let end = end.max(change.range.end.0.saturating_add(change.replacement.len()));
            let budgeted_end = end.saturating_add(SYNC_REPARSE_CONTEXT_BYTES);
            if budgeted_end.saturating_sub(start) > SYNC_REPARSE_BUDGET_BYTES
                || structure_sensitive
                || replacement_may_change_block_structure(&change.replacement)
            {
                requires_background_full_parse = true;
            }
            ranges.push(SourceRange {
                revision: patch.base_revision,
                start: ByteOffset(start),
                end: ByteOffset(budgeted_end),
            });
        }

        AffectedRanges {
            revision: patch.base_revision,
            stale_ranges: ranges,
            requires_background_full_parse,
            synchronous_budget_exhausted: requires_background_full_parse,
        }
    }

    fn affected_block_window(&self, start: usize, end: usize) -> Option<(usize, usize, bool)> {
        let mut affected_start = None::<usize>;
        let mut affected_end = None::<usize>;
        let mut structure_sensitive = false;

        for block in self
            .blocks
            .iter()
            .filter(|block| block.kind != BlockKind::Document)
        {
            let block_start = block.range.start.0;
            let block_end = block.range.end.0;
            let intersects = if start == end {
                block_start <= start && start <= block_end
            } else {
                block_start < end && start < block_end
            };
            if !intersects {
                continue;
            }

            affected_start =
                Some(affected_start.map_or(block_start, |current| current.min(block_start)));
            affected_end = Some(affected_end.map_or(block_end, |current| current.max(block_end)));
            structure_sensitive |= block.kind.requires_conservative_reparse();
        }

        Some((affected_start?, affected_end?, structure_sensitive))
    }
}

impl BlockKind {
    fn requires_conservative_reparse(&self) -> bool {
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DocumentSizeClass {
    Normal,
    Large,
    Huge,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeferredWork {
    Immediate,
    OnDemand,
    DisabledByDefault,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LargeDocumentPolicy {
    pub byte_len: usize,
    pub size_class: DocumentSizeClass,
    pub block_scan: DeferredWork,
    pub inline_parse: DeferredWork,
    pub diagram_render: DeferredWork,
    pub image_diagnostics: DeferredWork,
    pub full_diagnostics: DeferredWork,
    pub viewport_render: bool,
    pub paged_search: bool,
}

impl LargeDocumentPolicy {
    pub const LARGE_THRESHOLD_BYTES: usize = 1024 * 1024;
    pub const HUGE_THRESHOLD_BYTES: usize = 10 * 1024 * 1024;

    pub fn for_byte_len(byte_len: usize) -> Self {
        let size_class = if byte_len > Self::HUGE_THRESHOLD_BYTES {
            DocumentSizeClass::Huge
        } else if byte_len > Self::LARGE_THRESHOLD_BYTES {
            DocumentSizeClass::Large
        } else {
            DocumentSizeClass::Normal
        };

        let deferred = match size_class {
            DocumentSizeClass::Normal => DeferredWork::Immediate,
            DocumentSizeClass::Large => DeferredWork::OnDemand,
            DocumentSizeClass::Huge => DeferredWork::DisabledByDefault,
        };

        Self {
            byte_len,
            size_class,
            block_scan: DeferredWork::Immediate,
            inline_parse: deferred,
            diagram_render: deferred,
            image_diagnostics: deferred,
            full_diagnostics: deferred,
            viewport_render: size_class != DocumentSizeClass::Normal,
            paged_search: size_class != DocumentSizeClass::Normal,
        }
    }

    pub fn permits_default_inline_parse(self) -> bool {
        self.inline_parse == DeferredWork::Immediate
    }

    pub fn permits_default_full_diagnostics(self) -> bool {
        self.full_diagnostics == DeferredWork::Immediate
    }
}

const SYNC_REPARSE_CONTEXT_BYTES: usize = 16 * 1024;
const SYNC_REPARSE_BUDGET_BYTES: usize = 256 * 1024;

struct BlockScanner<'a> {
    revision: Revision,
    text: &'a str,
    document_byte_len: usize,
    lines: Vec<LineInfo<'a>>,
    blocks: Vec<BlockNode>,
    outline: Vec<OutlineItem>,
    block_by_line: Vec<BlockId>,
    style_map: StyleMap,
}

impl<'a> BlockScanner<'a> {
    fn new(
        revision: Revision,
        text: &'a str,
        dominant_line_ending: LineEndingKind,
        document_byte_len: usize,
    ) -> Self {
        let lines = collect_lines(text);
        let line_count = lines.len();
        let root = BlockId(0);
        Self {
            revision,
            text,
            document_byte_len,
            lines,
            blocks: Vec::new(),
            outline: Vec::new(),
            block_by_line: vec![root; line_count],
            style_map: StyleMap {
                dominant_line_ending,
                default_bullet: None,
                default_ordered_marker: None,
                default_fence: None,
                list_spans: Vec::new(),
                quote_spans: Vec::new(),
                table_spans: Vec::new(),
            },
        }
    }

    fn scan(mut self) -> ScanOutcome {
        let root_id = self.push_block(
            BlockKind::Document,
            0,
            self.lines.len(),
            ByteOffset(0),
            ByteOffset(self.text.len()),
            None,
        );
        debug_assert_eq!(root_id, BlockId(0));

        let mut line = 0;
        while line < self.lines.len() {
            if self.lines[line].is_blank() {
                line += 1;
                continue;
            }

            if line == 0
                && self.lines[line].trimmed() == "---"
                && self.frontmatter_end(line).is_some()
            {
                line = self.scan_frontmatter(line);
            } else if self.is_html_comment_start(line) {
                line = self.scan_html_comment(line);
            } else if self.fence_start(line).is_some() {
                line = self.scan_code_fence(line);
            } else if self.table_alignment_after(line).is_some() {
                line = self.scan_table(line);
            } else if let Some((level, title_range, title)) = self.heading(line) {
                let id = self.push_line_block(BlockKind::Heading { level }, line);
                self.set_content_range(id, title_range.start.0, title_range.end.0);
                self.outline.push(OutlineItem {
                    block_id: id,
                    level,
                    range: title_range,
                    title,
                });
                line += 1;
            } else if self.is_thematic_break(line) {
                self.push_line_block(BlockKind::ThematicBreak, line);
                line += 1;
            } else if self.is_link_reference(line) {
                self.push_line_block(BlockKind::LinkReference, line);
                line += 1;
            } else if self.is_image_block(line) {
                self.push_line_block(BlockKind::ImageBlock, line);
                line += 1;
            } else if self.is_blockquote(line) {
                line = self.scan_blockquote(line);
            } else if self.list_start(line).is_some() {
                line = self.scan_list(line);
            } else {
                line = self.scan_paragraph(line);
            }
        }

        ScanOutcome {
            large_document_policy: LargeDocumentPolicy::for_byte_len(self.document_byte_len),
            parse_index: ParseIndex {
                revision: self.revision,
                blocks: self.blocks,
                outline: self.outline,
                block_by_line: self.block_by_line,
            },
            style_map: self.style_map,
        }
    }

    fn scan_frontmatter(&mut self, start: usize) -> usize {
        let end = self
            .frontmatter_end(start)
            .expect("frontmatter closing checked by caller");
        let id = self.push_block_from_lines(BlockKind::FrontMatter, start, end);
        let content_start = self.lines[start].end.saturating_add(1).min(self.text.len());
        let has_closing = end > start + 1 && matches!(self.lines[end - 1].trimmed(), "---" | "...");
        let content_end = if has_closing {
            self.lines[end - 1].start.saturating_sub(1)
        } else {
            self.lines[end - 1].end
        };
        self.set_content_range(id, content_start, content_end);
        end
    }

    fn frontmatter_end(&self, start: usize) -> Option<usize> {
        let mut end = start + 1;
        while end < self.lines.len() {
            let trimmed = self.lines[end].trimmed();
            end += 1;
            if trimmed == "---" || trimmed == "..." {
                return Some(end);
            }
        }
        None
    }

    fn scan_html_comment(&mut self, start: usize) -> usize {
        let mut end = start + 1;
        while end < self.lines.len() && !self.lines[end - 1].text.contains("-->") {
            end += 1;
        }
        self.push_block_from_lines(BlockKind::HtmlComment, start, end);
        end
    }

    fn scan_code_fence(&mut self, start: usize) -> usize {
        let fence = self.fence_start(start).expect("checked by caller");
        let mut end = start + 1;
        while end < self.lines.len() {
            if self.closes_fence(end, fence) {
                end += 1;
                break;
            }
            end += 1;
        }
        let id = self.push_block_from_lines(BlockKind::CodeFence, start, end);
        let content_start = self.lines[start].end.saturating_add(1).min(self.text.len());
        let has_closing = end > start + 1 && self.closes_fence(end - 1, fence);
        let content_end = if has_closing {
            self.lines[end - 1].start.saturating_sub(1)
        } else {
            self.lines[end - 1].end
        };
        self.set_content_range(id, content_start, content_end);
        if self.style_map.default_fence.is_none() {
            self.style_map.default_fence = Some(fence);
        }
        self.style_map.list_spans.retain(|span| span.block_id != id);
        end
    }

    fn scan_table(&mut self, start: usize) -> usize {
        let table = self
            .table_alignment_after(start)
            .expect("checked by caller");
        let mut end = start + 2;
        while end < self.lines.len() && !self.lines[end].is_blank() && !self.is_container_break(end)
        {
            if !self.is_table_body_row(end, table.alignments.len()) {
                break;
            }
            end += 1;
        }
        let id = self.push_block_from_lines(BlockKind::Table, start, end);
        self.style_map.table_spans.push(TableStyleSpan {
            block_id: id,
            line_range: LineRange::new(start, end),
            alignments: table.alignments,
            has_leading_pipe: table.has_leading_pipe,
            has_trailing_pipe: table.has_trailing_pipe,
            delimiter_padding: table.delimiter_padding,
        });
        end
    }

    fn is_table_body_row(&self, line: usize, column_count: usize) -> bool {
        let text = self.lines[line].text.trim();
        text.contains('|') && split_table_cells(text).len() == column_count
    }

    fn scan_blockquote(&mut self, start: usize) -> usize {
        let mut end = start + 1;
        while end < self.lines.len() {
            if self.lines[end].is_blank() {
                end += 1;
                continue;
            }
            if !self.is_blockquote(end) {
                break;
            }
            end += 1;
        }
        let id = self.push_block_from_lines(BlockKind::Blockquote, start, end);
        self.style_map.quote_spans.push(QuoteStyleSpan {
            block_id: id,
            line_range: LineRange::new(start, end),
        });
        end
    }

    fn scan_list(&mut self, start: usize) -> usize {
        let marker = self.list_start(start).expect("checked by caller");
        let mut end = start + 1;
        while end < self.lines.len() {
            if self.lines[end].is_blank() {
                if !self.list_continues_after_blank(end + 1, marker) {
                    break;
                }
                end += 1;
                continue;
            }
            let Some(next_marker) = self.list_start(end) else {
                if count_leading_spaces(self.lines[end].text) > marker.indent {
                    end += 1;
                    continue;
                }
                break;
            };
            if next_marker.indent > marker.indent {
                end += 1;
                continue;
            }
            if next_marker != marker {
                break;
            }
            end += 1;
        }
        let kind = if marker.task {
            BlockKind::TaskList
        } else if marker.bullet.is_some() {
            BlockKind::BulletList
        } else {
            BlockKind::OrderedList
        };
        let id = self.push_block_from_lines(kind, start, end);
        if self.style_map.default_bullet.is_none() {
            self.style_map.default_bullet = marker.bullet;
        }
        if self.style_map.default_ordered_marker.is_none() {
            self.style_map.default_ordered_marker = marker.ordered;
        }
        self.style_map.list_spans.push(ListStyleSpan {
            block_id: id,
            line_range: LineRange::new(start, end),
            bullet: marker.bullet,
            ordered: marker.ordered,
            task: marker.task,
        });
        end
    }

    fn list_continues_after_blank(&self, mut line: usize, marker: ListMarker) -> bool {
        while line < self.lines.len() && self.lines[line].is_blank() {
            line += 1;
        }
        if line >= self.lines.len() {
            return false;
        }
        if let Some(next_marker) = self.list_start(line) {
            return next_marker.indent > marker.indent || next_marker == marker;
        }
        count_leading_spaces(self.lines[line].text) > marker.indent
    }

    fn scan_paragraph(&mut self, start: usize) -> usize {
        let mut end = start + 1;
        while end < self.lines.len() {
            if self.lines[end].is_blank() || self.is_block_start(end) {
                break;
            }
            end += 1;
        }
        self.push_block_from_lines(BlockKind::Paragraph, start, end);
        end
    }

    fn push_line_block(&mut self, kind: BlockKind, line: usize) -> BlockId {
        self.push_block_from_lines(kind, line, line + 1)
    }

    fn push_block_from_lines(
        &mut self,
        kind: BlockKind,
        start_line: usize,
        end_line: usize,
    ) -> BlockId {
        let start = self.lines[start_line].start;
        let end = self.lines[end_line - 1].end;
        self.push_block(
            kind,
            start_line,
            end_line,
            ByteOffset(start),
            ByteOffset(end),
            Some(BlockId(0)),
        )
    }

    fn push_block(
        &mut self,
        kind: BlockKind,
        start_line: usize,
        end_line: usize,
        start: ByteOffset,
        end: ByteOffset,
        parent: Option<BlockId>,
    ) -> BlockId {
        let id = BlockId(self.blocks.len());
        let range = SourceRange {
            revision: self.revision,
            start,
            end,
        };
        let block = BlockNode {
            id,
            kind,
            range,
            content_range: range,
            line_range: LineRange::new(start_line, end_line),
            parent,
            children: Vec::new(),
        };
        self.blocks.push(block);
        for line in start_line..end_line.min(self.block_by_line.len()) {
            self.block_by_line[line] = id;
        }
        if let Some(parent) = parent {
            if let Some(parent_block) = self.blocks.get_mut(parent.0) {
                parent_block.children.push(id);
            }
        }
        id
    }

    fn set_content_range(&mut self, id: BlockId, start: usize, end: usize) {
        if let Some(block) = self.blocks.get_mut(id.0) {
            let start = start.min(self.text.len());
            let end = end.min(self.text.len()).max(start);
            block.content_range = SourceRange {
                revision: self.revision,
                start: ByteOffset(start),
                end: ByteOffset(end),
            };
        }
    }

    fn is_block_start(&self, line: usize) -> bool {
        self.is_html_comment_start(line)
            || self.fence_start(line).is_some()
            || self.table_alignment_after(line).is_some()
            || self.heading(line).is_some()
            || self.is_thematic_break(line)
            || self.is_link_reference(line)
            || self.is_image_block(line)
            || self.is_blockquote(line)
            || self.list_start(line).is_some()
    }

    fn is_container_break(&self, line: usize) -> bool {
        self.heading(line).is_some()
            || self.fence_start(line).is_some()
            || self.is_thematic_break(line)
            || self.is_blockquote(line)
            || self.list_start(line).is_some()
    }

    fn heading(&self, line: usize) -> Option<(u8, SourceRange, String)> {
        let line_info = &self.lines[line];
        let indent = count_leading_spaces(line_info.text);
        if indent > 3 {
            return None;
        }
        let rest = &line_info.text[indent..];
        let level = rest
            .as_bytes()
            .iter()
            .take_while(|byte| **byte == b'#')
            .count();
        if !(1..=6).contains(&level) {
            return None;
        }
        let after = rest.as_bytes().get(level).copied();
        if after.is_some_and(|byte| byte != b' ' && byte != b'\t') {
            return None;
        }
        let title_start_relative = indent + level + usize::from(after.is_some());
        let title = heading_title(&line_info.text[title_start_relative..]);
        let title_start = line_info.start + title_start_relative;
        Some((
            level as u8,
            SourceRange {
                revision: self.revision,
                start: ByteOffset(title_start),
                end: ByteOffset(line_info.end),
            },
            title,
        ))
    }

    fn is_html_comment_start(&self, line: usize) -> bool {
        self.lines[line].trimmed_start().starts_with("<!--")
    }

    fn fence_start(&self, line: usize) -> Option<FenceStyle> {
        let trimmed = self.lines[line].trimmed_start();
        let marker = match trimmed.as_bytes().first().copied()? {
            b'`' => FenceMarker::Backtick,
            b'~' => FenceMarker::Tilde,
            _ => return None,
        };
        let byte = match marker {
            FenceMarker::Backtick => b'`',
            FenceMarker::Tilde => b'~',
        };
        let length = trimmed
            .as_bytes()
            .iter()
            .take_while(|item| **item == byte)
            .count();
        if length < 3 {
            return None;
        }
        Some(FenceStyle { marker, length })
    }

    fn closes_fence(&self, line: usize, opening: FenceStyle) -> bool {
        let trimmed = self.lines[line].trimmed_start();
        let marker_byte = match opening.marker {
            FenceMarker::Backtick => b'`',
            FenceMarker::Tilde => b'~',
        };
        let length = trimmed
            .as_bytes()
            .iter()
            .take_while(|byte| **byte == marker_byte)
            .count();
        if length < opening.length {
            return false;
        };
        trimmed[length..].trim().is_empty()
    }

    fn table_alignment_after(&self, line: usize) -> Option<TableScan> {
        let header = self.lines.get(line)?;
        let delimiter = self.lines.get(line + 1)?;
        let table = parse_table_delimiter(delimiter.text)?;
        if !header.text.contains('|') && !delimiter.text.contains('|') {
            return None;
        }
        if split_table_cells(header.text.trim()).len() != table.alignments.len() {
            return None;
        }
        Some(table)
    }

    fn is_thematic_break(&self, line: usize) -> bool {
        let trimmed = self.lines[line].trimmed();
        let mut marker = None;
        let mut count = 0;
        for ch in trimmed.chars() {
            if ch == ' ' || ch == '\t' {
                continue;
            }
            if !matches!(ch, '-' | '*' | '_') {
                return false;
            }
            if let Some(marker) = marker {
                if marker != ch {
                    return false;
                }
            } else {
                marker = Some(ch);
            }
            count += 1;
        }
        count >= 3
    }

    fn is_link_reference(&self, line: usize) -> bool {
        let text = self.lines[line].trimmed_start();
        if !text.starts_with('[') {
            return false;
        }
        let Some(close) = text.find("]:") else {
            return false;
        };
        close > 1 && !text[close + 2..].trim_start().is_empty()
    }

    fn is_image_block(&self, line: usize) -> bool {
        let text = self.lines[line].trimmed();
        text.starts_with("![") && text.contains("](") && text.ends_with(')')
    }

    fn is_blockquote(&self, line: usize) -> bool {
        self.lines[line].trimmed_start().starts_with('>')
    }

    fn list_start(&self, line: usize) -> Option<ListMarker> {
        let text = self.lines[line].text;
        let indent = count_leading_spaces(text);
        if indent > 3 {
            return None;
        }
        let rest = &text[indent..];
        let bytes = rest.as_bytes();
        if bytes.len() >= 2 && matches!(bytes[0], b'-' | b'*' | b'+') && is_space(bytes[1]) {
            let bullet = match bytes[0] {
                b'-' => BulletMarker::Dash,
                b'*' => BulletMarker::Asterisk,
                b'+' => BulletMarker::Plus,
                _ => unreachable!(),
            };
            let after_marker = rest[2..].trim_start();
            return Some(ListMarker {
                indent,
                bullet: Some(bullet),
                ordered: None,
                task: starts_task_checkbox(after_marker),
            });
        }

        let digit_count = bytes
            .iter()
            .take_while(|byte| byte.is_ascii_digit())
            .count();
        if digit_count == 0 || digit_count > 9 || digit_count + 1 >= bytes.len() {
            return None;
        }
        let delimiter = match bytes[digit_count] {
            b'.' => OrderedDelimiter::Dot,
            b')' => OrderedDelimiter::Paren,
            _ => return None,
        };
        if !is_space(bytes[digit_count + 1]) {
            return None;
        }
        Some(ListMarker {
            indent,
            bullet: None,
            ordered: Some(OrderedMarker { delimiter }),
            task: false,
        })
    }
}

#[derive(Debug, Clone, Copy)]
struct LineInfo<'a> {
    start: usize,
    end: usize,
    text: &'a str,
}

impl<'a> LineInfo<'a> {
    fn trimmed(&self) -> &'a str {
        self.text.trim()
    }

    fn trimmed_start(&self) -> &'a str {
        self.text.trim_start()
    }

    fn is_blank(&self) -> bool {
        self.trimmed().is_empty()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ListMarker {
    indent: usize,
    bullet: Option<BulletMarker>,
    ordered: Option<OrderedMarker>,
    task: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TableScan {
    alignments: Vec<TableAlignment>,
    has_leading_pipe: bool,
    has_trailing_pipe: bool,
    delimiter_padding: Vec<PipePadding>,
}

fn collect_lines(text: &str) -> Vec<LineInfo<'_>> {
    if text.is_empty() {
        return vec![LineInfo {
            start: 0,
            end: 0,
            text: "",
        }];
    }

    let mut lines = Vec::new();
    let mut start = 0;
    for (idx, byte) in text.as_bytes().iter().enumerate() {
        if *byte == b'\n' {
            lines.push(LineInfo {
                start,
                end: idx,
                text: &text[start..idx],
            });
            start = idx + 1;
        }
    }
    if start <= text.len() {
        lines.push(LineInfo {
            start,
            end: text.len(),
            text: &text[start..],
        });
    }
    lines
}

fn count_leading_spaces(text: &str) -> usize {
    text.as_bytes()
        .iter()
        .take_while(|byte| **byte == b' ')
        .count()
}

fn is_space(byte: u8) -> bool {
    byte == b' ' || byte == b'\t'
}

fn heading_title(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut start = 0;
    while start < bytes.len() && is_space(bytes[start]) {
        start += 1;
    }

    let mut end = bytes.len();
    while end > start && is_space(bytes[end - 1]) {
        end -= 1;
    }

    if end > start && bytes[end - 1] == b'#' {
        let mut closing_start = end;
        while closing_start > start && bytes[closing_start - 1] == b'#' {
            closing_start -= 1;
        }
        if closing_start == start || is_space(bytes[closing_start - 1]) {
            end = closing_start;
            while end > start && is_space(bytes[end - 1]) {
                end -= 1;
            }
        }
    }

    raw[start..end].to_string()
}

fn starts_task_checkbox(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() >= 3
        && bytes[0] == b'['
        && matches!(bytes[1], b' ' | b'x' | b'X')
        && bytes[2] == b']'
        && bytes.get(3).is_none_or(|byte| is_space(*byte))
}

fn replacement_may_change_block_structure(replacement: &str) -> bool {
    replacement.lines().any(|line| {
        let trimmed = line.trim_start();
        trimmed.starts_with("<!--")
            || starts_with_fence_marker(trimmed, b'`')
            || starts_with_fence_marker(trimmed, b'~')
            || starts_like_list_marker(trimmed)
            || trimmed.starts_with('>')
            || trimmed.contains('|')
    })
}

fn starts_with_fence_marker(trimmed: &str, marker: u8) -> bool {
    trimmed
        .as_bytes()
        .iter()
        .take_while(|byte| **byte == marker)
        .count()
        >= 3
}

fn starts_like_list_marker(trimmed: &str) -> bool {
    let bytes = trimmed.as_bytes();
    if bytes.len() >= 2 && matches!(bytes[0], b'-' | b'*' | b'+') && is_space(bytes[1]) {
        return true;
    }

    let digit_count = bytes
        .iter()
        .take_while(|byte| byte.is_ascii_digit())
        .count();
    digit_count > 0
        && digit_count <= 9
        && digit_count + 1 < bytes.len()
        && matches!(bytes[digit_count], b'.' | b')')
        && is_space(bytes[digit_count + 1])
}

fn parse_table_delimiter(line: &str) -> Option<TableScan> {
    let trimmed = line.trim();
    if !trimmed.contains('-') {
        return None;
    }

    let has_leading_pipe = trimmed.starts_with('|');
    let has_trailing_pipe = trimmed.ends_with('|');
    let cells = split_table_cells(trimmed);
    if cells.is_empty() {
        return None;
    }

    let mut alignments = Vec::new();
    let mut delimiter_padding = Vec::new();
    for cell in cells {
        let left = cell.starts_with(' ');
        let right = cell.ends_with(' ');
        let token = cell.trim();
        if token.len() < 3 {
            return None;
        }
        let bytes = token.as_bytes();
        let starts_colon = bytes.first() == Some(&b':');
        let ends_colon = bytes.last() == Some(&b':');
        let dash_start = usize::from(starts_colon);
        let dash_end = token.len().saturating_sub(usize::from(ends_colon));
        if dash_start >= dash_end
            || !token.as_bytes()[dash_start..dash_end]
                .iter()
                .all(|byte| *byte == b'-')
        {
            return None;
        }
        alignments.push(match (starts_colon, ends_colon) {
            (true, true) => TableAlignment::Center,
            (true, false) => TableAlignment::Left,
            (false, true) => TableAlignment::Right,
            (false, false) => TableAlignment::None,
        });
        delimiter_padding.push(PipePadding { left, right });
    }

    Some(TableScan {
        alignments,
        has_leading_pipe,
        has_trailing_pipe,
        delimiter_padding,
    })
}

fn split_table_cells(trimmed: &str) -> Vec<&str> {
    let without_leading = trimmed.strip_prefix('|').unwrap_or(trimmed);
    let without_outer = without_leading.strip_suffix('|').unwrap_or(without_leading);
    without_outer.split('|').collect()
}
