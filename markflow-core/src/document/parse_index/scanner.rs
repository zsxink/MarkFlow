use super::heading::heading_title;
use super::large_document_policy::LargeDocumentPolicy;
use super::list::starts_task_checkbox;
use super::style_map::{
    BulletMarker, FenceMarker, FenceStyle, ListStyleSpan, OrderedDelimiter, OrderedMarker,
    QuoteStyleSpan, StyleMap, TableStyleSpan,
};
use super::table::{parse_table_delimiter, split_table_cells, TableScan};
use super::types::{
    BlockId, BlockKind, BlockNode, LineRange, OutlineItem, ParseIndex, ScanOutcome,
};
use crate::document::{ByteOffset, LineEndingKind, Revision, SourceRange};

#[derive(Debug, Clone, Copy)]
pub struct LineInfo<'a> {
    pub start: usize,
    pub end: usize,
    pub text: &'a str,
}

impl<'a> LineInfo<'a> {
    pub fn trimmed(&self) -> &'a str {
        self.text.trim()
    }

    pub fn trimmed_start(&self) -> &'a str {
        self.text.trim_start()
    }

    pub fn is_blank(&self) -> bool {
        self.trimmed().is_empty()
    }
}

pub fn collect_lines(text: &str) -> Vec<LineInfo<'_>> {
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

pub fn count_leading_spaces(text: &str) -> usize {
    text.as_bytes()
        .iter()
        .take_while(|byte| **byte == b' ')
        .count()
}

pub fn is_space(byte: u8) -> bool {
    byte == b' ' || byte == b'\t'
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ListMarker {
    pub indent: usize,
    pub bullet: Option<BulletMarker>,
    pub ordered: Option<OrderedMarker>,
    pub task: bool,
}

pub struct BlockScanner<'a> {
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
    pub fn new(
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

    pub fn scan(mut self) -> ScanOutcome {
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
