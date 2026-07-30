use super::line_scanner::collect_lines;
use super::style_map::{PipePadding, TableAlignment, TableStyleSpan};
use super::types::{BlockId, BlockKind, BlockNode};
use crate::document::{ByteOffset, Revision, SourceRange};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TableScan {
    pub(crate) alignments: Vec<TableAlignment>,
    pub(crate) has_leading_pipe: bool,
    pub(crate) has_trailing_pipe: bool,
    pub(crate) delimiter_padding: Vec<PipePadding>,
    pub(crate) delimiter_lengths: Vec<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TableModel {
    pub block_id: BlockId,
    pub range: SourceRange,
    pub columns: Vec<TableColumn>,
    pub rows: Vec<TableRow>,
    pub style: TableModelStyle,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TableColumn {
    pub index: u32,
    pub alignment: TableAlignment,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TableRow {
    pub role: TableRowRole,
    pub source_range: SourceRange,
    pub cells: Vec<TableCell>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TableRowRole {
    Header,
    Delimiter,
    Body,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TableCell {
    pub column: u32,
    pub value: String,
    pub source_range: SourceRange,
    pub content_range: SourceRange,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TableModelStyle {
    pub has_leading_pipe: bool,
    pub has_trailing_pipe: bool,
    pub delimiter_padding: Vec<PipePadding>,
    pub delimiter_lengths: Vec<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ParsedCell<'a> {
    raw: &'a str,
    value: &'a str,
    raw_start: usize,
    raw_end: usize,
    content_start: usize,
    content_end: usize,
}

pub(crate) fn parse_table_delimiter(line: &str) -> Option<TableScan> {
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
    let mut delimiter_lengths = Vec::new();
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
        delimiter_lengths.push(dash_end - dash_start);
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
        delimiter_lengths,
    })
}

pub(crate) fn split_table_cells(trimmed: &str) -> Vec<&str> {
    parse_cells(trimmed)
        .into_iter()
        .map(|cell| cell.raw)
        .collect()
}

pub(crate) fn table_model_from_block(
    revision: Revision,
    text: &str,
    block: &BlockNode,
    style: &TableStyleSpan,
) -> Option<TableModel> {
    if block.kind != BlockKind::Table || block.id != style.block_id {
        return None;
    }

    let lines = collect_lines(text);
    if block.line_range.end > lines.len()
        || block.line_range.end.saturating_sub(block.line_range.start) < 2
    {
        return None;
    }

    let column_count = style.alignments.len();
    let mut rows = Vec::new();
    for (line_index, line) in lines
        .iter()
        .copied()
        .enumerate()
        .take(block.line_range.end)
        .skip(block.line_range.start)
    {
        let role = if line_index == block.line_range.start {
            TableRowRole::Header
        } else if line_index == block.line_range.start + 1 {
            TableRowRole::Delimiter
        } else {
            TableRowRole::Body
        };
        let parsed = parse_cells(line.text);
        if parsed.len() != column_count {
            return None;
        }

        let cells = parsed
            .into_iter()
            .enumerate()
            .map(|(column, cell)| TableCell {
                column: column as u32,
                value: cell.value.to_string(),
                source_range: SourceRange {
                    revision,
                    start: ByteOffset(line.start + cell.raw_start),
                    end: ByteOffset(line.start + cell.raw_end),
                },
                content_range: SourceRange {
                    revision,
                    start: ByteOffset(line.start + cell.content_start),
                    end: ByteOffset(line.start + cell.content_end),
                },
            })
            .collect();
        rows.push(TableRow {
            role,
            source_range: SourceRange {
                revision,
                start: ByteOffset(line.start),
                end: ByteOffset(line.end),
            },
            cells,
        });
    }

    Some(TableModel {
        block_id: block.id,
        range: block.range,
        columns: style
            .alignments
            .iter()
            .copied()
            .enumerate()
            .map(|(index, alignment)| TableColumn {
                index: index as u32,
                alignment,
            })
            .collect(),
        rows,
        style: TableModelStyle {
            has_leading_pipe: style.has_leading_pipe,
            has_trailing_pipe: style.has_trailing_pipe,
            delimiter_padding: style.delimiter_padding.clone(),
            delimiter_lengths: style.delimiter_lengths.clone(),
        },
    })
}

fn parse_cells(line: &str) -> Vec<ParsedCell<'_>> {
    let Some((trim_start, trim_end)) = trim_range(line) else {
        return Vec::new();
    };
    let delimiter_positions = delimiter_positions(&line[trim_start..trim_end])
        .into_iter()
        .map(|index| trim_start + index)
        .collect::<Vec<_>>();

    let has_leading_pipe = delimiter_positions.first() == Some(&trim_start);
    let has_trailing_pipe = delimiter_positions
        .last()
        .is_some_and(|index| *index + 1 == trim_end);
    let split_positions = delimiter_positions
        .into_iter()
        .filter(|index| !(has_leading_pipe && *index == trim_start))
        .filter(|index| !(has_trailing_pipe && *index + 1 == trim_end))
        .collect::<Vec<_>>();

    let mut cells = Vec::new();
    let mut cell_start = if has_leading_pipe {
        trim_start + 1
    } else {
        trim_start
    };
    let final_end = if has_trailing_pipe {
        trim_end - 1
    } else {
        trim_end
    };

    for split in split_positions {
        cells.push(parsed_cell(line, cell_start, split));
        cell_start = split + 1;
    }
    cells.push(parsed_cell(line, cell_start, final_end));
    cells
}

fn parsed_cell(line: &str, raw_start: usize, raw_end: usize) -> ParsedCell<'_> {
    let (content_start, content_end) = trim_cell_content_range(line, raw_start, raw_end);
    ParsedCell {
        raw: &line[raw_start..raw_end],
        value: &line[content_start..content_end],
        raw_start,
        raw_end,
        content_start,
        content_end,
    }
}

fn trim_range(text: &str) -> Option<(usize, usize)> {
    let start = text
        .char_indices()
        .find_map(|(index, ch)| (!ch.is_whitespace()).then_some(index))?;
    let end = text
        .char_indices()
        .rev()
        .find_map(|(index, ch)| (!ch.is_whitespace()).then_some(index + ch.len_utf8()))?;
    Some((start, end))
}

fn trim_cell_content_range(line: &str, start: usize, end: usize) -> (usize, usize) {
    let mut content_start = end;
    for (index, ch) in line[start..end].char_indices() {
        if !ch.is_whitespace() {
            content_start = start + index;
            break;
        }
    }

    if content_start == end {
        return (end, end);
    }

    let content_end = line[start..end]
        .char_indices()
        .rev()
        .find_map(|(index, ch)| (!ch.is_whitespace()).then_some(start + index + ch.len_utf8()))
        .unwrap_or(end);
    (content_start, content_end)
}

fn delimiter_positions(text: &str) -> Vec<usize> {
    let mut positions = Vec::new();
    let mut escaped = false;
    let mut code_run: Option<usize> = None;
    let mut iter = text.char_indices().peekable();

    while let Some((index, ch)) = iter.next() {
        if escaped {
            escaped = false;
            continue;
        }

        if ch == '\\' {
            escaped = true;
            continue;
        }

        if ch == '`' {
            let mut run_len = 1;
            while let Some((_, '`')) = iter.peek().copied() {
                iter.next();
                run_len += 1;
            }
            match code_run {
                Some(open_len) if open_len == run_len => code_run = None,
                None if has_closing_code_run(text, index + run_len, run_len) => {
                    code_run = Some(run_len);
                }
                _ => {}
            }
            continue;
        }

        if ch == '|' && code_run.is_none() {
            positions.push(index);
        }
    }

    positions
}

fn has_closing_code_run(text: &str, start: usize, run_len: usize) -> bool {
    let mut escaped = false;
    let mut iter = text[start..].char_indices().peekable();
    while let Some((_, ch)) = iter.next() {
        if escaped {
            escaped = false;
            continue;
        }

        if ch == '\\' {
            escaped = true;
            continue;
        }

        if ch != '`' {
            continue;
        }

        let mut closing_len = 1;
        while let Some((_, '`')) = iter.peek().copied() {
            iter.next();
            closing_len += 1;
        }
        if closing_len == run_len {
            return true;
        }
    }

    false
}
